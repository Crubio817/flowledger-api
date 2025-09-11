import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound, getPagination } from '../utils/http';
import { assertDocumentCanTransition } from '../state/guards';

// Simple outbox event emitter
async function emitOutboxEvent(eventName: string, payload: any) {
  const pool = await getPool();
  await pool.request()
    .input('eventName', sql.VarChar(40), eventName)
    .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .query(`
      INSERT INTO app.work_event (event_name, payload_json, item_type, item_id, org_id)
      VALUES (@eventName, @payload, 'document', @payload.document_id || 0, @payload.org_id || 0)
    `);
}

const router = Router();

/**
 * @openapi
 * /api/docs:
 *   get:
 *     summary: List documents
 *     tags: [Documents]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Document list
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req);
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const type = req.query.type as string;
  const status = req.query.status as string;

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  let query = `
    SELECT
      d.id,
      d.title,
      d.type,
      d.status,
      d.classification,
      d.source,
      d.mime_type,
      d.size_bytes,
      d.created_by_user_id,
      d.created_at,
      dv.vnum as latest_version,
      dv.hash_sha256
    FROM app.document d
    LEFT JOIN app.document_version dv ON d.id = dv.document_id AND dv.vnum = (
      SELECT MAX(vnum) FROM app.document_version WHERE document_id = d.id
    )
    WHERE d.org_id = @orgId AND d.deleted_at IS NULL
  `;

  const request = pool.request().input('orgId', sql.Int, orgId);
  if (type) {
    query += ' AND d.type = @type';
    request.input('type', sql.VarChar(50), type);
  }
  if (status) {
    query += ' AND d.status = @status';
    request.input('status', sql.VarChar(50), status);
  }

  query += ' ORDER BY d.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
  request.input('offset', sql.Int, offset).input('limit', sql.Int, limit);

  const result = await request.query(query);
  listOk(res, result.recordset, { page, limit });
}));

/**
 * @openapi
 * /api/docs:
 *   post:
 *     summary: Create document
 *     tags: [Documents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [org_id, title, type, source]
 *             properties:
 *               org_id: { type: integer }
 *               title: { type: string }
 *               type: { type: string }
 *               source: { type: string }
 *               storage_url: { type: string }
 *               mime_type: { type: string }
 *               size_bytes: { type: integer }
 *     responses:
 *       201:
 *         description: Document created
 */
router.post('/', asyncHandler(async (req, res) => {
  const { org_id, title, type, source, storage_url, mime_type, size_bytes } = req.body;

  if (!org_id || !title || !type || !source) {
    return badRequest(res, 'org_id, title, type, source required');
  }

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, org_id)
    .input('title', sql.NVarChar(255), title)
    .input('type', sql.VarChar(50), type)
    .input('source', sql.VarChar(50), source)
    .input('storageUrl', sql.NVarChar(500), storage_url)
    .input('mimeType', sql.NVarChar(100), mime_type)
    .input('sizeBytes', sql.BigInt, size_bytes)
    .input('createdBy', sql.Int, 1) // Placeholder user ID
    .query(`
      INSERT INTO app.document (org_id, title, type, source, storage_url, mime_type, size_bytes, created_by_user_id)
      OUTPUT INSERTED.*
      VALUES (@orgId, @title, @type, @source, @storageUrl, @mimeType, @sizeBytes, @createdBy)
    `);

  const created = result.recordset[0];
  await emitOutboxEvent('document.created', { org_id, document_id: created.id });

  ok(res, created, 201);
}));

/**
 * @openapi
 * /api/docs/{id}/versions:
 *   post:
 *     summary: Add document version
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storage_ref, hash_sha256]
 *             properties:
 *               storage_ref: { type: string }
 *               hash_sha256: { type: string }
 *               change_note: { type: string }
 *     responses:
 *       201:
 *         description: Version added
 */
router.post('/:id/versions', asyncHandler(async (req, res) => {
  const documentId = Number(req.params.id);
  const { storage_ref, hash_sha256, change_note } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!storage_ref || !hash_sha256) return badRequest(res, 'storage_ref, hash_sha256 required');

  const pool = await getPool();

  // Get next version number
  const vnumResult = await pool.request()
    .input('documentId', sql.Int, documentId)
    .query('SELECT ISNULL(MAX(vnum), 0) + 1 as nextVnum FROM app.document_version WHERE document_id = @documentId');

  const nextVnum = vnumResult.recordset[0].nextVnum;

  const result = await pool.request()
    .input('documentId', sql.Int, documentId)
    .input('orgId', sql.Int, orgId)
    .input('vnum', sql.Int, nextVnum)
    .input('authorId', sql.Int, 1) // Placeholder
    .input('changeNote', sql.NVarChar(500), change_note)
    .input('storageRef', sql.NVarChar(500), storage_ref)
    .input('hashSha256', sql.VarBinary(32), Buffer.from(hash_sha256, 'hex'))
    .input('hashPrefix', sql.NVarChar(12), hash_sha256.substring(0, 12))
    .query(`
      INSERT INTO app.document_version (document_id, org_id, vnum, author_id, change_note, storage_ref, hash_sha256, hash_prefix)
      OUTPUT INSERTED.*
      VALUES (@documentId, @orgId, @vnum, @authorId, @changeNote, @storageRef, @hashSha256, @hashPrefix)
    `);

  const created = result.recordset[0];
  await emitOutboxEvent('document.version.added', { org_id: orgId, document_id: documentId, version_id: created.id });

  ok(res, created, 201);
}));

/**
 * @openapi
 * /api/docs/{id}/status:
 *   patch:
 *     summary: Update document status
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string }
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const documentId = Number(req.params.id);
  const { status } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!status) return badRequest(res, 'status required');

  const pool = await getPool();
  await assertDocumentCanTransition(orgId, documentId, status, pool);

  await pool.request()
    .input('documentId', sql.Int, documentId)
    .input('status', sql.VarChar(50), status)
    .query('UPDATE app.document SET status = @status WHERE id = @documentId AND org_id = @orgId');

  if (status === 'released') {
    await emitOutboxEvent('document.released', { org_id: orgId, document_id: documentId });
  }

  ok(res, { id: documentId, status });
}));

/**
 * @openapi
 * /api/docs/{id}/share:
 *   post:
 *     summary: Create share link
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scope]
 *             properties:
 *               scope: { type: string }
 *               expires_at: { type: string }
 *               watermark: { type: boolean }
 *     responses:
 *       201:
 *         description: Share link created
 */
router.post('/:id/share', asyncHandler(async (req, res) => {
  const documentId = Number(req.params.id);
  const { scope, expires_at, watermark } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!scope) return badRequest(res, 'scope required');

  const pool = await getPool();
  const token = require('crypto').randomBytes(32).toString('hex');

  const result = await pool.request()
    .input('documentId', sql.Int, documentId)
    .input('orgId', sql.Int, orgId)
    .input('token', sql.NVarChar(64), token)
    .input('scope', sql.VarChar(50), scope)
    .input('expiresAt', sql.DateTime2, expires_at)
    .input('watermark', sql.Bit, watermark ? 1 : 0)
    .query(`
      INSERT INTO app.share_link (document_id, org_id, token, scope, expires_at, watermark)
      OUTPUT INSERTED.*
      VALUES (@documentId, @orgId, @token, @scope, @expiresAt, @watermark)
    `);

  ok(res, result.recordset[0], 201);
}));

export default router;
