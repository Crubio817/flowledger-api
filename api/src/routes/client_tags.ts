import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound, getPagination } from '../utils/http';
import { ClientTagCreate, ClientTagUpdate } from '../validation/schemas';
import { logActivity } from '../utils/activity';

const router = Router();

/**
 * @openapi
 * /api/client-tags:
 *   get:
 *     summary: List client tags
 *     tags: [ClientTags]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Tags list
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
 *                       tag_id: { type: integer }
 *                       tag_name: { type: string }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *   post:
 *     summary: Create client tag
 *     tags: [ClientTags]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tag_name]
 *             properties:
 *               tag_name: { type: string }
 *     responses:
 *       201:
 *         description: Tag created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tag_id: { type: integer }
 *                     tag_name: { type: string }
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req);
  const pool = await getPool();
  const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(`SELECT tag_id, tag_name, COUNT(*) OVER() AS total FROM app.client_tags ORDER BY tag_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  const total = r.recordset[0]?.total ?? 0;
  const items = r.recordset.map((row:any)=>{ const { total: _t, ...rest } = row; return rest; });
  listOk(res, items, { page, limit, total });
}));
/**
 * @openapi
 * /api/client-tags/{id}:
 *   get:
 *     summary: Get client tag by id
 *     tags: [ClientTags]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Tag
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tag_id: { type: integer }
 *                     tag_name: { type: string }
 *   put:
 *     summary: Update client tag
 *     tags: [ClientTags]
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
 *               tag_name: { type: string }
 *     responses:
 *       200:
 *         description: Tag updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tag_id: { type: integer }
 *                     tag_name: { type: string }
 *   delete:
 *     summary: Delete client tag
 *     tags: [ClientTags]
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
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT tag_id, tag_name FROM app.client_tags WHERE tag_id=@id`);
  const row = r.recordset[0]; if (!row) return notFound(res); ok(res, row);
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = ClientTagCreate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const { tag_name } = parsed.data;
  const pool = await getPool();
  await pool.request().input('tag_name', sql.NVarChar(200), tag_name).query(`INSERT INTO app.client_tags (tag_name) VALUES (@tag_name)`);
  const read = await pool.request().query(`SELECT TOP 1 tag_id, tag_name FROM app.client_tags ORDER BY tag_id DESC`);
  await logActivity({ type: 'ClientTagCreated', title: `Created tag ${tag_name}`, client_id: null });
  ok(res, read.recordset[0], 201);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT tag_id, tag_name FROM app.client_tags WHERE tag_id=@id`);
  const row = r.recordset[0]; if (!row) return notFound(res); ok(res, row);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
  const parsed = ClientTagUpdate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data; const sets: string[] = []; const pool = await getPool(); const request = pool.request().input('id', sql.Int, id);
  if (data.tag_name !== undefined) { sets.push('tag_name=@tag_name'); request.input('tag_name', sql.NVarChar(200), data.tag_name); }
  if (!sets.length) return badRequest(res, 'No fields to update');
  const result = await request.query(`UPDATE app.client_tags SET ${sets.join(', ')} WHERE tag_id=@id`);
  if (result.rowsAffected[0]===0) return notFound(res);
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT tag_id, tag_name FROM app.client_tags WHERE tag_id=@id`);
  await logActivity({ type: 'ClientTagUpdated', title: `Updated tag ${id}`, client_id: null });
  ok(res, read.recordset[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.client_tags WHERE tag_id=@id`); if (r.rowsAffected[0]===0) return notFound(res); await logActivity({ type: 'ClientTagDeleted', title: `Deleted tag ${id}`, client_id: null }); ok(res, { deleted: r.rowsAffected[0] }); }));

export default router;
