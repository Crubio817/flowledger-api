// Simple connectivity check using current env loading logic
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const sql = require('mssql');

// load .env from cwd
const r1 = dotenv.config();
// and from likely locations (root .env)
const candidates = [
  // api/.env (if present) first
  path.resolve(__dirname, '../../.env'),
  // project root .env last to override
  path.resolve(__dirname, '../../../.env'),
];
const loaded = [];
for (const p of candidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: true });
    loaded.push(p);
  }
}

async function main() {
  const cfg = {
    server: (process.env.SQL_SERVER || '').replace(/^tcp:/, ''),
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
      encrypt: ['1','true','yes','on'].includes(String(process.env.SQL_ENCRYPT ?? 'true').toLowerCase()),
      trustServerCertificate: ['1','true','yes','on'].includes(String(process.env.SQL_TRUST_SERVER_CERTIFICATE ?? 'false').toLowerCase()),
      enableArithAbort: true,
    },
    pool: {
      max: Number(process.env.SQL_POOL_MAX || 5),
      min: Number(process.env.SQL_POOL_MIN || 0),
      idleTimeoutMillis: Number(process.env.SQL_POOL_IDLE_TIMEOUT_MS || 30000)
    }
  };

  try {
  // Emit a tiny debug of what we loaded and current SQL_USER
  console.error(JSON.stringify({ debug: { loadedEnvFiles: loaded, cwdEnvLoaded: !!r1?.parsed, SQL_USER: process.env.SQL_USER } }, null, 2));
    const pool = await sql.connect(cfg);
    const r = await pool.request().query("SELECT SUSER_SNAME() as login, DB_NAME() as db");
    console.log(JSON.stringify({ status: 'ok', login: r.recordset[0]?.login, db: r.recordset[0]?.db, configuredUser: cfg.user }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(JSON.stringify({ status: 'error', message: e?.message || String(e), configuredUser: cfg.user }, null, 2));
    process.exit(1);
  }
}

main();
