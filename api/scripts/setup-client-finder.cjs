// Insert client_finder module data
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

    // Check if module exists
    let moduleResult = await pool.request().query(`
      SELECT module_id FROM modules.module WHERE [key] = 'client_finder'
    `);
    let moduleId;
    if (moduleResult.recordset.length > 0) {
      moduleId = moduleResult.recordset[0].module_id;
      console.log('Module exists, ID:', moduleId);
      // Update color if not set
      await pool.request().query(`
        UPDATE modules.module SET color = '#28a745' WHERE module_id = '${moduleId}' AND color IS NULL
      `);
    } else {
      // Insert into modules.module
      const insertResult = await pool.request().query(`
        INSERT INTO modules.module ([key], name, scope, color)
        OUTPUT INSERTED.module_id
        VALUES ('client_finder', 'Client Finder', 'hybrid', '#28a745')
      `);
      moduleId = insertResult.recordset[0].module_id;
      console.log('Module inserted, ID:', moduleId);
    }

    // Check if version exists
    let versionResult = await pool.request().query(`
      SELECT module_version_id FROM modules.module_version WHERE module_id = '${moduleId}' AND semver = '1.0.0'
    `);
    let versionId;
    if (versionResult.recordset.length > 0) {
      versionId = versionResult.recordset[0].module_version_id;
      console.log('Version exists, ID:', versionId);
    } else {
      // Insert into modules.module_version
      versionResult = await pool.request().query(`
        INSERT INTO modules.module_version (module_id, semver, status)
        OUTPUT INSERTED.module_version_id
        VALUES ('${moduleId}', '1.0.0', 'released')
      `);
      versionId = versionResult.recordset[0].module_version_id;
      console.log('Version inserted, ID:', versionId);
    }

    // Insert into modules.module_instance (use client_id=7)
    const instanceResult = await pool.request().query(`
      INSERT INTO modules.module_instance (module_id, module_version_id, client_id, is_enabled)
      OUTPUT INSERTED.module_instance_id
      VALUES ('${moduleId}', '${versionId}', 7, 1)
    `);
    const instanceId = instanceResult.recordset[0].module_instance_id;
    console.log('Instance inserted, ID:', instanceId);

    // Insert into modules.module_config
    await pool.request().query(`
      INSERT INTO modules.module_config (module_instance_id, cfg_json, is_active)
      VALUES ('${instanceId}', '{"search_fields": ["name", "email"], "max_results": 50}', 1)
    `);
    console.log('Config inserted.');

    console.log('Client Finder module setup complete.');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
