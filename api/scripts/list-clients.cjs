// List some client_ids from app.clients
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const sql = require('mssql');

// load .env
const r1 = dotenv.config();
const candidates = [
  path.resolve(__dirname, '../../.env'),
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

    // Query top 5 clients
    const r = await pool.request().query(`
      SELECT TOP 5 client_id, name FROM app.clients ORDER BY client_id
    `);

    console.log('Sample clients:');
    console.log(JSON.stringify(r.recordset, null, 2));

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
