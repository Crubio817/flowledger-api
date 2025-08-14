import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, ok, listOk } from '../utils/http';

const router = Router();

/**
 * @openapi
 * /api/dashboard-stats:
 *   get:
 *     summary: Get dashboard aggregate stats
 *     tags: [Views]
 *     responses:
 *       200:
 *         description: Stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   $ref: '#/components/schemas/DashboardStats'
 */
router.get(
  '/dashboard-stats',
  asyncHandler(async (_req, res) => {
    const pool = await getPool();
    const result = await pool.request().query(
      `SELECT active_clients, audits_in_progress, sipocs_completed, pending_interviews
       FROM app.v_dashboard_stats`
    );
    ok(res, result.recordset[0] || {});
  })
);

/**
 * @openapi
 * /api/audit-recent-touch:
 *   get:
 *     summary: List recent audit activity
 *     tags: [Views]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Recent audits
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/RecentAudit' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 */
router.get(
  '/audit-recent-touch',
  asyncHandler(async (req, res) => {
  const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const pool = await getPool();
    const result = await pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(
        `SELECT audit_id, client_id, title, status, last_touched_utc
         FROM app.v_audit_recent_touch
         ORDER BY last_touched_utc DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
  listOk(res, result.recordset, { page, limit });
  })
);

/**
 * @openapi
 * /api/clients-overview:
 *   get:
 *     summary: List clients overview (aggregated stats & metadata)
 *     tags: [Views]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Clients overview list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/ClientsOverviewItem' }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 */
router.get(
  '/clients-overview',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const pool = await getPool();
    const result = await pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(
        `SELECT client_id, client_name, is_active, created_utc, primary_contact_name, primary_contact_email,
                tags, engagement_count, pending_onboarding_tasks, last_activity_utc
         FROM app.vw_clients_overview
         ORDER BY client_id
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
    listOk(res, result.recordset, { page, limit });
  })
);

export default router;
