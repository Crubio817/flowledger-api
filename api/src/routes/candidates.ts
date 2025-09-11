import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { CandidateCreateBody, CandidateUpdateBody } from '../validation/schemas';
import { logActivity } from '../utils/activity';
import { candidateMemory } from '../utils/memory';

const router = Router();

/**
 * @openapi
 * /api/candidates:
 *   get:
 *     summary: List candidates
 *     tags: [Candidates]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Candidates list
 *   post:
 *     summary: Create candidate
 *     tags: [Candidates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               org_id: { type: integer }
 *               client_id: { type: integer }
 *               contact_id: { type: integer }
 *               title: { type: string }
 *               status: { type: string }
 *     responses:
 *       201:
 *         description: Candidate created
 * /api/candidates/{candidate_id}:
 *   get:
 *     summary: Get candidate
 *     tags: [Candidates]
 *     parameters:
 *       - in: path
 *         name: candidate_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Candidate
 *   put:
 *     summary: Update candidate
 *     tags: [Candidates]
 *     parameters:
 *       - in: path
 *         name: candidate_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200:
 *         description: Updated candidate
 *   delete:
 *     summary: Delete candidate
 *     tags: [Candidates]
 *     parameters:
 *       - in: path
 *         name: candidate_id
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
    const status = req.query.status as string;
    const pool = await getPool();

    // Optimized query for board view - minimal fields for snappy UI
    let query = `SELECT
      c.candidate_id as id,
      c.title,
      c.one_liner_scope,
      c.status,
      c.owner_user_id,
      c.last_touch_at,
      c.created_at,
      -- SLA badge: days since last touch
      DATEDIFF(day, c.last_touch_at, SYSUTCDATETIME()) as days_since_touch,
      -- Has threads/docs
      CASE WHEN EXISTS(SELECT 1 FROM app.work_item_link l WHERE l.item_type='candidate' AND l.item_id=c.candidate_id) THEN 1 ELSE 0 END as has_threads,
      CASE WHEN EXISTS(SELECT 1 FROM app.work_item_link l WHERE l.item_type='candidate' AND l.item_id=c.candidate_id AND l.link_type='doc') THEN 1 ELSE 0 END as has_docs
      FROM app.candidate c`;

    const request = pool.request();
    if (orgId) {
      query += ' WHERE c.org_id = @orgId';
      request.input('orgId', sql.Int, orgId);
    }
    if (status) {
      query += orgId ? ' AND c.status = @status' : ' WHERE c.status = @status';
      request.input('status', sql.VarChar(12), status);
    }
    query += ' ORDER BY c.last_touch_at DESC, c.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
    request.input('offset', sql.Int, offset).input('limit', sql.Int, limit);
    const result = await request.query(query);
    listOk(res, result.recordset, { page, limit });
  })
);

router.get(
  '/:candidate_id',
  asyncHandler(async (req, res) => {
    const candidateId = Number(req.params.candidate_id);
    if (!Number.isInteger(candidateId) || candidateId <= 0) return badRequest(res, 'candidate_id must be a positive integer');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.BigInt, candidateId).query(
      `SELECT candidate_id, org_id, client_id, contact_id, problem_id, solution_id, title, one_liner_scope, confidence, value_band, next_step, status, owner_user_id, last_touch_at, created_at, updated_at
       FROM app.candidate WHERE candidate_id = @id`
    );
    const row = result.recordset[0];
    if (!row) return notFound(res);
    ok(res, row);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = CandidateCreateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();
    const request = pool.request()
      .input('org_id', sql.Int, data.org_id)
      .input('client_id', sql.Int, data.client_id || null)
      .input('contact_id', sql.Int, data.contact_id || null)
      .input('problem_id', sql.Int, data.problem_id || null)
      .input('solution_id', sql.Int, data.solution_id || null)
      .input('title', sql.NVarChar(200), data.title || null)
      .input('one_liner_scope', sql.NVarChar(280), data.one_liner_scope || null)
      .input('confidence', sql.Decimal(3,2), data.confidence || null)
      .input('value_band', sql.VarChar(8), data.value_band || null)
      .input('next_step', sql.NVarChar(200), data.next_step || null)
      .input('status', sql.VarChar(12), data.status)
      .input('owner_user_id', sql.Int, data.owner_user_id || null);
    const result = await request.query(`
      INSERT INTO app.candidate (org_id, client_id, contact_id, problem_id, solution_id, title, one_liner_scope, confidence, value_band, next_step, status, owner_user_id)
      OUTPUT INSERTED.candidate_id, INSERTED.org_id, INSERTED.client_id, INSERTED.contact_id, INSERTED.problem_id, INSERTED.solution_id, INSERTED.title, INSERTED.one_liner_scope, INSERTED.confidence, INSERTED.value_band, INSERTED.next_step, INSERTED.status, INSERTED.owner_user_id, INSERTED.created_at, INSERTED.updated_at
      VALUES (@org_id, @client_id, @contact_id, @problem_id, @solution_id, @title, @one_liner_scope, @confidence, @value_band, @next_step, @status, @owner_user_id)
    `);
    const created = result.recordset[0];
    await logActivity({ type: 'CandidateCreated', title: `Candidate ${created.candidate_id} created`, client_id: created.client_id, signal_id: created.candidate_id }); // Note: using signal_id for candidate
    
    // Capture memory atom for candidate creation
    await candidateMemory.created(created.org_id, created.candidate_id, created.title || 'New Candidate');
    
    ok(res, created, 201);
  })
);

router.put(
  '/:candidate_id',
  asyncHandler(async (req, res) => {
    const candidateId = Number(req.params.candidate_id);
    if (!Number.isInteger(candidateId) || candidateId <= 0) return badRequest(res, 'candidate_id must be a positive integer');
    const parsed = CandidateUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const data = parsed.data;
    const sets: string[] = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.BigInt, candidateId);
    
    // Get current candidate to detect status changes
    const currentResult = await pool.request().input('id', sql.BigInt, candidateId)
      .query(`SELECT candidate_id, org_id, status FROM app.candidate WHERE candidate_id = @id`);
    if (currentResult.recordset.length === 0) return notFound(res);
    const currentCandidate = currentResult.recordset[0];
    if (data.client_id !== undefined) { sets.push('client_id = @client_id'); request.input('client_id', sql.Int, data.client_id); }
    if (data.contact_id !== undefined) { sets.push('contact_id = @contact_id'); request.input('contact_id', sql.Int, data.contact_id); }
    if (data.problem_id !== undefined) { sets.push('problem_id = @problem_id'); request.input('problem_id', sql.Int, data.problem_id); }
    if (data.solution_id !== undefined) { sets.push('solution_id = @solution_id'); request.input('solution_id', sql.Int, data.solution_id); }
    if (data.title !== undefined) { sets.push('title = @title'); request.input('title', sql.NVarChar(200), data.title); }
    if (data.one_liner_scope !== undefined) { sets.push('one_liner_scope = @one_liner_scope'); request.input('one_liner_scope', sql.NVarChar(280), data.one_liner_scope); }
    if (data.confidence !== undefined) { sets.push('confidence = @confidence'); request.input('confidence', sql.Decimal(3,2), data.confidence); }
    if (data.value_band !== undefined) { sets.push('value_band = @value_band'); request.input('value_band', sql.VarChar(8), data.value_band); }
    if (data.next_step !== undefined) { sets.push('next_step = @next_step'); request.input('next_step', sql.NVarChar(200), data.next_step); }
    if (data.status !== undefined) { sets.push('status = @status'); request.input('status', sql.VarChar(12), data.status); }
    if (data.owner_user_id !== undefined) { sets.push('owner_user_id = @owner_user_id'); request.input('owner_user_id', sql.Int, data.owner_user_id); }
    if (data.last_touch_at !== undefined) { sets.push('last_touch_at = @last_touch_at'); request.input('last_touch_at', sql.DateTime2, data.last_touch_at); }
    if (!sets.length) return badRequest(res, 'No fields to update');
    sets.push('updated_at = SYSUTCDATETIME()');
    const result = await request.query(`UPDATE app.candidate SET ${sets.join(', ')} WHERE candidate_id = @id`);
    if (result.rowsAffected[0] === 0) return notFound(res);
    const read = await pool.request().input('id', sql.BigInt, candidateId).query(`SELECT candidate_id, org_id, client_id, contact_id, problem_id, solution_id, title, one_liner_scope, confidence, value_band, next_step, status, owner_user_id, last_touch_at, created_at, updated_at FROM app.candidate WHERE candidate_id = @id`);
    const updated = read.recordset[0];
    await logActivity({ type: 'CandidateUpdated', title: `Candidate ${candidateId} updated`, client_id: updated.client_id, signal_id: candidateId });
    
    // Capture memory atom for status changes
    if (data.status !== undefined && data.status !== currentCandidate.status) {
      await candidateMemory.statusChanged(updated.org_id, candidateId, currentCandidate.status, data.status);
    }
    
    ok(res, updated);
  })
);

router.delete(
  '/:candidate_id',
  asyncHandler(async (req, res) => {
    const candidateId = Number(req.params.candidate_id);
    if (!Number.isInteger(candidateId) || candidateId <= 0) return badRequest(res, 'candidate_id must be a positive integer');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.BigInt, candidateId).query(
      `DELETE FROM app.candidate WHERE candidate_id = @id`
    );
    if (result.rowsAffected[0] === 0) return notFound(res);
    await logActivity({ type: 'CandidateDeleted', title: `Candidate ${candidateId} deleted`, signal_id: candidateId });
    ok(res, { deleted: result.rowsAffected[0] });
  })
);

export default router;
