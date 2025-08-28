import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { InterviewResponseCreateBody, InterviewResponseUpdateBody } from '../validation/schemas';

const router = Router();

async function interviewExists(id: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(
    `SELECT interview_id FROM app.interviews WHERE interview_id = @id`
  );
  return r.recordset.length > 0;
}

/**
 * @openapi
 * /api/interview-responses:
 *   get:
 *     summary: List interview responses
 *     tags: [Interview Responses]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { type: array, items: { $ref: '#/components/schemas/InterviewResponse' } }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const pool = await getPool();
    const r = await pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(
        `SELECT response_id, interview_id, question_id, answer, created_utc
         FROM app.interview_responses
         ORDER BY response_id
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
  listOk(res, r.recordset, { page, limit });
  })
);

router.get(
  '/:response_id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.response_id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'response_id must be a positive integer');
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, id).query(
      `SELECT response_id, interview_id, question_id, answer, created_utc
       FROM app.interview_responses WHERE response_id = @id`
    );
  const row = r.recordset[0];
  if (!row) return notFound(res);
    ok(res, row);
  })
);

router.post('/', asyncHandler(async (req, res) => {
  const parsed = InterviewResponseCreateBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '));
  const { response_id, interview_id, question_id, answer } = parsed.data;
  if (!(await interviewExists(interview_id))) return badRequest(res, 'interview_id does not exist');
  const pool = await getPool();
  const result = await pool
    .request()
    .input('response_id', sql.Int, response_id)
    .input('interview_id', sql.Int, interview_id)
    .input('question_id', sql.NVarChar(64), question_id)
    .input('answer', sql.NVarChar(sql.MAX), answer)
    .query(`INSERT INTO app.interview_responses (response_id, interview_id, question_id, answer)
            OUTPUT INSERTED.response_id, INSERTED.interview_id, INSERTED.question_id, INSERTED.answer, INSERTED.created_utc
            VALUES (@response_id, @interview_id, @question_id, @answer)`);
  ok(res, result.recordset[0], 201);
}));

router.put('/:response_id', asyncHandler(async (req, res) => {
  const id = Number(req.params.response_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'response_id must be a positive integer');
  const parsed = InterviewResponseUpdateBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '));
  const data = parsed.data;
  const sets: string[] = [];
  const pool = await getPool();
  const request = pool.request().input('id', sql.Int, id);
  if (data.question_id !== undefined) { sets.push('question_id = @question_id'); request.input('question_id', sql.NVarChar(64), data.question_id); }
  if (data.answer !== undefined) { sets.push('answer = @answer'); request.input('answer', sql.NVarChar(sql.MAX), data.answer); }
  if (!sets.length) return badRequest(res, 'No fields to update');
  const result = await request.query(`UPDATE app.interview_responses SET ${sets.join(', ')} WHERE response_id = @id`);
  if (result.rowsAffected[0] === 0) return notFound(res);
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT response_id, interview_id, question_id, answer, created_utc FROM app.interview_responses WHERE response_id = @id`);
  ok(res, r.recordset[0]);
}));

router.delete(
  '/:response_id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.response_id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'response_id must be a positive integer');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, id).query(
      `DELETE FROM app.interview_responses WHERE response_id = @id`
    );
  if (result.rowsAffected[0] === 0) return notFound(res);
    ok(res, { deleted: result.rowsAffected[0] });
  })
);

export default router;
