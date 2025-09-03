import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { ClientNoteCreateBody, ClientNoteUpdateBody } from '../validation/schemas';
import { logActivity } from '../utils/activity';

const router = Router();

// Normalize client note row
function normalizeClientNoteRow(row: any) {
  if (!row) return row;
  const toNum = (k: string) => {
    if (row[k] !== undefined && row[k] !== null && typeof row[k] !== 'number') {
      const n = Number(row[k]);
      if (!Number.isNaN(n)) row[k] = n;
    }
  };
  toNum('note_id');
  toNum('client_id');
  return row;
}

async function clientNoteExists(noteId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.BigInt, noteId).query(
    `SELECT note_id FROM app.client_notes WHERE note_id = @id`
  );
  return r.recordset.length > 0;
}

async function clientExists(clientId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.BigInt, clientId).query(
    `SELECT client_id FROM app.clients WHERE client_id = @id`
  );
  return r.recordset.length > 0;
}

/**
 * @openapi
 * /api/clients/{client_id}/notes:
 *   get:
 *     summary: List notes for a client
 *     parameters:
 *       - in: path
 *         name: client_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: note_type
 *         schema: { type: string }
 *       - in: query
 *         name: include_inactive
 *         schema: { type: boolean }
 *       - in: query
 *         name: important_only
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: page_size
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { type: array, items: { $ref: '#/components/schemas/ClientNote' } }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 */
router.get(
  '/clients/:client_id/notes',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const pool = await getPool();
    const clientId = Number(req.params.client_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');

    const noteType = req.query.note_type as string;
    const includeInactive = req.query.include_inactive === '1' || req.query.include_inactive === 'true';
    const importantOnly = req.query.important_only === '1' || req.query.important_only === 'true';

    if (!(await clientExists(clientId))) return notFound(res);

    let where = 'cn.client_id = @client_id';
    const request = pool.request().input('client_id', sql.BigInt, clientId).input('offset', sql.Int, offset).input('limit', sql.Int, limit);

    if (!includeInactive) {
      where += ' AND cn.is_active = 1';
    }
    if (importantOnly) {
      where += ' AND cn.is_important = 1';
    }
    if (noteType) {
      request.input('note_type', sql.NVarChar(50), noteType);
      where += ' AND cn.note_type = @note_type';
    }

    const result = await request.query(`
      SELECT cn.note_id, cn.client_id, cn.title, cn.content, cn.note_type, cn.is_important, cn.is_active,
             cn.created_utc, cn.updated_utc, cn.created_by, cn.updated_by
      FROM app.client_notes cn
      WHERE ${where}
      ORDER BY cn.is_important DESC, cn.created_utc DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
    const rows = (result.recordset || []).map(normalizeClientNoteRow);
    listOk(res, rows, { page, limit });
  })
);

/**
 * @openapi
 * /api/clients/{client_id}/notes/{note_id}:
 *   get:
 *     summary: Get client note by id
 *     parameters:
 *       - in: path
 *         name: client_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: note_id
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
 *                 data: { $ref: '#/components/schemas/ClientNote' }
 */
router.get(
  '/clients/:client_id/notes/:note_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    const noteId = Number(req.params.note_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    if (!Number.isInteger(noteId) || noteId <= 0) return badRequest(res, 'note_id must be a positive integer');

    const pool = await getPool();
    const result = await pool.request()
      .input('client_id', sql.BigInt, clientId)
      .input('note_id', sql.BigInt, noteId)
      .query(`
        SELECT note_id, client_id, title, content, note_type, is_important, is_active,
               created_utc, updated_utc, created_by, updated_by
        FROM app.client_notes
        WHERE note_id = @note_id AND client_id = @client_id
      `);

    const row = result.recordset[0];
    if (!row) return notFound(res);
    ok(res, normalizeClientNoteRow(row));
  })
);

/**
 * @openapi
 * /api/clients/{client_id}/notes:
 *   post:
 *     summary: Create client note
 *     parameters:
 *       - in: path
 *         name: client_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClientNoteCreateBody' }
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/ClientNote' }
 */
router.post(
  '/clients/:client_id/notes',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');

    const parsed = ClientNoteCreateBody.safeParse({ ...req.body, client_id: clientId });
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;

    const pool = await getPool();

    if (!(await clientExists(clientId))) return notFound(res, 'Client not found');

    const request = pool.request()
      .input('client_id', sql.BigInt, data.client_id)
      .input('title', sql.NVarChar(200), data.title)
      .input('content', sql.NVarChar(sql.MAX), data.content)
      .input('note_type', sql.NVarChar(50), data.note_type)
      .input('is_important', sql.Bit, data.is_important || false)
      .input('is_active', sql.Bit, data.is_active !== false) // default to true
      .input('created_by', sql.NVarChar(100), data.created_by);

    await request.query(`
      INSERT INTO app.client_notes (client_id, title, content, note_type, is_important, is_active, created_by)
      VALUES (@client_id, @title, @content, @note_type, @is_important, @is_active, @created_by)
    `);

    const read = await pool.request().query(`
      SELECT note_id, client_id, title, content, note_type, is_important, is_active,
             created_utc, updated_utc, created_by, updated_by
      FROM app.client_notes
      WHERE note_id = SCOPE_IDENTITY()
    `);

    const created = read.recordset[0];
    normalizeClientNoteRow(created);
    if (created && created.note_id) res.setHeader('Location', `/clients/${clientId}/notes/${created.note_id}`);
    await logActivity({ type: 'ClientNoteCreated', title: `Note "${data.title}" created for client ${clientId}`, client_id: clientId });
    ok(res, created, 201);
  })
);

/**
 * @openapi
 * /api/clients/{client_id}/notes/{note_id}:
 *   put:
 *     summary: Update client note (full replace)
 *     parameters:
 *       - in: path
 *         name: client_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: note_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClientNoteUpdateBody' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/ClientNote' }
 */
router.put(
  '/clients/:client_id/notes/:note_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    const noteId = Number(req.params.note_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    if (!Number.isInteger(noteId) || noteId <= 0) return badRequest(res, 'note_id must be a positive integer');

    const parsed = ClientNoteUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;

    const pool = await getPool();

    // Verify the note exists and belongs to the client
    const existing = await pool.request()
      .input('client_id', sql.BigInt, clientId)
      .input('note_id', sql.BigInt, noteId)
      .query(`SELECT note_id FROM app.client_notes WHERE note_id = @note_id AND client_id = @client_id`);

    if (existing.recordset.length === 0) return notFound(res);

    const sets: string[] = [];
    const request = pool.request().input('note_id', sql.BigInt, noteId);

    if (data.title !== undefined) { sets.push('title = @title'); request.input('title', sql.NVarChar(200), data.title); }
    if (data.content !== undefined) { sets.push('content = @content'); request.input('content', sql.NVarChar(sql.MAX), data.content); }
    if (data.note_type !== undefined) { sets.push('note_type = @note_type'); request.input('note_type', sql.NVarChar(50), data.note_type); }
    if (data.is_important !== undefined) { sets.push('is_important = @is_important'); request.input('is_important', sql.Bit, data.is_important); }
    if (data.is_active !== undefined) { sets.push('is_active = @is_active'); request.input('is_active', sql.Bit, data.is_active); }
    if (data.updated_by !== undefined) { sets.push('updated_by = @updated_by'); request.input('updated_by', sql.NVarChar(100), data.updated_by); }

    sets.push('updated_utc = SYSUTCDATETIME()');

    await request.query(`UPDATE app.client_notes SET ${sets.join(', ')} WHERE note_id = @note_id`);

    const read = await pool.request()
      .input('note_id', sql.BigInt, noteId)
      .query(`
        SELECT note_id, client_id, title, content, note_type, is_important, is_active,
               created_utc, updated_utc, created_by, updated_by
        FROM app.client_notes
        WHERE note_id = @note_id
      `);

    const updated = read.recordset[0];
    normalizeClientNoteRow(updated);
    await logActivity({ type: 'ClientNoteUpdated', title: `Note ${noteId} updated for client ${clientId}`, client_id: clientId });
    ok(res, updated);
  })
);

/**
 * @openapi
 * /api/clients/{client_id}/notes/{note_id}:
 *   patch:
 *     summary: Update client note (partial)
 *     parameters:
 *       - in: path
 *         name: client_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: note_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClientNoteUpdateBody' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/ClientNote' }
 */
router.patch(
  '/clients/:client_id/notes/:note_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    const noteId = Number(req.params.note_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    if (!Number.isInteger(noteId) || noteId <= 0) return badRequest(res, 'note_id must be a positive integer');

    const parsed = ClientNoteUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;

    const pool = await getPool();

    // Verify the note exists and belongs to the client
    const existing = await pool.request()
      .input('client_id', sql.BigInt, clientId)
      .input('note_id', sql.BigInt, noteId)
      .query(`SELECT note_id FROM app.client_notes WHERE note_id = @note_id AND client_id = @client_id`);

    if (existing.recordset.length === 0) return notFound(res);

    const sets: string[] = [];
    const request = pool.request().input('note_id', sql.BigInt, noteId);

    if (data.title !== undefined) { sets.push('title = @title'); request.input('title', sql.NVarChar(200), data.title); }
    if (data.content !== undefined) { sets.push('content = @content'); request.input('content', sql.NVarChar(sql.MAX), data.content); }
    if (data.note_type !== undefined) { sets.push('note_type = @note_type'); request.input('note_type', sql.NVarChar(50), data.note_type); }
    if (data.is_important !== undefined) { sets.push('is_important = @is_important'); request.input('is_important', sql.Bit, data.is_important); }
    if (data.is_active !== undefined) { sets.push('is_active = @is_active'); request.input('is_active', sql.Bit, data.is_active); }
    if (data.updated_by !== undefined) { sets.push('updated_by = @updated_by'); request.input('updated_by', sql.NVarChar(100), data.updated_by); }

    sets.push('updated_utc = SYSUTCDATETIME()');

    await request.query(`UPDATE app.client_notes SET ${sets.join(', ')} WHERE note_id = @note_id`);

    const read = await pool.request()
      .input('note_id', sql.BigInt, noteId)
      .query(`
        SELECT note_id, client_id, title, content, note_type, is_important, is_active,
               created_utc, updated_utc, created_by, updated_by
        FROM app.client_notes
        WHERE note_id = @note_id
      `);

    const updated = read.recordset[0];
    normalizeClientNoteRow(updated);
    await logActivity({ type: 'ClientNoteUpdated', title: `Note ${noteId} updated for client ${clientId}`, client_id: clientId });
    ok(res, updated);
  })
);

/**
 * @openapi
 * /api/clients/{client_id}/notes/{note_id}:
 *   delete:
 *     summary: Delete client note (soft delete)
 *     parameters:
 *       - in: path
 *         name: client_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: note_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Note deleted
 */
router.delete(
  '/clients/:client_id/notes/:note_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    const noteId = Number(req.params.note_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    if (!Number.isInteger(noteId) || noteId <= 0) return badRequest(res, 'note_id must be a positive integer');

    const pool = await getPool();

    // Verify the note exists and belongs to the client
    const existing = await pool.request()
      .input('client_id', sql.BigInt, clientId)
      .input('note_id', sql.BigInt, noteId)
      .query(`SELECT note_id FROM app.client_notes WHERE note_id = @note_id AND client_id = @client_id`);

    if (existing.recordset.length === 0) return notFound(res);

    await pool.request()
      .input('note_id', sql.BigInt, noteId)
      .query(`UPDATE app.client_notes SET is_active = 0, updated_utc = SYSUTCDATETIME() WHERE note_id = @note_id`);

    await logActivity({ type: 'ClientNoteDeleted', title: `Note ${noteId} deleted for client ${clientId}`, client_id: clientId });
    ok(res, { deleted: true });
  })
);

export default router;
