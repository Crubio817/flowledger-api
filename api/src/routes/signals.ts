import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { SignalCreateBody, SignalUpdateBody } from '../validation/schemas';
import { logActivity } from '../utils/activity';
import { enrichContactTool } from '../mcp-tools';

const router = Router();

/**
 * @openapi
 * /api/signals:
 *   get:
 *     summary: List signals
 *     tags: [Signals]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Signals list
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const orgId = req.query.org_id ? Number(req.query.org_id) : null;
    const pool = await getPool();
    let query = `SELECT signal_id, org_id, source_type, source_ref, snippet, contact_id, client_id, ts, problem_phrase, solution_hint, urgency_score, dedupe_key, cluster_id, owner_user_id, created_at, updated_at
                 FROM app.signal`;
    const request = pool.request();
    if (orgId) {
      query += ' WHERE org_id = @orgId';
      request.input('orgId', sql.Int, orgId);
    }
    query += ' ORDER BY ts DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
    request.input('offset', sql.Int, offset).input('limit', sql.Int, limit);
    const result = await request.query(query);
    listOk(res, result.recordset, { page, limit });
  })
);

router.get(
  '/:signal_id',
  asyncHandler(async (req, res) => {
    const signalId = Number(req.params.signal_id);
    if (!Number.isInteger(signalId) || signalId <= 0) return badRequest(res, 'signal_id must be a positive integer');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.BigInt, signalId).query(
      `SELECT signal_id, org_id, source_type, source_ref, snippet, contact_id, client_id, ts, problem_phrase, solution_hint, urgency_score, dedupe_key, cluster_id, owner_user_id, created_at, updated_at
       FROM app.signal WHERE signal_id = @id`
    );
    const row = result.recordset[0];
    if (!row) return notFound(res);
    ok(res, row);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = SignalCreateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();
    const request = pool.request()
      .input('org_id', sql.Int, data.org_id)
      .input('source_type', sql.VarChar(16), data.source_type)
      .input('source_ref', sql.VarChar(256), data.source_ref || null)
      .input('snippet', sql.NVarChar(1000), data.snippet || null)
      .input('contact_id', sql.Int, data.contact_id || null)
      .input('client_id', sql.Int, data.client_id || null)
      .input('problem_phrase', sql.NVarChar(300), data.problem_phrase || null)
      .input('solution_hint', sql.NVarChar(300), data.solution_hint || null)
      .input('urgency_score', sql.Decimal(3,2), data.urgency_score || null)
      .input('dedupe_key', sql.VarChar(128), data.dedupe_key)
      .input('cluster_id', sql.BigInt, data.cluster_id || null)
      .input('idempotency_key', sql.VarChar(64), data.idempotency_key || null)
      .input('owner_user_id', sql.Int, data.owner_user_id || null);
    const result = await request.query(`
      INSERT INTO app.signal (org_id, source_type, source_ref, snippet, contact_id, client_id, ts, problem_phrase, solution_hint, urgency_score, dedupe_key, cluster_id, idempotency_key, owner_user_id)
      OUTPUT INSERTED.signal_id, INSERTED.org_id, INSERTED.source_type, INSERTED.source_ref, INSERTED.snippet, INSERTED.contact_id, INSERTED.client_id, INSERTED.ts, INSERTED.problem_phrase, INSERTED.solution_hint, INSERTED.urgency_score, INSERTED.dedupe_key, INSERTED.cluster_id, INSERTED.owner_user_id, INSERTED.created_at, INSERTED.updated_at
      VALUES (@org_id, @source_type, @source_ref, @snippet, @contact_id, @client_id, SYSUTCDATETIME(), @problem_phrase, @solution_hint, @urgency_score, @dedupe_key, @cluster_id, @idempotency_key, @owner_user_id)
    `);
    const created = result.recordset[0];
    await logActivity({ type: 'SignalCreated', title: `Signal ${created.signal_id} created`, signal_id: created.signal_id });

    // If contact_id or email, enrich
    if (data.contact_id || (data.source_ref && data.source_ref.includes('@'))) {
      // Assume source_ref has email if present
      const email = data.source_ref && data.source_ref.includes('@') ? data.source_ref : null;
      if (email) {
        const enrichment = await enrichContactTool({ email });
        // Log enrichment job
      }
    }

    ok(res, created, 201);
  })
);

router.put(
  '/:signal_id',
  asyncHandler(async (req, res) => {
    const signalId = Number(req.params.signal_id);
    if (!Number.isInteger(signalId) || signalId <= 0) return badRequest(res, 'signal_id must be a positive integer');
    const parsed = SignalUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const data = parsed.data;
    const sets: string[] = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.BigInt, signalId);
    if (data.source_type !== undefined) { sets.push('source_type = @source_type'); request.input('source_type', sql.VarChar(16), data.source_type); }
    if (data.source_ref !== undefined) { sets.push('source_ref = @source_ref'); request.input('source_ref', sql.VarChar(256), data.source_ref); }
    if (data.snippet !== undefined) { sets.push('snippet = @snippet'); request.input('snippet', sql.NVarChar(1000), data.snippet); }
    if (data.contact_id !== undefined) { sets.push('contact_id = @contact_id'); request.input('contact_id', sql.Int, data.contact_id); }
    if (data.client_id !== undefined) { sets.push('client_id = @client_id'); request.input('client_id', sql.Int, data.client_id); }
    if (data.problem_phrase !== undefined) { sets.push('problem_phrase = @problem_phrase'); request.input('problem_phrase', sql.NVarChar(300), data.problem_phrase); }
    if (data.solution_hint !== undefined) { sets.push('solution_hint = @solution_hint'); request.input('solution_hint', sql.NVarChar(300), data.solution_hint); }
    if (data.urgency_score !== undefined) { sets.push('urgency_score = @urgency_score'); request.input('urgency_score', sql.Decimal(3,2), data.urgency_score); }
    if (data.cluster_id !== undefined) { sets.push('cluster_id = @cluster_id'); request.input('cluster_id', sql.BigInt, data.cluster_id); }
    if (data.owner_user_id !== undefined) { sets.push('owner_user_id = @owner_user_id'); request.input('owner_user_id', sql.Int, data.owner_user_id); }
    if (!sets.length) return badRequest(res, 'No fields to update');
    sets.push('updated_at = SYSUTCDATETIME()');
    const result = await request.query(`UPDATE app.signal SET ${sets.join(', ')} WHERE signal_id = @id`);
    if (result.rowsAffected[0] === 0) return notFound(res);
    const read = await pool.request().input('id', sql.BigInt, signalId).query(`SELECT signal_id, org_id, source_type, source_ref, snippet, contact_id, client_id, ts, problem_phrase, solution_hint, urgency_score, dedupe_key, cluster_id, owner_user_id, created_at, updated_at FROM app.signal WHERE signal_id = @id`);
    const updated = read.recordset[0];
    await logActivity({ type: 'SignalUpdated', title: `Signal ${signalId} updated`, signal_id: signalId });
    ok(res, updated);
  })
);

router.delete(
  '/:signal_id',
  asyncHandler(async (req, res) => {
    const signalId = Number(req.params.signal_id);
    if (!Number.isInteger(signalId) || signalId <= 0) return badRequest(res, 'signal_id must be a positive integer');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.BigInt, signalId).query(
      `DELETE FROM app.signal WHERE signal_id = @id`
    );
    if (result.rowsAffected[0] === 0) return notFound(res);
    await logActivity({ type: 'SignalDeleted', title: `Signal ${signalId} deleted`, signal_id: signalId });
    ok(res, { deleted: result.rowsAffected[0] });
  })
);

export default router;
