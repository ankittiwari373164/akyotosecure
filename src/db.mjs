// Database adapters for Node: MySQL (mysql2) when DB_HOST/DB_NAME are set, otherwise a zero-config
// pure-JavaScript SQLite file (sql.js) at data/akyoto.sqlite. No native modules either way.
import fs from 'node:fs';
import path from 'node:path';

const norm = (params = []) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export async function createDb({ root, env }) {
  if (env.DB_HOST && env.DB_NAME) {
    const mysql = (await import('mysql2/promise')).default;
    const pool = mysql.createPool({
      host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASS ?? env.DB_PASSWORD, database: env.DB_NAME,
      waitForConnections: true, connectionLimit: Number(env.DB_POOL || 5), charset: 'utf8mb4', decimalNumbers: true, supportBigNumbers: true,
    });
    await pool.query('SELECT 1');
    console.log(`Database: MySQL ${env.DB_USER}@${env.DB_HOST}/${env.DB_NAME}`);
    return {
      dialect: 'mysql',
      async all(sql, params) { const [rows] = await pool.query(sql, norm(params)); return rows; },
      async get(sql, params) { const [rows] = await pool.query(sql, norm(params)); return rows[0] || null; },
      async run(sql, params) { const [r] = await pool.query(sql, norm(params)); return { lastId: r.insertId, changes: r.affectedRows }; },
    };
  }
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const dir = path.resolve(root, env.DATA_DIR || 'data');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'akyoto.sqlite');
  const sdb = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  let timer = null;
  const save = () => { clearTimeout(timer); timer = setTimeout(flush, 150); };
  const flush = () => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, Buffer.from(sdb.export())); fs.renameSync(tmp, file); };
  process.on('exit', () => { try { clearTimeout(timer); flush(); } catch {} });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
  const query = (sql, params) => {
    const st = sdb.prepare(sql);
    try { st.bind(norm(params)); const rows = []; while (st.step()) rows.push(st.getAsObject()); return rows; } finally { st.free(); }
  };
  console.log(`Database: built-in SQLite file ${file} (set DB_HOST/DB_NAME to use MySQL)`);
  return {
    dialect: 'sqlite',
    async all(sql, params) { return query(sql, params); },
    async get(sql, params) { return query(sql, params)[0] || null; },
    async run(sql, params) {
      sdb.run(sql, norm(params));
      const changes = sdb.getRowsModified();
      const id = query('SELECT last_insert_rowid() AS id')[0].id;
      save();
      return { lastId: id, changes };
    },
  };
}
