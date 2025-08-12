import { getPool } from '../src/db/pool';
import { env, assertConfig } from '../src/config/env';

async function main() {
  try {
    assertConfig();
    const pool = await getPool();
    const r = await pool.request().query(
      `SELECT SUSER_SNAME() as login, DB_NAME() as db, CAST(SERVERPROPERTY('ServerName') as nvarchar(128)) as server`
    );
    const row = r.recordset[0];
    console.log(
      JSON.stringify(
        {
          status: 'ok',
          server: row.server || env.sql.server,
          database: row.db,
          login: row.login,
          configuredUser: env.sql.user
        },
        null,
        2
      )
    );
    process.exit(0);
  } catch (e: any) {
    console.error(
      JSON.stringify(
        {
          status: 'error',
          message: e?.message || String(e),
          configuredUser: env.sql.user,
          server: env.sql.server,
          database: env.sql.database
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}

main();
