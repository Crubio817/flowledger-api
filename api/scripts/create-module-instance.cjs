// Create module_instance table if missing
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

    // Check if module_instance exists
    const check = await pool.request().query(`
      SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
      WHERE s.name = 'modules' AND t.name = 'module_instance'
    `);

    if (check.recordset.length > 0) {
      console.log('module_instance table already exists.');
    } else {
      // Create the table
      await pool.request().query(`
        CREATE TABLE modules.module_instance (
          module_instance_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_modules_module_instance_id DEFAULT NEWID() PRIMARY KEY,
          module_id UNIQUEIDENTIFIER NOT NULL,
          module_version_id UNIQUEIDENTIFIER NULL,
          client_id BIGINT NOT NULL,
          is_enabled BIT NOT NULL CONSTRAINT DF_modules_module_instance_is_enabled DEFAULT 1,
          created_at DATETIME2(3) NOT NULL CONSTRAINT DF_modules_module_instance_created_at DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_modules_module_instance_module FOREIGN KEY (module_id) REFERENCES modules.module(module_id),
          CONSTRAINT FK_modules_module_instance_version FOREIGN KEY (module_version_id) REFERENCES modules.module_version(module_version_id),
          CONSTRAINT FK_modules_module_instance_client FOREIGN KEY (client_id) REFERENCES app.clients(client_id)
        );
        CREATE INDEX IX_modules_module_instance_module ON modules.module_instance(module_id);
        CREATE INDEX IX_modules_module_instance_client ON modules.module_instance(client_id);
      `);
      console.log('module_instance table created.');
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
