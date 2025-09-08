const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const sql = require('mssql');

dotenv.config({ path: path.resolve(__dirname, '.env'), override: true });

async function runEngagementsMigration() {
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
    console.log('Connecting to database...');
    const pool = await sql.connect(cfg);
    console.log('✅ Connected successfully');

    const sqlFile = path.resolve(__dirname, 'scripts', 'engagements-migration.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf8');

    console.log('Running corrected engagements migration...');

    // Split by semicolons and execute each statement
    const statements = sqlContent.split(';').filter(stmt => stmt.trim().length > 0);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (stmt && !stmt.startsWith('--')) {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        try {
          await pool.request().query(stmt);
        } catch (batchError) {
          console.log(`⚠️  Statement ${i + 1} warning: ${batchError.message}`);
        }
      }
    }

    console.log('✅ Engagements migration completed');

    // Verify tables were created
    const result = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'app'
      AND TABLE_NAME IN (
        'engagement', 'feature', 'story_task', 'audit_path', 'audit_step',
        'job_task', 'milestone', 'dependency', 'change_request', 'evidence_link'
      )
      ORDER BY TABLE_NAME
    `);

    console.log('📋 New engagement tables created:');
    result.recordset.forEach(row => console.log(`✅ ${row.TABLE_NAME}`));

    if (result.recordset.length === 0) {
      console.log('❌ No new tables were created');
    }

  } catch (e) {
    console.error('❌ Migration failed:', e?.message || String(e));
  } finally {
    await sql.close();
  }
}

runEngagementsMigration();
