import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, notFound, listOk } from '../utils/http';
import { logActivity } from '../utils/activity';

const router = Router();

function safeParseJson(val: unknown) {
  if (typeof val !== 'string') return null;
  try { return JSON.parse(val); } catch { return null; }
}

async function auditExists(auditId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, auditId).query(
    `SELECT engagement_id FROM app.engagement WHERE engagement_id = @id AND type = 'audit'`
  );
  return r.recordset.length > 0;
}

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
        `SELECT audit_id, pain_points_json, opportunities_json, recommendations_json, updated_utc
         FROM app.findings
         ORDER BY audit_id
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
  const items = r.recordset.map((row: any) => ({
      ...row,
      pain_points_json: safeParseJson(row.pain_points_json),
      opportunities_json: safeParseJson(row.opportunities_json),
      recommendations_json: safeParseJson(row.recommendations_json),
    }));
  listOk(res, items, { page, limit });
  })
);

/*
 * @openapi
 * /api/findings/{audit_id}:
 *   get:
 *     summary: Get findings by audit_id
 *     tags: [Findings]
 *     parameters:
 *       - in: path
 *         name: audit_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/Finding' }
 */
router.get(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.audit_id);
    if (Number.isNaN(id)) return badRequest(res, 'audit_id must be int');
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, id).query(
      `SELECT audit_id, pain_points_json, opportunities_json, recommendations_json, updated_utc
       FROM app.findings WHERE audit_id = @id`
    );
  const row = r.recordset[0];
  if (!row) return notFound(res);
    const parsed = {
      ...row,
      pain_points_json: safeParseJson(row.pain_points_json),
      opportunities_json: safeParseJson(row.opportunities_json),
      recommendations_json: safeParseJson(row.recommendations_json),
    };
    ok(res, parsed);
  })
);

/*
 * @openapi
 * /api/findings/{audit_id}:
 *   put:
 *     summary: Upsert findings by audit_id
 *     tags: [Findings]
 *     parameters:
 *       - in: path
 *         name: audit_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Finding' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/Finding' }
 */
router.put(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.audit_id);
    if (Number.isNaN(id)) return badRequest(res, 'audit_id must be int');
    if (!(await auditExists(id))) return badRequest(res, 'audit_id does not exist');

    const pool = await getPool();
    const body = req.body || {};
    const toStr = (v: any) => (v === undefined ? undefined : JSON.stringify(v));

    const request = pool.request().input('id', sql.Int, id);
    request.input('pp', sql.NVarChar(sql.MAX), toStr(body.pain_points_json) ?? null);
    request.input('opp', sql.NVarChar(sql.MAX), toStr(body.opportunities_json) ?? null);
    request.input('rec', sql.NVarChar(sql.MAX), toStr(body.recommendations_json) ?? null);

    await request.query(
      `MERGE app.findings AS t
       USING (SELECT @id AS audit_id) AS s
       ON (t.audit_id = s.audit_id)
       WHEN MATCHED THEN UPDATE SET
         pain_points_json = @pp, opportunities_json = @opp, recommendations_json = @rec, updated_utc = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (audit_id, pain_points_json, opportunities_json, recommendations_json, updated_utc)
         VALUES (@id, @pp, @opp, @rec, SYSUTCDATETIME());`
    );

    const r = await pool.request().input('id', sql.Int, id).query(
      `SELECT audit_id, pain_points_json, opportunities_json, recommendations_json, updated_utc FROM app.findings WHERE audit_id = @id`
    );
    const row = r.recordset[0];
    const parsed = {
      ...row,
      pain_points_json: safeParseJson(row.pain_points_json),
      opportunities_json: safeParseJson(row.opportunities_json),
      recommendations_json: safeParseJson(row.recommendations_json),
    };
    await logActivity({ type: 'AuditUpdated', title: `Findings updated for audit ${id}`, audit_id: id });
    ok(res, parsed);
  })
);

export default router;
