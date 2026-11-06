// Vercel serverless entry for the AKYOTO store.
// Static pages in /public are served by Vercel directly; everything under /api/* and /uploads/* lands here.
// Needs an EXTERNAL MySQL database (Vercel has no persistent disk). Uploaded images are stored in that same database.
import { handle } from 'hono/vercel';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { createApp } from '../src/app.mjs';

const env = process.env;
if (!env.DB_HOST || !env.DB_NAME) throw new Error('Set DB_HOST, DB_NAME, DB_USER and DB_PASS in Vercel -> Settings -> Environment Variables.');

const norm = (params = []) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
const useSsl = String(env.DB_SSL ?? 'true') !== 'false';

const pool = mysql.createPool({
  host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASS ?? env.DB_PASSWORD, database: env.DB_NAME,
  waitForConnections: true, connectionLimit: Number(env.DB_POOL || 2), charset: 'utf8mb4', decimalNumbers: true, supportBigNumbers: true,
  ssl: useSsl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
});

const db = {
  dialect: 'mysql',
  async all(sql, params) { const [rows] = await pool.query(sql, norm(params)); return rows; },
  async get(sql, params) { const [rows] = await pool.query(sql, norm(params)); return rows[0] || null; },
  async run(sql, params) { const [r] = await pool.query(sql, norm(params)); return { lastId: r.insertId, changes: r.affectedRows }; },
};

// Uploaded product images live in a MySQL table (Vercel's disk is read-only / temporary).
let uploadsReady = null;
const ensureUploads = () => (uploadsReady ||= db.run(
  'CREATE TABLE IF NOT EXISTS uploads (k VARCHAR(191) PRIMARY KEY, mime VARCHAR(60), data LONGBLOB) DEFAULT CHARSET=utf8mb4'
).catch((e) => { uploadsReady = null; throw e; }));

const storage = {
  async put(key, bytes, mime) {
    await ensureUploads();
    await db.run('REPLACE INTO uploads (k, mime, data) VALUES (?,?,?)', [key, mime || 'application/octet-stream', Buffer.from(bytes)]);
  },
  async get(key) {
    await ensureUploads();
    const r = await db.get('SELECT mime, data FROM uploads WHERE k = ?', [key]);
    return r ? { body: r.data, contentType: r.mime } : null;
  },
};

const readSeed = (f) => JSON.parse(fs.readFileSync(new URL('../seed/' + f, import.meta.url), 'utf8'));
const seed = { products: readSeed('products.json'), ...readSeed('seed.json') };

const app = createApp({ db, storage, env, seed });

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
export const OPTIONS = handle(app);
export const HEAD = handle(app);
