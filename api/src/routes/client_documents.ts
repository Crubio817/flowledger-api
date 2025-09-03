import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound, getPagination } from '../utils/http';
import { ClientDocumentCreate, ClientDocumentUpdate } from '../validation/schemas';
import { logActivity } from '../utils/activity';

const router = Router();

/**
 * @openapi
 * /api/client-documents:
 *   get:
 *     summary: List client documents
 *     tags: [ClientDocuments]
 *     responses:
 *       200:
 *         description: Documents list
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
 *                       doc_id: { type: integer }
 *                       client_id: { type: integer }
 *                       doc_code: { type: string }
 *                       title: { type: string }
 *                       status: { type: string }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *   post:
 *     summary: Create client document
 *     tags: [ClientDocuments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, doc_code]
 *             properties:
 *               client_id: { type: integer }
 *               doc_code: { type: string }
 *               title: { type: string }
 *               status: { type: string }
 *     responses:
 *       201:
 *         description: Document created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     doc_id: { type: integer }
 *                     client_id: { type: integer }
 *                     doc_code: { type: string }
 *                     title: { type: string }
 *                     status: { type: string }
 */
router.get('/', asyncHandler(async (req, res) => { const { page, limit, offset } = getPagination(req); const pool = await getPool(); const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(`SELECT doc_id, client_id, doc_code, title, status, COUNT(*) OVER() AS total FROM app.client_documents ORDER BY doc_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`); const total = r.recordset[0]?.total ?? 0; const items = r.recordset.map((row: any)=>{ const { total: _t, ...rest } = row; return rest; }); listOk(res, items, { page, limit, total }); }));
/**
 * @openapi
 * /api/client-documents/{id}:
 *   get:
 *     summary: Get client document by id
 *     tags: [ClientDocuments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     doc_id: { type: integer }
 *                     client_id: { type: integer }
 *                     doc_code: { type: string }
 *                     title: { type: string }
 *                     status: { type: string }
 *   put:
 *     summary: Update client document
 *     tags: [ClientDocuments]
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
 *               doc_code: { type: string }
 *               title: { type: string }
 *               status: { type: string }
 *     responses:
 *       200:
 *         description: Document updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     doc_id: { type: integer }
 *                     client_id: { type: integer }
 *                     doc_code: { type: string }
 *                     title: { type: string }
 *                     status: { type: string }
 *   delete:
 *     summary: Delete client document
 *     tags: [ClientDocuments]
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
router.get('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res,'id must be a positive integer'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`SELECT doc_id, client_id, doc_code, title, status FROM app.client_documents WHERE doc_id=@id`); const row = r.recordset[0]; if (!row) return notFound(res); ok(res, row); }));
router.post('/', asyncHandler(async (req, res) => { const parsed = ClientDocumentCreate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; ')); const { client_id, doc_code, title = null, status = 'placeholder' } = parsed.data; const pool = await getPool(); const result = await pool.request().input('client_id', sql.Int, client_id).input('doc_code', sql.NVarChar(80), doc_code).input('title', sql.NVarChar(200), title).input('status', sql.NVarChar(40), status).query(`INSERT INTO app.client_documents (client_id, doc_code, title, status) OUTPUT INSERTED.doc_id, INSERTED.client_id, INSERTED.doc_code, INSERTED.title, INSERTED.status VALUES (@client_id, @doc_code, @title, @status)`); await logActivity({ type: 'ClientDocumentCreated', title: `Created document ${doc_code} for client ${client_id}`, client_id }); ok(res, result.recordset[0], 201); }));
router.put('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res,'id must be a positive integer'); const parsed = ClientDocumentUpdate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; ')); const data = parsed.data; const sets: string[] = []; const pool = await getPool(); const request = pool.request().input('id', sql.Int, id); if (data.doc_code !== undefined) { sets.push('doc_code=@doc_code'); request.input('doc_code', sql.NVarChar(80), data.doc_code); } if (data.title !== undefined) { sets.push('title=@title'); request.input('title', sql.NVarChar(200), data.title); } if (data.status !== undefined) { sets.push('status=@status'); request.input('status', sql.NVarChar(40), data.status); } if (!sets.length) return badRequest(res,'No fields to update'); const result = await request.query(`UPDATE app.client_documents SET ${sets.join(', ')} WHERE doc_id=@id`); if (result.rowsAffected[0]===0) return notFound(res); const read = await pool.request().input('id', sql.Int, id).query(`SELECT doc_id, client_id, doc_code, title, status FROM app.client_documents WHERE doc_id=@id`); await logActivity({ type: 'ClientDocumentUpdated', title: `Updated document ${id}`, client_id: read.recordset[0].client_id }); ok(res, read.recordset[0]); }));
router.delete('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res,'id must be a positive integer'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.client_documents WHERE doc_id=@id`); if (r.rowsAffected[0]===0) return notFound(res); await logActivity({ type: 'ClientDocumentDeleted', title: `Deleted document ${id}`, client_id: null }); ok(res, { deleted: r.rowsAffected[0] }); }));
export default router;
