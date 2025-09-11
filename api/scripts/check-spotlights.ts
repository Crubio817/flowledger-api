import { getPool } from '../src/db/pool';

async function main() {
  try {
    const pool = await getPool();
    const r = await pool.request().query(
      `SELECT COUNT(*) as count FROM app.spotlights WHERE org_id = 1`
    );
    const count = r.recordset[0].count;
    console.log(`Found ${count} spotlights for org_id=1`);

    if (count > 0) {
      const spotlights = await pool.request().query(
        `SELECT TOP 5 spotlight_id, name, domain FROM app.spotlights WHERE org_id = 1`
      );
      console.log('Sample spotlights:', spotlights.recordset);
    }

    process.exit(0);
  } catch (e: any) {
    console.error('Error:', e?.message || String(e));
    process.exit(1);
  }
}

main();
