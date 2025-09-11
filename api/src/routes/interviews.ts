import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { InterviewCreateBody, InterviewUpdateBody } from '../validation/schemas';
import { logActivity } from '../utils/activity';

const router = Router();

async function auditExists(auditId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, auditId).query(
    `SELECT engagement_id FROM app.engagement WHERE engagement_id = @id AND type = 'audit'`
  );
  return r.recordset.length > 0;
}

/*
 * @openapi
 * /api/interviews:
 *   get:
 *     summary: List interviews
 *     tags: [Interviews]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: sort
 *         schema: { type: string }
 *       - in: query
 *         name: order
 *         schema: { type: string, enum: [ASC, DESC] }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Interview' } }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const sort = (req.query.sort as string) || 'interview_id';
    const order = ((req.query.order as string) || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const allowedSort = new Set(['interview_id', 'scheduled_utc', 'status', 'audit_id']);
    const sortCol = allowedSort.has(sort) ? sort : 'interview_id';
    const pool = await getPool();
    const result = await pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(
        `SELECT interview_id, audit_id, persona, mode, scheduled_utc, status, notes, created_utc, updated_utc
         FROM app.interviews
         ORDER BY ${sortCol} ${order}
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
  listOk(res, result.recordset, { page, limit });
  })
);

router.get(
  '/:interview_id',
  asyncHandler(async (req, res) => {
    const interviewId = Number(req.params.interview_id);
    if (!Number.isInteger(interviewId) || interviewId <= 0) return badRequest(res, 'interview_id must be a positive integer');
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, interviewId).query(
      `SELECT interview_id, audit_id, persona, mode, scheduled_utc, status, notes, created_utc, updated_utc
       FROM app.interviews WHERE interview_id = @id`
    );
  const row = r.recordset[0];
  if (!row) return notFound(res);
    ok(res, row);
  })
);

router.post('/', asyncHandler(async (req, res) => {
  const parsed = InterviewCreateBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '));
  const { interview_id, audit_id, persona, mode = null, scheduled_utc = null, status = null, notes = null } = parsed.data as any;
  if (!(await auditExists(audit_id))) return badRequest(res, 'audit_id does not exist');
  const pool = await getPool();
  const result = await pool.request()
    .input('interview_id', sql.Int, interview_id)
    .input('audit_id', sql.Int, audit_id)
    .input('persona', sql.NVarChar(120), persona)
    .input('mode', sql.NVarChar(40), mode)
    .input('scheduled_utc', sql.DateTimeOffset, scheduled_utc)
    .input('status', sql.NVarChar(40), status)
    .input('notes', sql.NVarChar(sql.MAX), notes)
    .query(`INSERT INTO app.interviews (interview_id, audit_id, persona, mode, scheduled_utc, status, notes)
            OUTPUT INSERTED.interview_id, INSERTED.audit_id, INSERTED.persona, INSERTED.mode, INSERTED.scheduled_utc, INSERTED.status, INSERTED.notes, INSERTED.created_utc, INSERTED.updated_utc
            VALUES (@interview_id, @audit_id, @persona, @mode, @scheduled_utc, COALESCE(@status, N'Planned'), @notes)`);
  await logActivity({ type: 'AuditUpdated', title: `Interview ${result.recordset[0].interview_id} created`, audit_id });
  ok(res, result.recordset[0], 201);
}));

router.put('/:interview_id', asyncHandler(async (req, res) => {
  const interviewId = Number(req.params.interview_id);
  if (!Number.isInteger(interviewId) || interviewId <= 0) return badRequest(res, 'interview_id must be a positive integer');
  const parsed = InterviewUpdateBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '));
  const data = parsed.data as any;
  const sets: string[] = [];
  const pool = await getPool();
  const request = pool.request().input('id', sql.Int, interviewId);
  if (data.persona !== undefined) { sets.push('persona = @persona'); request.input('persona', sql.NVarChar(120), data.persona); }
  if (data.mode !== undefined) { sets.push('mode = @mode'); request.input('mode', sql.NVarChar(40), data.mode); }
  if (data.scheduled_utc !== undefined) { sets.push('scheduled_utc = @scheduled_utc'); request.input('scheduled_utc', sql.DateTimeOffset, data.scheduled_utc); }
  if (data.status !== undefined) { sets.push('status = @status'); request.input('status', sql.NVarChar(40), data.status); }
  if (data.notes !== undefined) { sets.push('notes = @notes'); request.input('notes', sql.NVarChar(sql.MAX), data.notes); }
  if (!sets.length) return badRequest(res, 'No fields to update');
  sets.push('updated_utc = SYSUTCDATETIME()');
  const result = await request.query(`UPDATE app.interviews SET ${sets.join(', ')} WHERE interview_id = @id`);
  if (result.rowsAffected[0] === 0) return notFound(res);
  const r = await pool.request().input('id', sql.Int, interviewId).query(`SELECT interview_id, audit_id, persona, mode, scheduled_utc, status, notes, created_utc, updated_utc FROM app.interviews WHERE interview_id = @id`);
  await logActivity({ type: 'AuditUpdated', title: `Interview ${interviewId} updated`, audit_id: r.recordset[0].audit_id });
  ok(res, r.recordset[0]);
}));

router.delete(
  '/:interview_id',
  asyncHandler(async (req, res) => {
    const interviewId = Number(req.params.interview_id);
    if (!Number.isInteger(interviewId) || interviewId <= 0) return badRequest(res, 'interview_id must be a positive integer');
    const pool = await getPool();
    // Get audit_id before deleting
    const read = await pool.request().input('id', sql.Int, interviewId).query(`SELECT audit_id FROM app.interviews WHERE interview_id = @id`);
    if (!read.recordset[0]) return notFound(res);
    const audit_id = read.recordset[0].audit_id;
    try {
      const result = await pool.request().input('id', sql.Int, interviewId).query(
        `DELETE FROM app.interviews WHERE interview_id = @id`
      );
  if (result.rowsAffected[0] === 0) return notFound(res);
      await logActivity({ type: 'AuditDeleted', title: `Interview ${interviewId} deleted`, audit_id });
      ok(res, { deleted: result.rowsAffected[0] });
    } catch (e: any) {
      res.status(409).json({ error: { code: 'Conflict', message: e?.message || 'Conflict' } });
    }
  })
);

export default router;
