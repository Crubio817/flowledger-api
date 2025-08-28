import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { ClientTagCreate, ClientTagUpdate } from '../validation/schemas';

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
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
  const pool = await getPool();
  const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(`SELECT tag_id, tag_name FROM app.client_tags ORDER BY tag_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  listOk(res, r.recordset, { page, limit, total: r.recordset.length });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = ClientTagCreate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const { tag_name } = parsed.data;
  const pool = await getPool();
  await pool.request().input('tag_name', sql.NVarChar(200), tag_name).query(`INSERT INTO app.client_tags (tag_name) VALUES (@tag_name)`);
  const read = await pool.request().query(`SELECT TOP 1 tag_id, tag_name FROM app.client_tags ORDER BY tag_id DESC`);
  ok(res, read.recordset[0], 201);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return badRequest(res, 'id must be int');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT tag_id, tag_name FROM app.client_tags WHERE tag_id=@id`);
  const row = r.recordset[0]; if (!row) return notFound(res); ok(res, row);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id); if (Number.isNaN(id)) return badRequest(res, 'id must be int');
  const parsed = ClientTagUpdate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data; const sets: string[] = []; const pool = await getPool(); const request = pool.request().input('id', sql.Int, id);
  if (data.tag_name !== undefined) { sets.push('tag_name=@tag_name'); request.input('tag_name', sql.NVarChar(200), data.tag_name); }
  if (!sets.length) return badRequest(res, 'No fields to update');
  const result = await request.query(`UPDATE app.client_tags SET ${sets.join(', ')} WHERE tag_id=@id`);
  if (result.rowsAffected[0]===0) return notFound(res);
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT tag_id, tag_name FROM app.client_tags WHERE tag_id=@id`);
  ok(res, read.recordset[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (Number.isNaN(id)) return badRequest(res, 'id must be int'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.client_tags WHERE tag_id=@id`); if (r.rowsAffected[0]===0) return notFound(res); ok(res, { deleted: r.rowsAffected[0] }); }));

export default router;
