import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound, getPagination } from '../utils/http';
import { ClientTagMapCreate } from '../validation/schemas';

const router = Router();

/**
 * @openapi
 * /api/client-tag-map:
 *   get:
 *     summary: List client->tag mappings
 *     tags: [ClientTagMap]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Mappings list
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req);
  const pool = await getPool();
  const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(`SELECT client_id, tag_id, COUNT(*) OVER() AS total FROM app.client_tag_map ORDER BY client_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  const total = r.recordset[0]?.total ?? 0;
  const items = r.recordset.map((row: any)=>{ const { total: _t, ...rest } = row; return rest; });
  listOk(res, items, { page, limit, total });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = ClientTagMapCreate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const { client_id, tag_id } = parsed.data;
  const pool = await getPool();
  // idempotent insert: ignore if exists
  await pool.request().input('client_id', sql.Int, client_id).input('tag_id', sql.Int, tag_id).query(`IF NOT EXISTS (SELECT 1 FROM app.client_tag_map WHERE client_id=@client_id AND tag_id=@tag_id) INSERT INTO app.client_tag_map (client_id, tag_id) VALUES (@client_id, @tag_id)`);
  ok(res, { client_id, tag_id }, 201);
}));

router.delete('/', asyncHandler(async (req, res) => {
  const clientId = Number(req.query.client_id);
  const tagId = Number(req.query.tag_id);
  if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(tagId) || tagId <= 0) return badRequest(res, 'client_id and tag_id must be positive integers');
  const pool = await getPool();
  const r = await pool.request().input('client_id', sql.Int, clientId).input('tag_id', sql.Int, tagId).query(`DELETE FROM app.client_tag_map WHERE client_id=@client_id AND tag_id=@tag_id`);
  if (r.rowsAffected[0]===0) return notFound(res);
  ok(res, { deleted: r.rowsAffected[0] });
}));

export default router;
