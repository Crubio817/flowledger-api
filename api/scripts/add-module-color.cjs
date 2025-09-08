// Alter modules.module to add color column
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

    // Check if color column exists
    const check = await pool.request().query(`
      SELECT 1 FROM sys.columns c
      JOIN sys.tables t ON t.object_id = c.object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      WHERE s.name = 'modules' AND t.name = 'module' AND c.name = 'color'
    `);

    if (check.recordset.length > 0) {
      console.log('Color column already exists.');
    } else {
      // Add color column
      await pool.request().query(`
        ALTER TABLE modules.[module] ADD color VARCHAR(7) NULL DEFAULT '#007bff'
      `);
      console.log('Color column added.');
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
