// Run core/modules schema migration against configured SQL Server
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const sql = require('mssql');

// Load env from common locations
dotenv.config();
for (const p of [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '../../../.env')]) {
  if (fs.existsSync(p)) dotenv.config({ path: p, override: true });
}

function bool(v, d) { return v == null ? d : ['1','true','yes','on'].includes(String(v).toLowerCase()); }

async function main() {
  const cfg = {
    server: (process.env.SQL_SERVER || '').replace(/^tcp:/, ''),
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
      encrypt: bool(process.env.SQL_ENCRYPT, true),
      trustServerCertificate: bool(process.env.SQL_TRUST_SERVER_CERTIFICATE, false),
      enableArithAbort: true,
    },
    pool: { max: Number(process.env.SQL_POOL_MAX || 5), min: Number(process.env.SQL_POOL_MIN || 0), idleTimeoutMillis: Number(process.env.SQL_POOL_IDLE_TIMEOUT_MS || 30000) }
  };

  if (!cfg.server || !cfg.database) {
    console.error('Missing SQL connection settings. Ensure SQL_SERVER and SQL_DATABASE are set.');
    process.exit(2);
  }

  const sqlFile = path.resolve(__dirname, '20250907_add_core_modules.sql');
  if (!fs.existsSync(sqlFile)) {
    console.error('Migration SQL not found at', sqlFile);
    process.exit(3);
  }
  const content = fs.readFileSync(sqlFile, 'utf8');

  try {
    const pool = await sql.connect(cfg);
    const batches = content.split(/\bGO\b/i);
    for (const b of batches) if (b.trim()) await pool.request().query(b);
    console.log('Core/modules schema migration completed successfully');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e?.message || String(e));
    process.exit(1);
  }
}

main();
