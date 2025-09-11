import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { PursuitCreateBody, PursuitUpdateBody } from '../validation/schemas';
import { logActivity } from '../utils/activity';
import { pursuitMemory } from '../utils/memory';

const router = Router();

/**
 * @openapi
 * /api/pursuits:
 *   get:
 *     summary: List pursuits
 *     tags: [Pursuits]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *       - in: query
 *         name: stage
 *         schema: { type: string, enum: [qual, pink, red, submit, won, lost] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Pursuits list
 *   post:
 *     summary: Create pursuit
 *     tags: [Pursuits]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [org_id, candidate_id, pursuit_stage]
 *             properties:
 *               org_id: { type: integer }
 *               candidate_id: { type: integer }
 *               pursuit_stage: { type: string }
 *     responses:
 *       201:
 *         description: Pursuit created
 * /api/pursuits/{pursuit_id}:
 *   get:
 *     summary: Get pursuit
 *     tags: [Pursuits]
 *     parameters:
 *       - in: path
 *         name: pursuit_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Pursuit
 *   put:
 *     summary: Update pursuit
 *     tags: [Pursuits]
 *     parameters:
 *       - in: path
 *         name: pursuit_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200:
 *         description: Updated pursuit
 *   delete:
 *     summary: Delete pursuit
 *     tags: [Pursuits]
 *     parameters:
 *       - in: path
 *         name: pursuit_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Delete result
 */

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const orgId = req.query.org_id ? Number(req.query.org_id) : null;
    const stage = req.query.stage as string;
    const pool = await getPool();

    // Optimized query for board view - minimal fields for snappy UI
    let query = `SELECT
      p.pursuit_id as id,
      c.title,
      c.one_liner_scope,
      p.pursuit_stage as stage,
      p.due_date,
      p.updated_at as last_touch_at,
      -- SLA badge: days since last touch or overdue status
      CASE
        WHEN p.due_date < SYSUTCDATETIME() THEN 'overdue'
        WHEN DATEDIFF(day, p.updated_at, SYSUTCDATETIME()) > 7 THEN 'stale'
        ELSE NULL
      END as sla_badge,
      -- Has threads/docs
      CASE WHEN EXISTS(SELECT 1 FROM app.work_item_link l WHERE l.item_type='pursuit' AND l.item_id=p.pursuit_id) THEN 1 ELSE 0 END as has_threads,
      CASE WHEN EXISTS(SELECT 1 FROM app.work_item_link l WHERE l.item_type='pursuit' AND l.item_id=p.pursuit_id AND l.link_type='doc') THEN 1 ELSE 0 END as has_docs
      FROM app.pursuit p
      JOIN app.candidate c ON p.candidate_id = c.candidate_id AND p.org_id = c.org_id`;

    const request = pool.request();
    if (orgId) {
      query += ' WHERE p.org_id = @orgId';
      request.input('orgId', sql.Int, orgId);
    }
    if (stage) {
      query += orgId ? ' AND p.pursuit_stage = @stage' : ' WHERE p.pursuit_stage = @stage';
      request.input('stage', sql.VarChar(8), stage);
    }
    query += ' ORDER BY p.due_date ASC, p.updated_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
    request.input('offset', sql.Int, offset).input('limit', sql.Int, limit);
    const result = await request.query(query);
    listOk(res, result.recordset, { page, limit });
  })
);

router.get(
  '/:pursuit_id',
  asyncHandler(async (req, res) => {
    const pursuitId = Number(req.params.pursuit_id);
    if (!Number.isInteger(pursuitId) || pursuitId <= 0) return badRequest(res, 'pursuit_id must be a positive integer');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.BigInt, pursuitId).query(
      `SELECT pursuit_id, org_id, candidate_id, due_date, capture_lead_id, proposal_mgr_id, pursuit_stage, compliance_score, forecast_value_usd, cos_hours, cos_amount, created_at, updated_at
       FROM app.pursuit WHERE pursuit_id = @id`
    );
    const row = result.recordset[0];
    if (!row) return notFound(res);
    ok(res, row);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = PursuitCreateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();
    const request = pool.request()
      .input('org_id', sql.Int, data.org_id)
      .input('candidate_id', sql.BigInt, data.candidate_id)
      .input('due_date', sql.Date, data.due_date || null)
      .input('capture_lead_id', sql.Int, data.capture_lead_id || null)
      .input('proposal_mgr_id', sql.Int, data.proposal_mgr_id || null)
      .input('pursuit_stage', sql.VarChar(8), data.pursuit_stage)
      .input('compliance_score', sql.Decimal(4,1), data.compliance_score || null)
      .input('forecast_value_usd', sql.Decimal(18,2), data.forecast_value_usd || null)
      .input('cos_hours', sql.Decimal(10,2), data.cos_hours || null)
      .input('cos_amount', sql.Decimal(18,2), data.cos_amount || null);
    const result = await request.query(`
      INSERT INTO app.pursuit (org_id, candidate_id, due_date, capture_lead_id, proposal_mgr_id, pursuit_stage, compliance_score, forecast_value_usd, cos_hours, cos_amount)
      OUTPUT INSERTED.pursuit_id, INSERTED.org_id, INSERTED.candidate_id, INSERTED.due_date, INSERTED.capture_lead_id, INSERTED.proposal_mgr_id, INSERTED.pursuit_stage, INSERTED.compliance_score, INSERTED.forecast_value_usd, INSERTED.cos_hours, INSERTED.cos_amount, INSERTED.created_at, INSERTED.updated_at
      VALUES (@org_id, @candidate_id, @due_date, @capture_lead_id, @proposal_mgr_id, @pursuit_stage, @compliance_score, @forecast_value_usd, @cos_hours, @cos_amount)
    `);
    const created = result.recordset[0];
    await logActivity({ type: 'PursuitCreated', title: `Pursuit ${created.pursuit_id} created`, client_id: null, signal_id: created.pursuit_id }); // Adjust
    
    // Create memory atom for pursuit creation
    await pursuitMemory.created(data.org_id, created.pursuit_id, data.candidate_id, data.pursuit_stage);
    
    ok(res, created, 201);
  })
);

router.put(
  '/:pursuit_id',
  asyncHandler(async (req, res) => {
    const pursuitId = Number(req.params.pursuit_id);
    if (!Number.isInteger(pursuitId) || pursuitId <= 0) return badRequest(res, 'pursuit_id must be a positive integer');
    const parsed = PursuitUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const data = parsed.data;
    const sets: string[] = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.BigInt, pursuitId);
    if (data.due_date !== undefined) { sets.push('due_date = @due_date'); request.input('due_date', sql.Date, data.due_date); }
    if (data.capture_lead_id !== undefined) { sets.push('capture_lead_id = @capture_lead_id'); request.input('capture_lead_id', sql.Int, data.capture_lead_id); }
    if (data.proposal_mgr_id !== undefined) { sets.push('proposal_mgr_id = @proposal_mgr_id'); request.input('proposal_mgr_id', sql.Int, data.proposal_mgr_id); }
    if (data.pursuit_stage !== undefined) { sets.push('pursuit_stage = @pursuit_stage'); request.input('pursuit_stage', sql.VarChar(8), data.pursuit_stage); }
    if (data.compliance_score !== undefined) { sets.push('compliance_score = @compliance_score'); request.input('compliance_score', sql.Decimal(4,1), data.compliance_score); }
    if (data.forecast_value_usd !== undefined) { sets.push('forecast_value_usd = @forecast_value_usd'); request.input('forecast_value_usd', sql.Decimal(18,2), data.forecast_value_usd); }
    if (data.cos_hours !== undefined) { sets.push('cos_hours = @cos_hours'); request.input('cos_hours', sql.Decimal(10,2), data.cos_hours); }
    if (data.cos_amount !== undefined) { sets.push('cos_amount = @cos_amount'); request.input('cos_amount', sql.Decimal(18,2), data.cos_amount); }
    if (!sets.length) return badRequest(res, 'No fields to update');
    sets.push('updated_at = SYSUTCDATETIME()');
    const result = await request.query(`UPDATE app.pursuit SET ${sets.join(', ')} WHERE pursuit_id = @id`);
    if (result.rowsAffected[0] === 0) return notFound(res);
    const read = await pool.request().input('id', sql.BigInt, pursuitId).query(`SELECT pursuit_id, org_id, candidate_id, due_date, capture_lead_id, proposal_mgr_id, pursuit_stage, compliance_score, forecast_value_usd, cos_hours, cos_amount, created_at, updated_at FROM app.pursuit WHERE pursuit_id = @id`);
    const updated = read.recordset[0];
    await logActivity({ type: 'PursuitUpdated', title: `Pursuit ${pursuitId} updated`, signal_id: pursuitId });
    ok(res, updated);
  })
);

router.delete(
  '/:pursuit_id',
  asyncHandler(async (req, res) => {
    const pursuitId = Number(req.params.pursuit_id);
    if (!Number.isInteger(pursuitId) || pursuitId <= 0) return badRequest(res, 'pursuit_id must be a positive integer');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.BigInt, pursuitId).query(
      `DELETE FROM app.pursuit WHERE pursuit_id = @id`
    );
    if (result.rowsAffected[0] === 0) return notFound(res);
    await logActivity({ type: 'PursuitDeleted', title: `Pursuit ${pursuitId} deleted`, signal_id: pursuitId });
    ok(res, { deleted: result.rowsAffected[0] });
  })
);

export default router;
