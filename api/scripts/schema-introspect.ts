import { getPool, sql } from '../src/db/pool';

async function main() {
  const pool = await getPool();
  // Collect tables in app schema
  const tables = await pool.request().query(`SELECT t.name AS table_name, s.name AS schema_name
    FROM sys.tables t
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'app'
    ORDER BY t.name`);

  const rows: any[] = [];
  for (const t of tables.recordset) {
    // Primary attempt via sys catalogs
    let cols = await pool.request().input('table', sql.NVarChar(128), t.table_name).query(`SELECT c.name AS column_name, TYPE_NAME(c.user_type_id) AS data_type,
      c.max_length, c.is_nullable, c.column_id
      FROM sys.columns c
      JOIN sys.tables tt ON c.object_id = tt.object_id
      JOIN sys.schemas ss ON tt.schema_id = ss.schema_id
      WHERE ss.name = 'app' AND tt.name = @table
      ORDER BY c.column_id`);
    if (!cols.recordset.length) {
      // Fallback to INFORMATION_SCHEMA (some permission sets may restrict sys.columns visibility)
      cols = await pool.request().input('table', sql.NVarChar(128), t.table_name).query(`SELECT COLUMN_NAME AS column_name,
        DATA_TYPE AS data_type,
        CHARACTER_MAXIMUM_LENGTH AS max_length,
        CASE WHEN IS_NULLABLE='YES' THEN 1 ELSE 0 END AS is_nullable,
        ORDINAL_POSITION AS column_id
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA='app' AND TABLE_NAME=@table
        ORDER BY ORDINAL_POSITION`);
    }
    rows.push({ table: t.table_name, columns: cols.recordset });
  }

  const views = await pool.request().query(`SELECT v.name AS view_name
    FROM sys.views v
    JOIN sys.schemas s ON v.schema_id = s.schema_id
    WHERE s.name = 'app'
    ORDER BY v.name`);

  const procs = await pool.request().query(`SELECT p.name AS proc_name
    FROM sys.procedures p
    JOIN sys.schemas s ON p.schema_id = s.schema_id
    WHERE s.name = 'app'
    ORDER BY p.name`);

  console.log(JSON.stringify({ tables: rows, views: views.recordset, procs: procs.recordset }, null, 2));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
