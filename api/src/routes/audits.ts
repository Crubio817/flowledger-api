import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { AuditCreateBody, AuditUpdateBody } from '../validation/schemas';
import { logActivity } from '../utils/activity';

const router = Router();

async function clientExists(clientId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, clientId).query(
    `SELECT client_id FROM app.clients WHERE client_id = @id`
  );
  return r.recordset.length > 0;
}

/**
 * @openapi
 * /api/audits:
 *   get:
 *     summary: List audits
 *     tags: [Audits]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Audits list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       audit_id: { type: integer }
 *                       client_id: { type: integer }
 *                       title: { type: string }
 *                       scope: { type: string, nullable: true }
 *                       status: { type: string }
 *                       created_utc: { type: string, format: date-time }
 *                       updated_utc: { type: string, format: date-time }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 *   post:
 *     summary: Create audit
 *     tags: [Audits]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [audit_id, client_id, title]
 *             properties:
 *               audit_id: { type: integer }
 *               client_id: { type: integer }
 *               title: { type: string }
 *               scope: { type: string, nullable: true }
 *               status: { type: string }
 *     responses:
 *       201:
 *         description: Audit created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     audit_id: { type: integer }
 *                     client_id: { type: integer }
 *                     title: { type: string }
 *                     scope: { type: string, nullable: true }
 *                     status: { type: string }
 *                     created_utc: { type: string, format: date-time }
 *                     updated_utc: { type: string, format: date-time }
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
        `SELECT audit_id, client_id, title, scope, status, created_utc, updated_utc
         FROM app.audits
         ORDER BY audit_id
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
  listOk(res, result.recordset, { page, limit });
  })
);

/**
 * @openapi
 * /api/audits/{audit_id}:
 *   get:
 *     summary: Get audit by id
 *     tags: [Audits]
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     audit_id: { type: integer }
 *                     client_id: { type: integer }
 *                     title: { type: string }
 *                     scope: { type: string, nullable: true }
 *                     status: { type: string }
 *                     created_utc: { type: string, format: date-time }
 *                     updated_utc: { type: string, format: date-time }
 *   put:
 *     summary: Update audit
 *     tags: [Audits]
 *     parameters:
 *       - in: path
 *         name: audit_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               scope: { type: string, nullable: true }
 *               status: { type: string }
 *   delete:
 *     summary: Delete audit
 *     tags: [Audits]
 *     parameters:
 *       - in: path
 *         name: audit_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.get(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (Number.isNaN(auditId)) return badRequest(res, 'audit_id must be int');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, auditId).query(
      `SELECT audit_id, client_id, title, scope, status, created_utc, updated_utc
       FROM app.audits WHERE audit_id = @id`
    );
  const row = result.recordset[0];
  if (!row) return notFound(res);
    ok(res, row);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = AuditCreateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const { audit_id, client_id, title, scope = null, status = null } = parsed.data;
    if (!(await clientExists(client_id))) return badRequest(res, 'client_id does not exist');
    const pool = await getPool();
    await pool.request()
      .input('audit_id', sql.Int, audit_id)
      .input('client_id', sql.Int, client_id)
      .input('title', sql.NVarChar(200), title)
      .input('scope', sql.NVarChar(1000), scope)
      .input('status', sql.NVarChar(40), status)
      .query(`INSERT INTO app.audits (audit_id, client_id, title, scope, status) VALUES (@audit_id, @client_id, @title, @scope, COALESCE(@status, N'InProgress'))`);
    const read = await pool.request().input('id', sql.Int, audit_id).query(`SELECT audit_id, client_id, title, scope, status, created_utc, updated_utc FROM app.audits WHERE audit_id = @id`);
    const created = read.recordset[0];
    await logActivity({ type: 'AuditCreated', title: `Audit ${title} created`, audit_id, client_id });
    ok(res, created, 201);
  })
);

router.put(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (Number.isNaN(auditId)) return badRequest(res, 'audit_id must be int');
    const parsed = AuditUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const data = parsed.data;
    const sets: string[] = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, auditId);
    if (data.title !== undefined) { sets.push('title = @title'); request.input('title', sql.NVarChar(200), data.title); }
    if (data.scope !== undefined) { sets.push('scope = @scope'); request.input('scope', sql.NVarChar(1000), data.scope); }
    if (data.status !== undefined) { sets.push('status = @status'); request.input('status', sql.NVarChar(40), data.status); }
    if (!sets.length) return badRequest(res, 'No fields to update');
    sets.push('updated_utc = SYSUTCDATETIME()');
    const result = await request.query(`UPDATE app.audits SET ${sets.join(', ')} WHERE audit_id = @id`);
    if (result.rowsAffected[0] === 0) return notFound(res);
    const read = await pool.request().input('id', sql.Int, auditId).query(`SELECT audit_id, client_id, title, scope, status, created_utc, updated_utc FROM app.audits WHERE audit_id = @id`);
    const updated = read.recordset[0];
    await logActivity({ type: 'AuditUpdated', title: `Audit ${auditId} updated`, audit_id: auditId, client_id: updated.client_id });
    ok(res, updated);
  })
);

router.delete(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (Number.isNaN(auditId)) return badRequest(res, 'audit_id must be int');
    const pool = await getPool();
    try {
      const result = await pool.request().input('id', sql.Int, auditId).query(
        `DELETE FROM app.audits WHERE audit_id = @id`
      );
  if (result.rowsAffected[0] === 0) return notFound(res);
  await logActivity({ type: 'AuditDeleted', title: `Audit ${auditId} deleted`, audit_id: auditId });
  ok(res, { deleted: result.rowsAffected[0] });
    } catch (e: any) {
      res.status(409).json({ status: 'error', data: null, error: e.message });
    }
  })
);

export default router;
