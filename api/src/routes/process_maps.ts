import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { logActivity } from '../utils/activity';

const router = Router();

async function auditExists(auditId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, auditId).query(
    `SELECT audit_id FROM app.audits WHERE audit_id = @id`
  );
  return r.recordset.length > 0;
}

/*
 * @openapi
 * /api/process-maps:
 *   get:
 *     summary: List process maps
 *     tags: [Process Maps]
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
 *                 data: { type: array, items: { $ref: '#/components/schemas/ProcessMap' } }
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
        `SELECT process_map_id, audit_id, title, blob_path, file_type, uploaded_utc
         FROM app.process_maps
         ORDER BY process_map_id
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
  listOk(res, r.recordset, { page, limit });
  })
);

router.get(
  '/:process_map_id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.process_map_id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'process_map_id must be a positive integer');
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, id).query(
      `SELECT process_map_id, audit_id, title, blob_path, file_type, uploaded_utc
       FROM app.process_maps WHERE process_map_id = @id`
    );
  const row = r.recordset[0];
  if (!row) return notFound(res);
    ok(res, row);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { process_map_id, audit_id, title = null, blob_path, file_type = null } = req.body || {};
    if (typeof process_map_id !== 'number' || typeof audit_id !== 'number' || typeof blob_path !== 'string')
      return badRequest(res, 'process_map_id (number), audit_id (number), blob_path (string) required');
    if (!(await auditExists(audit_id))) return badRequest(res, 'audit_id does not exist');

    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.Int, process_map_id)
      .input('audit_id', sql.Int, audit_id)
      .input('title', sql.NVarChar(200), title)
      .input('blob_path', sql.NVarChar(400), blob_path)
      .input('file_type', sql.NVarChar(40), file_type)
      .query(
        `INSERT INTO app.process_maps (process_map_id, audit_id, title, blob_path, file_type)
         VALUES (@id, @audit_id, @title, @blob_path, @file_type)`
      );

    const r = await pool.request().input('id', sql.Int, process_map_id).query(
      `SELECT process_map_id, audit_id, title, blob_path, file_type, uploaded_utc
       FROM app.process_maps WHERE process_map_id = @id`
    );
    await logActivity({ type: 'AuditUpdated', title: `Process map ${process_map_id} uploaded`, audit_id });
    ok(res, r.recordset[0], 201);
  })
);

router.put(
  '/:process_map_id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.process_map_id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'process_map_id must be a positive integer');
    const sets: string[] = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, id);

    if (typeof req.body.title === 'string' || req.body.title === null) { sets.push('title = @title'); request.input('title', sql.NVarChar(200), req.body.title); }
    if (typeof req.body.blob_path === 'string') { sets.push('blob_path = @blob_path'); request.input('blob_path', sql.NVarChar(400), req.body.blob_path); }
    if (typeof req.body.file_type === 'string' || req.body.file_type === null) { sets.push('file_type = @file_type'); request.input('file_type', sql.NVarChar(40), req.body.file_type); }
    if (!sets.length) return badRequest(res, 'No fields to update');

  const result = await request.query(`UPDATE app.process_maps SET ${sets.join(', ')} WHERE process_map_id = @id`);
  if (result.rowsAffected[0] === 0) return notFound(res);

    const r = await pool.request().input('id', sql.Int, id).query(
      `SELECT process_map_id, audit_id, title, blob_path, file_type, uploaded_utc FROM app.process_maps WHERE process_map_id = @id`
    );
    await logActivity({ type: 'AuditUpdated', title: `Process map ${id} updated`, audit_id: r.recordset[0].audit_id });
    ok(res, r.recordset[0]);
  })
);

router.delete(
  '/:process_map_id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.process_map_id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'process_map_id must be a positive integer');
    const pool = await getPool();
    // Get audit_id before deleting
    const read = await pool.request().input('id', sql.Int, id).query(`SELECT audit_id FROM app.process_maps WHERE process_map_id = @id`);
    if (!read.recordset[0]) return notFound(res);
    const audit_id = read.recordset[0].audit_id;
    const result = await pool.request().input('id', sql.Int, id).query(
      `DELETE FROM app.process_maps WHERE process_map_id = @id`
    );
    if (result.rowsAffected[0] === 0) return notFound(res);
    await logActivity({ type: 'AuditDeleted', title: `Process map ${id} deleted`, audit_id });
    ok(res, { deleted: result.rowsAffected[0] });
  })
);

/*
 * @openapi
 * /api/process-maps/upload-url:
 *   post:
 *     summary: Get pre-signed upload URL for a process map file (stub)
 *     tags: [Process Maps]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               audit_id: { type: integer }
 *               filename: { type: string }
 *               contentType: { type: string }
 *             required: [audit_id, filename, contentType]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/UploadUrlResponse' }
 */
router.post(
  '/upload-url',
  asyncHandler(async (req, res) => {
    const { audit_id, filename, contentType } = req.body || {};
    if (typeof audit_id !== 'number' || typeof filename !== 'string' || typeof contentType !== 'string')
      return badRequest(res, 'audit_id (number), filename (string), contentType (string) required');
    const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const blob_path = `process-maps/${audit_id}/${Date.now()}-${safeName}`;
    const base = process.env.STORAGE_DEV_UPLOAD_BASE || 'https://example.invalid/upload';
    const uploadUrl = `${base}?blob_path=${encodeURIComponent(blob_path)}&contentType=${encodeURIComponent(contentType)}`;
    ok(res, { uploadUrl, blob_path, contentType });
  })
);

export default router;
