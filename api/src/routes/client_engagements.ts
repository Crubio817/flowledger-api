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
  // inspect columns to avoid referencing non-existent columns (some DBs may not have start_date/end_date)
  const colsRes = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='app' AND TABLE_NAME='client_engagements'`);
  const exists = new Set(colsRes.recordset.map((r: any) => r.COLUMN_NAME));

  const selectCols = ['engagement_id', 'client_id'];
  // determine title column (support legacy variants)
  const titleCandidates = ['title', 'engagement_title', 'name'];
  const titleCol = titleCandidates.find(c => exists.has(c));
  if (titleCol) selectCols.push(`${titleCol} AS title`);
  else selectCols.push('NULL AS title');
    if (exists.has('start_date')) selectCols.push(`COALESCE(start_date, start_utc) AS start_date`);
  else selectCols.push(`start_utc AS start_date`);
  if (exists.has('end_date')) selectCols.push(`COALESCE(end_date, end_utc) AS end_date`);
  else selectCols.push(`end_utc AS end_date`);
  if (exists.has('status')) selectCols.push('status');
  selectCols.push('COUNT(*) OVER() AS total');

  const q = `SELECT ${selectCols.join(', ')} FROM app.client_engagements ORDER BY engagement_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
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
  // inspect columns and build SELECT dynamically to avoid referencing missing columns
  const colsRes = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='app' AND TABLE_NAME='client_engagements'`);
  const exists = new Set(colsRes.recordset.map((r: any) => r.COLUMN_NAME));
  const selectCols = ['engagement_id', 'client_id'];
  // determine title column (support legacy variants)
  const titleCandidates = ['title', 'engagement_title', 'name'];
  const titleCol = titleCandidates.find(c => exists.has(c));
  if (titleCol) selectCols.push(`${titleCol} AS title`);
  else selectCols.push('NULL AS title');
    if (exists.has('start_date')) selectCols.push(`COALESCE(start_date, start_utc) AS start_date`);
  else selectCols.push(`start_utc AS start_date`);
  if (exists.has('end_date')) selectCols.push(`COALESCE(end_date, end_utc) AS end_date`);
  else selectCols.push(`end_utc AS end_date`);
  if (exists.has('status')) selectCols.push('status');
  const sel = selectCols.join(', ');
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT ${sel} FROM app.client_engagements WHERE engagement_id=@id`);
  const row = r.recordset[0]; if (!row) return notFound(res); ok(res, row);
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = ClientEngagementCreate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data as any;
  const { client_id, title } = data;
  const pool = await getPool();

  // Inspect table columns so we don't reference non-existent columns (some DBs may not have start_date/end_date)
  const colsRes = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='app' AND TABLE_NAME='client_engagements'`);
  const exists = new Set(colsRes.recordset.map((r: any) => r.COLUMN_NAME));

  // determine actual title column name
  const titleCandidates = ['title', 'engagement_title', 'name'];
  let titleCol: string | null = null;
  for (const c of titleCandidates) if (exists.has(c)) { titleCol = c; break; }
  if (!titleCol) return badRequest(res, 'DB schema missing a title column for engagements');

  const insertCols: string[] = ['client_id', titleCol];
  const insertVals: string[] = ['@client_id', '@title'];
  const outputCols: string[] = ['INSERTED.engagement_id', 'INSERTED.client_id', `INSERTED.${titleCol}`];
  const request = pool.request().input('client_id', sql.Int, client_id).input('title', sql.NVarChar(200), title);

  if (data.start_date !== undefined && exists.has('start_date')) {
    insertCols.push('start_date'); insertVals.push('@start_date'); outputCols.push('INSERTED.start_date');
    request.input('start_date', sql.DateTime2, data.start_date ?? null);
  }
  if (data.end_date !== undefined && exists.has('end_date')) {
    insertCols.push('end_date'); insertVals.push('@end_date'); outputCols.push('INSERTED.end_date');
    request.input('end_date', sql.DateTime2, data.end_date ?? null);
  }
  if (data.status !== undefined && exists.has('status')) {
    insertCols.push('status'); insertVals.push('@status'); outputCols.push('INSERTED.status');
    request.input('status', sql.NVarChar(40), data.status ?? null);
  }

  const q = `INSERT INTO app.client_engagements (${insertCols.join(', ')}) OUTPUT ${outputCols.join(', ')} VALUES (${insertVals.join(', ')})`;
  const result = await request.query(q);
  ok(res, result.recordset[0], 201);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
  const parsed = ClientEngagementUpdate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data; const sets: string[] = [];
  const pool = await getPool(); const request = pool.request().input('id', sql.Int, id);
  if (data.title !== undefined) { sets.push('title=@title'); request.input('title', sql.NVarChar(200), data.title); }
  if (data.start_date !== undefined) { sets.push('start_date=@start_date'); request.input('start_date', sql.DateTime2, data.start_date); }
  if (data.end_date !== undefined) { sets.push('end_date=@end_date'); request.input('end_date', sql.DateTime2, data.end_date); }
  if (data.status !== undefined) { sets.push('status=@status'); request.input('status', sql.NVarChar(40), data.status); }
  if (!sets.length) return badRequest(res, 'No fields to update');
  const result = await request.query(`UPDATE app.client_engagements SET ${sets.join(', ')} WHERE engagement_id=@id`);
  if (result.rowsAffected[0]===0) return notFound(res);
  // build SELECT dynamically for the read after update
  const colsRes2 = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='app' AND TABLE_NAME='client_engagements'`);
  const exists2 = new Set(colsRes2.recordset.map((r: any) => r.COLUMN_NAME));
  const selectCols2 = ['engagement_id', 'client_id'];
  // determine title column (support legacy variants)
  const titleCol2Candidates = ['title', 'engagement_title', 'name'];
  const titleCol2 = titleCol2Candidates.find(c => exists2.has(c));
  if (titleCol2) selectCols2.push(`${titleCol2} AS title`);
  else selectCols2.push('NULL AS title');
    if (exists2.has('start_date')) selectCols2.push(`COALESCE(start_date, start_utc) AS start_date`);
  else selectCols2.push(`start_utc AS start_date`);
  if (exists2.has('end_date')) selectCols2.push(`COALESCE(end_date, end_utc) AS end_date`);
  else selectCols2.push(`end_utc AS end_date`);
  if (exists2.has('status')) selectCols2.push('status');
  const sel2 = selectCols2.join(', ');
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT ${sel2} FROM app.client_engagements WHERE engagement_id=@id`);
  ok(res, read.recordset[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
  const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.client_engagements WHERE engagement_id=@id`);
  if (r.rowsAffected[0]===0) return notFound(res); ok(res, { deleted: r.rowsAffected[0] });
}));

export default router;
