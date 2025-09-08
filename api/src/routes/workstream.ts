import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, ok, listOk } from '../utils/http';

const router = Router();

/**
 * @openapi
 * /api/workstream/stats:
 *   get:
 *     summary: Workstream stats summary
 *     tags: [Workstream]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Aggregated counts
 */
// GET /workstream/stats
router.get('/stats', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT
        'signals' as category,
        COUNT(*) as count,
        COUNT(CASE WHEN ts > DATEADD(day, -7, SYSUTCDATETIME()) THEN 1 END) as recent_count
      FROM app.signal
      WHERE org_id = @orgId
      UNION ALL
      SELECT
        'candidates',
        COUNT(*),
        COUNT(CASE WHEN created_at > DATEADD(day, -7, SYSUTCDATETIME()) THEN 1 END)
      FROM app.candidate
      WHERE org_id = @orgId
      UNION ALL
      SELECT
        'pursuits',
        COUNT(*),
        COUNT(CASE WHEN created_at > DATEADD(day, -7, SYSUTCDATETIME()) THEN 1 END)
      FROM app.pursuit
      WHERE org_id = @orgId
    `);

  // Transform to key-value pairs for easier frontend consumption
  const stats: Record<string, { total: number; recent: number }> = {};
  result.recordset.forEach(row => {
    stats[row.category] = {
      total: row.count,
      recent: row.recent_count
    };
  });

  ok(res, stats);
}));

/**
 * @openapi
 * /api/workstream/signals:
 *   get:
 *     summary: Workstream signals (paged)
 *     tags: [Workstream]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paged signals
 */
// GET /workstream/signals
router.get('/signals', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT
        signal_id,
        org_id,
        source_type,
        source_ref,
        snippet,
        contact_id,
        client_id,
        ts,
        problem_phrase,
        solution_hint,
        urgency_score,
        dedupe_key,
        cluster_id,
        owner_user_id,
        created_at,
        updated_at
      FROM app.signal
      WHERE org_id = @orgId
      ORDER BY ts DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  // Get total count for pagination
  const countResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT COUNT(*) as total
      FROM app.signal
      WHERE org_id = @orgId
    `);

  listOk(res, result.recordset, {
    page,
    limit,
    total: countResult.recordset[0].total
  });
}));

/**
 * @openapi
 * /api/workstream/today:
 *   get:
 *     summary: Today panel (prioritized work)
 *     tags: [Workstream]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Today panel items
 */
// GET /workstream/today
router.get('/today', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT
        item_type,
        item_id,
        label as title,
        state as status,
        last_touch_at as updated_at,
        due_date,
        sla_metric,
        badge
      FROM app.v_today_panel
      WHERE org_id = @orgId
      ORDER BY
        CASE WHEN badge = 'red' THEN 1
             WHEN badge = 'amber' THEN 2
             ELSE 3 END,
        due_date ASC,
        last_touch_at DESC
    `);

  ok(res, result.recordset);
}));

/**
 * @openapi
 * /api/workstream/candidates:
 *   get:
 *     summary: Workstream candidates (paged)
 *     tags: [Workstream]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paged candidates
 */
// GET /workstream/candidates
router.get('/candidates', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT
        c.candidate_id,
        c.org_id,
        cs.signal_id,
        c.title,
        c.status,
        c.value_band as priority,
        c.one_liner_scope as notes,
        c.created_at,
        c.updated_at,
        s.snippet as signal_snippet,
        s.problem_phrase,
        s.solution_hint,
        s.urgency_score
      FROM app.candidate c
      LEFT JOIN app.candidate_signal cs ON cs.candidate_id = c.candidate_id
      LEFT JOIN app.signal s ON s.signal_id = cs.signal_id AND s.org_id = c.org_id
      WHERE c.org_id = @orgId
      ORDER BY c.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  // Get total count for pagination
  const countResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT COUNT(*) as total
      FROM app.candidate
      WHERE org_id = @orgId
    `);

  listOk(res, result.recordset, {
    page,
    limit,
    total: countResult.recordset[0].total
  });
}));

/**
 * @openapi
 * /api/workstream/pursuits:
 *   get:
 *     summary: Workstream pursuits (paged)
 *     tags: [Workstream]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paged pursuits
 */
// GET /workstream/pursuits
router.get('/pursuits', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT
        p.pursuit_id,
        p.org_id,
        p.candidate_id,
        p.pursuit_stage,
        p.forecast_value_usd as value_estimate,
        p.compliance_score as probability,
        p.due_date,
        p.created_at,
        p.updated_at,
        c.title as candidate_title,
        s.snippet as signal_snippet,
        s.problem_phrase
      FROM app.pursuit p
      LEFT JOIN app.candidate c ON c.candidate_id = p.candidate_id AND c.org_id = p.org_id
      LEFT JOIN app.candidate_signal cs ON cs.candidate_id = c.candidate_id
      LEFT JOIN app.signal s ON s.signal_id = cs.signal_id AND s.org_id = p.org_id
      WHERE p.org_id = @orgId
      ORDER BY p.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  // Get total count for pagination
  const countResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT COUNT(*) as total
      FROM app.pursuit
      WHERE org_id = @orgId
    `);

  listOk(res, result.recordset, {
    page,
    limit,
    total: countResult.recordset[0].total
  });
}));

export default router;
