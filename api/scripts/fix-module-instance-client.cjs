// Apply fix to change modules.module_instance.client_id to INT FK -> app.clients when safe
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const sql = require('mssql');

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
    options: { encrypt: bool(process.env.SQL_ENCRYPT, true), trustServerCertificate: bool(process.env.SQL_TRUST_SERVER_CERTIFICATE, false), enableArithAbort: true },
    pool: { max: Number(process.env.SQL_POOL_MAX || 5), min: Number(process.env.SQL_POOL_MIN || 0), idleTimeoutMillis: Number(process.env.SQL_POOL_IDLE_TIMEOUT_MS || 30000) }
  };
  const pool = await sql.connect(cfg);
  const fixFile = path.resolve(__dirname, '20250907_fix_module_instance_client_fk.sql');
  const content = fs.readFileSync(fixFile, 'utf8');
  const batches = content.split(/\bGO\b/i);
  for (const b of batches) if (b.trim()) await pool.request().query(b);
  // verify
  const verify = await pool.request().query(`SELECT c.name AS col, t.name AS type FROM sys.columns c JOIN sys.types t ON c.user_type_id=t.user_type_id WHERE object_id=OBJECT_ID('modules.module_instance') AND c.name='client_id'`);
  console.log('client_id column type:', verify.recordset[0]?.type);
  process.exit(0);
}

main().catch(e=>{ console.error('fix failed:', e?.message || String(e)); process.exit(1); });
