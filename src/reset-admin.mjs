// Reset the admin login:  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='NewStrongPass' npm run reset-admin
import 'dotenv/config';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.mjs';
import { hashPassword } from './app.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const email = (process.env.ADMIN_EMAIL || 'admin@akyotosecure.com').toLowerCase();
const pass = process.env.ADMIN_PASSWORD;
if (!pass || pass.length < 8) { console.log('Set ADMIN_PASSWORD (8+ characters).'); process.exit(1); }
const db = await createDb({ root: ROOT, env: process.env });
const { hash, salt } = await hashPassword(pass);
await db.run('DELETE FROM admins');
await db.run('INSERT INTO admins (email, pass_hash, salt, created_at) VALUES (?,?,?,?)', [email, hash, salt, new Date().toISOString()]);
console.log('Admin login reset for', email);
setTimeout(() => process.exit(0), 400);
