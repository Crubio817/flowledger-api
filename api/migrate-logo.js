const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.SQL_SERVER || 'localhost',
  database: process.env.SQL_DATABASE || 'flowledger_dev',
  user: process.env.SQL_USER || 'sa',
  password: process.env.SQL_PASSWORD || '',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};

async function runMigration() {
  try {
    await sql.connect(config);
    const result = await sql.query`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app.clients') AND name = 'logo_url')
      BEGIN
          ALTER TABLE app.clients ADD logo_url NVARCHAR(512) NULL;
          SELECT 'Added logo_url column to app.clients' as message;
      END
      ELSE
      BEGIN
          SELECT 'logo_url column already exists' as message;
      END
    `;
    console.log('Migration result:', result.recordset[0]);
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await sql.close();
  }
}

runMigration();
