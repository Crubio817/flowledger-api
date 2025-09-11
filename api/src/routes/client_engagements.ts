import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound, getPagination } from '../utils/http';
import { ClientEngagementCreate, ClientEngagementUpdate } from '../validation/schemas';
import { logActivity } from '../utils/activity';

const router = Router();

/**
 * @openapi
 * /api/client-engagements:
 *   get:
 *     summary: List client engagements
 *     tags: [ClientEngagements]
 *     responses:
 *       200:
 *         description: Engagements list
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
 *                       engagement_id: { type: integer }
 *                       client_id: { type: integer }
 *                       title: { type: string }
 *                       start_date: { type: string, nullable: true }
 *                       end_date: { type: string, nullable: true }
 *                       status: { type: string }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *   post:
 *     summary: Create client engagement
 *     tags: [ClientEngagements]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, title]
 *             properties:
 *               client_id: { type: integer }
 *               title: { type: string }
 *               start_date: { type: string, nullable: true }
 *               end_date: { type: string, nullable: true }
 *               status: { type: string }
 *     responses:
 *       201:
 *         description: Engagement created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     engagement_id: { type: integer }
 *                     client_id: { type: integer }
 *                     title: { type: string }
 *                     start_date: { type: string, nullable: true }
 *                     end_date: { type: string, nullable: true }
 *                     status: { type: string }
 */

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req);
  const pool = await getPool();
  const q = `SELECT engagement_id, client_id, name AS title, start_at AS start_date, due_at AS end_date, status, created_at, updated_at, COUNT(*) OVER() AS total FROM app.engagement WHERE type IN ('audit', 'project', 'job') ORDER BY created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
  const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(q);
  const total = r.recordset[0]?.total ?? 0;
  const items = r.recordset.map((row: any) => {
    const { total: _t, ...rest } = row; return rest;
  });
  listOk(res, items, { page, limit, total });
}));

/**
 * @openapi
 * /api/client-engagements/{id}:
 *   get:
 *     summary: Get client engagement by id
 *     tags: [ClientEngagements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Engagement
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     engagement_id: { type: integer }
 *                     client_id: { type: integer }
 *                     title: { type: string }
 *                     start_date: { type: string, nullable: true }
 *                     end_date: { type: string, nullable: true }
 *                     status: { type: string }
 *   put:
 *     summary: Update client engagement
 *     tags: [ClientEngagements]
 *     parameters:
 *       - in: path
 *         name: id
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
 *               start_date: { type: string, nullable: true }
 *               end_date: { type: string, nullable: true }
 *               status: { type: string }
 *     responses:
 *       200:
 *         description: Engagement updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     engagement_id: { type: integer }
 *                     client_id: { type: integer }
 *                     title: { type: string }
 *                     start_date: { type: string, nullable: true }
 *                     end_date: { type: string, nullable: true }
 *                     status: { type: string }
 *   delete:
 *     summary: Delete client engagement
 *     tags: [ClientEngagements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     deleted: { type: integer }
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT engagement_id, client_id, name AS title, start_at AS start_date, due_at AS end_date, status, created_at, updated_at FROM app.engagement WHERE engagement_id=@id AND type IN ('audit', 'project', 'job')`);
  const row = r.recordset[0]; if (!row) return notFound(res); ok(res, row);
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = ClientEngagementCreate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data as any;
  const { client_id, title } = data;
  const pool = await getPool();

  const insertCols: string[] = ['client_id', 'name', 'type'];
  const insertVals: string[] = ['@client_id', '@name', '@type'];
  const outputCols: string[] = ['INSERTED.engagement_id', 'INSERTED.client_id', 'INSERTED.name', 'INSERTED.start_at', 'INSERTED.due_at', 'INSERTED.status'];
  const request = pool.request()
    .input('client_id', sql.Int, client_id)
    .input('name', sql.NVarChar(200), title)
    .input('type', sql.NVarChar(20), 'project'); // Default to project type

  if (data.start_date !== undefined) {
    insertCols.push('start_at'); insertVals.push('@start_at'); outputCols.push('INSERTED.start_at');
    request.input('start_at', sql.DateTime2, data.start_date);
  }
  if (data.end_date !== undefined) {
    insertCols.push('due_at'); insertVals.push('@due_at'); outputCols.push('INSERTED.due_at');
    request.input('due_at', sql.DateTime2, data.end_date);
  }
  if (data.status !== undefined) {
    insertCols.push('status'); insertVals.push('@status'); outputCols.push('INSERTED.status');
    request.input('status', sql.NVarChar(40), data.status);
  }

  const q = `INSERT INTO app.engagement (${insertCols.join(', ')}) OUTPUT ${outputCols.join(', ')} VALUES (${insertVals.join(', ')})`;
  const result = await request.query(q);
  ok(res, result.recordset[0], 201);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
  const parsed = ClientEngagementUpdate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data; const sets: string[] = [];
  const pool = await getPool(); const request = pool.request().input('id', sql.Int, id);
  if (data.title !== undefined) { sets.push('name=@name'); request.input('name', sql.NVarChar(200), data.title); }
  if (data.start_date !== undefined) { sets.push('start_at=@start_at'); request.input('start_at', sql.DateTime2, data.start_date); }
  if (data.end_date !== undefined) { sets.push('due_at=@due_at'); request.input('due_at', sql.DateTime2, data.end_date); }
  if (data.status !== undefined) { sets.push('status=@status'); request.input('status', sql.NVarChar(40), data.status); }
  if (!sets.length) return badRequest(res, 'No fields to update');
  sets.push('updated_at = SYSUTCDATETIME()');
  const result = await request.query(`UPDATE app.engagement SET ${sets.join(', ')} WHERE engagement_id=@id AND type IN ('audit', 'project', 'job')`);
  if (result.rowsAffected[0]===0) return notFound(res);
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT engagement_id, client_id, name AS title, start_at AS start_date, due_at AS end_date, status, created_at, updated_at FROM app.engagement WHERE engagement_id=@id AND type IN ('audit', 'project', 'job')`);
  ok(res, read.recordset[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
  const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.engagement WHERE engagement_id=@id AND type IN ('audit', 'project', 'job')`);
  if (r.rowsAffected[0]===0) return notFound(res); ok(res, { deleted: r.rowsAffected[0] });
}));

export default router;
