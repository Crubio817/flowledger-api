#!/usr/bin/env node

// run-people-migrations.js
// Script to run the People module migrations

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const sql = require('mssql');

// load .env
const r1 = dotenv.config();
const candidates = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../../.env'),
];
const loaded = [];
for (const p of candidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: true });
    loaded.push(p);
  }
}

async function runMigrations() {
  const cfg = {
    server: (process.env.SQL_SERVER || '').replace(/^tcp:/, ''),
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
      encrypt: ['1','true','yes','on'].includes(String(process.env.SQL_ENCRYPT ?? 'true').toLowerCase()),
      trustServerCertificate: ['1','true','yes','on'].includes(String(process.env.SQL_TRUST_SERVER_CERTIFICATE ?? 'false').toLowerCase()),
      enableArithAbort: true,
      defaultSchema: 'app'
    },
    pool: {
      max: Number(process.env.SQL_POOL_MAX || 5),
      min: Number(process.env.SQL_POOL_MIN || 0),
      idleTimeoutMillis: Number(process.env.SQL_POOL_IDLE_TIMEOUT_MS || 30000)
    }
  };

  const pool = await sql.connect(cfg);
  console.log('Connected to DB.');

  const migrations = [
    '20250909_add_people_core.sql',
    '20250909_add_contracts_billing.sql',
    '20250909_add_constraints_triggers.sql'
  ];

  for (const migration of migrations) {
    console.log(`Running migration: ${migration}`);

    const migrationPath = path.join(__dirname, 'migrations', migration);
    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    try {
      // Split by GO statements (same as existing scripts)
      const batches = sqlContent.split(/^\s*GO\s*$/im).filter(b => b.trim());

      for (const batch of batches) {
        if (batch.trim()) {
          console.log('Executing batch...');
          await pool.request().query(batch);
        }
      }
      console.log(`✅ Migration ${migration} completed successfully`);
    } catch (error) {
      console.error(`❌ Migration ${migration} failed:`, error);
      process.exit(1);
    }
  }

  console.log('🎉 All People module migrations completed!');
  process.exit(0);
}

runMigrations().catch(error => {
  console.error('Migration runner failed:', error);
  process.exit(1);
});
