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
    `SELECT audit_id FROM app.audits WHERE audit_id = @id`
  );
  return r.recordset.length > 0;
}

/**
 * @openapi
 * /api/audit-sipoc:
 *   get:
 *     summary: List SIPOC docs
 *     tags: [SIPOC]
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
 *                 data: { type: array, items: { $ref: '#/components/schemas/SipocDoc' } }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const pool = await getPool();
    const result = await pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(
        `SELECT audit_id, suppliers_json, inputs_json, process_json, outputs_json, customers_json, metrics_json, updated_utc
         FROM app.audit_sipoc
         ORDER BY audit_id
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
    // Parse JSON columns
    const items = result.recordset.map((r: any) => ({
      ...r,
      suppliers_json: safeParseJson(r.suppliers_json),
      inputs_json: safeParseJson(r.inputs_json),
      process_json: safeParseJson(r.process_json),
      outputs_json: safeParseJson(r.outputs_json),
      customers_json: safeParseJson(r.customers_json),
      metrics_json: safeParseJson(r.metrics_json),
    }));
  listOk(res, items, { page, limit });
  })
);

/**
 * @openapi
 * /api/audit-sipoc/{audit_id}:
 *   get:
 *     summary: Get SIPOC by audit_id
 *     tags: [SIPOC]
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
 *                 data: { $ref: '#/components/schemas/SipocDoc' }
 */
router.get(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (Number.isNaN(auditId)) return badRequest(res, 'audit_id must be int');
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, auditId).query(
      `SELECT audit_id, suppliers_json, inputs_json, process_json, outputs_json, customers_json, metrics_json, updated_utc
       FROM app.audit_sipoc WHERE audit_id = @id`
    );
    const row = r.recordset[0];
  if (!row) return notFound(res);
    const parsed = {
      ...row,
      suppliers_json: safeParseJson(row.suppliers_json),
      inputs_json: safeParseJson(row.inputs_json),
      process_json: safeParseJson(row.process_json),
      outputs_json: safeParseJson(row.outputs_json),
      customers_json: safeParseJson(row.customers_json),
      metrics_json: safeParseJson(row.metrics_json),
    };
    ok(res, parsed);
  })
);

/**
 * @openapi
 * /api/audit-sipoc/{audit_id}:
 *   put:
 *     summary: Upsert SIPOC by audit_id
 *     tags: [SIPOC]
 *     parameters:
 *       - in: path
 *         name: audit_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SipocDoc' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/SipocDoc' }
 */
router.put(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (Number.isNaN(auditId)) return badRequest(res, 'audit_id must be int');
    if (!(await auditExists(auditId))) return badRequest(res, 'audit_id does not exist');

    const pool = await getPool();
    const body = req.body || {};

    const toStr = (v: any) => (v === undefined ? undefined : JSON.stringify(v));

    const request = pool.request().input('id', sql.Int, auditId);
    request.input('sup', sql.NVarChar(sql.MAX), toStr(body.suppliers_json) ?? null);
    request.input('inp', sql.NVarChar(sql.MAX), toStr(body.inputs_json) ?? null);
    request.input('pro', sql.NVarChar(sql.MAX), toStr(body.process_json) ?? null);
    request.input('out', sql.NVarChar(sql.MAX), toStr(body.outputs_json) ?? null);
    request.input('cus', sql.NVarChar(sql.MAX), toStr(body.customers_json) ?? null);
    request.input('met', sql.NVarChar(sql.MAX), toStr(body.metrics_json) ?? null);

    await request.query(
      `MERGE app.audit_sipoc AS t
       USING (SELECT @id AS audit_id) AS s
       ON (t.audit_id = s.audit_id)
       WHEN MATCHED THEN UPDATE SET
         suppliers_json = @sup, inputs_json = @inp, process_json = @pro, outputs_json = @out,
         customers_json = @cus, metrics_json = @met, updated_utc = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (audit_id, suppliers_json, inputs_json, process_json, outputs_json, customers_json, metrics_json, updated_utc)
         VALUES (@id, @sup, @inp, @pro, @out, @cus, @met, SYSUTCDATETIME());`
    );

    const r = await pool.request().input('id', sql.Int, auditId).query(
      `SELECT audit_id, suppliers_json, inputs_json, process_json, outputs_json, customers_json, metrics_json, updated_utc
       FROM app.audit_sipoc WHERE audit_id = @id`
    );
    const row = r.recordset[0];
    const parsed = {
      ...row,
      suppliers_json: safeParseJson(row.suppliers_json),
      inputs_json: safeParseJson(row.inputs_json),
      process_json: safeParseJson(row.process_json),
      outputs_json: safeParseJson(row.outputs_json),
      customers_json: safeParseJson(row.customers_json),
      metrics_json: safeParseJson(row.metrics_json),
    };
    await logActivity({ type: 'AuditSipocUpdated', title: `Updated SIPOC for audit ${auditId}`, audit_id: auditId });
    ok(res, parsed);
  })
);

export default router;
