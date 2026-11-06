// AKYOTO Store — Node.js server (Hostinger Node.js app, any VPS, Render, Railway…)
import 'dotenv/config';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app.mjs';
import { createDb } from './db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const UPLOAD_DIR = path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', ico: 'image/x-icon', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8', xml: 'application/xml' };

const storage = {
  async put(key, bytes) { fs.writeFileSync(path.join(UPLOAD_DIR, path.basename(key)), bytes); },
  async get(key) {
    const f = path.join(UPLOAD_DIR, path.basename(key));
    if (!fs.existsSync(f)) return null;
    return { body: fs.readFileSync(f), contentType: TYPES[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream' };
  },
};

const db = await createDb({ root: ROOT, env: process.env });
const seed = {
  products: JSON.parse(fs.readFileSync(path.join(ROOT, 'seed/products.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(ROOT, 'seed/seed.json'), 'utf8')),
};
const app = createApp({ db, storage, env: process.env, seed });

// static files with clean URLs: /shop -> public/shop.html, /admin/ -> public/admin/index.html
app.get('*', (c) => {
  let p = decodeURIComponent(new URL(c.req.url).pathname);
  if (p.includes('..')) return c.text('Bad request', 400);
  if (p.endsWith('/')) p += 'index.html';
  let f = path.join(PUBLIC, p);
  if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  if (fs.existsSync(f) && fs.statSync(f).isDirectory() && fs.existsSync(path.join(f, 'index.html'))) return c.redirect(p + '/');
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return c.html(fs.readFileSync(path.join(PUBLIC, '404.html'), 'utf8'), 404);
  const ext = path.extname(f).slice(1).toLowerCase();
  const cache = ext === 'html' ? 'no-cache' : p.startsWith('/img/') ? 'public, max-age=604800' : 'public, max-age=3600';
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cache } });
});

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port }, () => console.log(`AKYOTO store running on port ${port} — storefront /  ·  admin /admin/`));
