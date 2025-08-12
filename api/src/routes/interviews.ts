import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';

const router = Router();

async function auditExists(auditId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, auditId).query(
    `SELECT audit_id FROM app.audits WHERE audit_id = @id`
  );
  return r.recordset.length > 0;
}

/**
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
    if (Number.isNaN(interviewId)) return badRequest(res, 'interview_id must be int');
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

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { interview_id, audit_id, persona, mode = null, scheduled_utc = null, status = null, notes = null } = req.body || {};
    if (typeof interview_id !== 'number' || typeof audit_id !== 'number' || typeof persona !== 'string')
      return badRequest(res, 'interview_id (number), audit_id (number), persona (string) required');
    if (!(await auditExists(audit_id))) return badRequest(res, 'audit_id does not exist');
    const pool = await getPool();
    await pool
      .request()
      .input('interview_id', sql.Int, interview_id)
      .input('audit_id', sql.Int, audit_id)
      .input('persona', sql.NVarChar(120), persona)
      .input('mode', sql.NVarChar(40), mode)
      .input('scheduled_utc', sql.DateTimeOffset, scheduled_utc)
      .input('status', sql.NVarChar(40), status)
      .input('notes', sql.NVarChar(sql.MAX), notes)
      .query(
        `INSERT INTO app.interviews (interview_id, audit_id, persona, mode, scheduled_utc, status, notes)
         VALUES (@interview_id, @audit_id, @persona, @mode, @scheduled_utc, COALESCE(@status, N'Planned'), @notes)`
      );
    const r = await pool.request().input('id', sql.Int, interview_id).query(
      `SELECT interview_id, audit_id, persona, mode, scheduled_utc, status, notes, created_utc, updated_utc
       FROM app.interviews WHERE interview_id = @id`
    );
    ok(res, r.recordset[0], 201);
  })
);

router.put(
  '/:interview_id',
  asyncHandler(async (req, res) => {
    const interviewId = Number(req.params.interview_id);
    if (Number.isNaN(interviewId)) return badRequest(res, 'interview_id must be int');
    const sets: string[] = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, interviewId);

    if (typeof req.body.persona === 'string') { sets.push('persona = @persona'); request.input('persona', sql.NVarChar(120), req.body.persona); }
    if (typeof req.body.mode === 'string' || req.body.mode === null) { sets.push('mode = @mode'); request.input('mode', sql.NVarChar(40), req.body.mode); }
    if (typeof req.body.scheduled_utc === 'string' || req.body.scheduled_utc === null) { sets.push('scheduled_utc = @scheduled_utc'); request.input('scheduled_utc', sql.DateTimeOffset, req.body.scheduled_utc); }
    if (typeof req.body.status === 'string') { sets.push('status = @status'); request.input('status', sql.NVarChar(40), req.body.status); }
    if (typeof req.body.notes === 'string' || req.body.notes === null) { sets.push('notes = @notes'); request.input('notes', sql.NVarChar(sql.MAX), req.body.notes); }

    if (!sets.length) return badRequest(res, 'No fields to update');
    sets.push('updated_utc = SYSUTCDATETIME()');

  const result = await request.query(`UPDATE app.interviews SET ${sets.join(', ')} WHERE interview_id = @id`);
  if (result.rowsAffected[0] === 0) return notFound(res);

    const r = await pool.request().input('id', sql.Int, interviewId).query(
      `SELECT interview_id, audit_id, persona, mode, scheduled_utc, status, notes, created_utc, updated_utc
       FROM app.interviews WHERE interview_id = @id`
    );
    ok(res, r.recordset[0]);
  })
);

router.delete(
  '/:interview_id',
  asyncHandler(async (req, res) => {
    const interviewId = Number(req.params.interview_id);
    if (Number.isNaN(interviewId)) return badRequest(res, 'interview_id must be int');
    const pool = await getPool();
    try {
      const result = await pool.request().input('id', sql.Int, interviewId).query(
        `DELETE FROM app.interviews WHERE interview_id = @id`
      );
  if (result.rowsAffected[0] === 0) return notFound(res);
      ok(res, { deleted: result.rowsAffected[0] });
    } catch (e: any) {
      res.status(409).json({ status: 'error', data: null, error: e.message });
    }
  })
);

export default router;
