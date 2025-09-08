// List all tables in modules and app schemas
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
    const pool = await sql.connect(cfg);
    console.log('Connected to DB.');

    // Query all tables in modules and app schemas
    const r = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA IN ('modules', 'app') AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);

    console.log('Tables in modules and app schemas:');
    console.log(JSON.stringify(r.recordset, null, 2));

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
