import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound, getPagination } from '../utils/http';
import { ClientTagMapCreate } from '../validation/schemas';
import { logActivity } from '../utils/activity';

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
 *                       tag_id: { type: integer }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *   post:
 *     summary: Create client->tag mapping
 *     tags: [ClientTagMap]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [engagement_id, tag_id]
 *             properties:
 *               engagement_id: { type: integer }
 *               tag_id: { type: integer }
 *     responses:
 *       201:
 *         description: Mapping created
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
 *                     tag_id: { type: integer }
 *   delete:
 *     summary: Delete client->tag mapping
 *     tags: [ClientTagMap]
 *     parameters:
 *       - in: query
 *         name: engagement_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: tag_id
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
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req);
  const pool = await getPool();
  const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(`SELECT engagement_id, tag_id, COUNT(*) OVER() AS total FROM app.client_tag_map ORDER BY engagement_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  const total = r.recordset[0]?.total ?? 0;
  const items = r.recordset.map((row: any)=>{ const { total: _t, ...rest } = row; return rest; });
  listOk(res, items, { page, limit, total });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = ClientTagMapCreate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const { engagement_id, tag_id } = parsed.data;
  const pool = await getPool();
  // idempotent insert: ignore if exists
  await pool.request().input('engagement_id', sql.Int, engagement_id).input('tag_id', sql.Int, tag_id).query(`IF NOT EXISTS (SELECT 1 FROM app.client_tag_map WHERE engagement_id=@engagement_id AND tag_id=@tag_id) INSERT INTO app.client_tag_map (engagement_id, tag_id) VALUES (@engagement_id, @tag_id)`);
  await logActivity({ type: 'ClientTagMapCreated', title: `Mapped tag ${tag_id} to engagement ${engagement_id}`, client_id: null });
  ok(res, { engagement_id, tag_id }, 201);
}));

router.delete('/', asyncHandler(async (req, res) => {
  const engagementId = Number(req.query.engagement_id);
  const tagId = Number(req.query.tag_id);
  if (!Number.isInteger(engagementId) || engagementId <= 0 || !Number.isInteger(tagId) || tagId <= 0) return badRequest(res, 'engagement_id and tag_id must be positive integers');
  const pool = await getPool();
  const r = await pool.request().input('engagement_id', sql.Int, engagementId).input('tag_id', sql.Int, tagId).query(`DELETE FROM app.client_tag_map WHERE engagement_id=@engagement_id AND tag_id=@tag_id`);
  if (r.rowsAffected[0]===0) return notFound(res);
  await logActivity({ type: 'ClientTagMapDeleted', title: `Unmapped tag ${tagId} from engagement ${engagementId}`, client_id: null });
  ok(res, { deleted: r.rowsAffected[0] });
}));

export default router;
