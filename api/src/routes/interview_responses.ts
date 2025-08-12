import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';

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
    if (Number.isNaN(id)) return badRequest(res, 'response_id must be int');
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

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { response_id, interview_id, question_id, answer } = req.body || {};
    if (typeof response_id !== 'number' || typeof interview_id !== 'number' || typeof question_id !== 'string' || typeof answer !== 'string')
      return badRequest(res, 'response_id (number), interview_id (number), question_id (string), answer (string) required');
    if (!(await interviewExists(interview_id))) return badRequest(res, 'interview_id does not exist');
    const pool = await getPool();
    await pool
      .request()
      .input('response_id', sql.Int, response_id)
      .input('interview_id', sql.Int, interview_id)
      .input('question_id', sql.NVarChar(64), question_id)
      .input('answer', sql.NVarChar(sql.MAX), answer)
      .query(
        `INSERT INTO app.interview_responses (response_id, interview_id, question_id, answer)
         VALUES (@response_id, @interview_id, @question_id, @answer)`
      );
    const r = await pool.request().input('id', sql.Int, response_id).query(
      `SELECT response_id, interview_id, question_id, answer, created_utc FROM app.interview_responses WHERE response_id = @id`
    );
    ok(res, r.recordset[0], 201);
  })
);

router.put(
  '/:response_id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.response_id);
    if (Number.isNaN(id)) return badRequest(res, 'response_id must be int');
    const sets: string[] = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, id);

    if (typeof req.body.question_id === 'string') { sets.push('question_id = @question_id'); request.input('question_id', sql.NVarChar(64), req.body.question_id); }
    if (typeof req.body.answer === 'string') { sets.push('answer = @answer'); request.input('answer', sql.NVarChar(sql.MAX), req.body.answer); }

    if (!sets.length) return badRequest(res, 'No fields to update');

  const result = await request.query(`UPDATE app.interview_responses SET ${sets.join(', ')} WHERE response_id = @id`);
  if (result.rowsAffected[0] === 0) return notFound(res);

    const r = await pool.request().input('id', sql.Int, id).query(
      `SELECT response_id, interview_id, question_id, answer, created_utc FROM app.interview_responses WHERE response_id = @id`
    );
    ok(res, r.recordset[0]);
  })
);

router.delete(
  '/:response_id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.response_id);
    if (Number.isNaN(id)) return badRequest(res, 'response_id must be int');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, id).query(
      `DELETE FROM app.interview_responses WHERE response_id = @id`
    );
  if (result.rowsAffected[0] === 0) return notFound(res);
    ok(res, { deleted: result.rowsAffected[0] });
  })
);

export default router;
