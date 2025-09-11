import express from 'express';
import spotlightsRouter from '../src/routes/spotlights';
import { getPool } from '../src/db/pool';

const app = express();
app.use(express.json());
app.use('/api/spotlights', spotlightsRouter);

async function testEndpoints() {
  console.log('Testing Spotlight endpoints...');

  // Test domains endpoint
  try {
    const pool = await getPool();
    const domainsResult = await pool.request()
      .input('orgId', 1)
      .query(`
        SELECT DISTINCT domain
        FROM app.spotlights
        WHERE org_id = @orgId AND domain IS NOT NULL AND domain != ''
        ORDER BY domain
      `);

    console.log('Domains endpoint result:', domainsResult.recordset.map(row => row.domain));

    // Test performance endpoint
    const performanceResult = await pool.request()
      .input('spotlightId', 1)
      .input('orgId', 1)
      .query(`
        SELECT s.spotlight_id, s.name, s.domain, s.active,
               COUNT(DISTINCT sv.field_id) as configured_fields,
               COUNT(DISTINCT CASE WHEN sv.field_value IS NOT NULL THEN sv.field_id END) as populated_fields
        FROM app.spotlights s
        LEFT JOIN app.spotlight_values sv ON s.spotlight_id = sv.spotlight_id
        WHERE s.spotlight_id = @spotlightId AND s.org_id = @orgId
        GROUP BY s.spotlight_id, s.name, s.domain, s.active
      `);

    console.log('Performance spotlight info:', performanceResult.recordset[0]);

    // Test evaluation history
    const evaluationResult = await pool.request()
      .input('spotlightId', 1)
      .input('orgId', 1)
      .query(`
        SELECT TOP 10
               JSON_VALUE(payload_json, '$.match_score') as match_score,
               happened_at
        FROM app.work_event
        WHERE item_type = 'spotlight'
          AND item_id = @spotlightId
          AND org_id = @orgId
          AND event_name = 'spotlight.evaluated'
        ORDER BY happened_at DESC
      `);

    console.log('Evaluation history:', evaluationResult.recordset);

  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

testEndpoints();
