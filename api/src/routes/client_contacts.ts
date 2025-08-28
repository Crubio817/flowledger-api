import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound, getPagination } from '../utils/http';
import { ClientContactCreate, ClientContactUpdate } from '../validation/schemas';

const router = Router();

/**
 * @openapi
 * /api/client-contacts:
 *   get:
 *     summary: List client contacts
 *     tags: [ClientContacts]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Contacts list
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
 *                       contact_id: { type: integer }
 *                       client_id: { type: integer }
 *                       first_name: { type: string }
 *                       last_name: { type: string }
 *                       email: { type: string }
 *                       phone: { type: string }
 *                       title: { type: string }
 *                       is_primary: { type: boolean }
 *                       is_active: { type: boolean }
 *                 meta:
 *                   $ref: '#/components/schemas/PageMeta'
 *   post:
 *     summary: Create client contact
 *     tags: [ClientContacts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id]
 *             properties:
 *               client_id: { type: integer }
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               title: { type: string }
 *               is_primary: { type: boolean }
 *               is_active: { type: boolean }
 *     responses:
 *       201:
 *         description: Contact created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     contact_id: { type: integer }
 *                     client_id: { type: integer }
 *                     first_name: { type: string }
 *                     last_name: { type: string }
 *                     email: { type: string }
 *                     phone: { type: string }
 *                     title: { type: string }
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req);
  const pool = await getPool();
  const r = await pool
    .request()
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT contact_id, client_id, first_name, last_name, email, phone, title,
             is_primary, is_active, created_utc, updated_utc,
             COUNT(*) OVER() AS total
      FROM app.client_contacts
      ORDER BY contact_id
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  const total = r.recordset[0]?.total ?? 0;
  const items = r.recordset.map((row:any)=>{ const { total: _t, ...rest } = row; return rest; });
  listOk(res, items, { page, limit, total });
}));

/**
 * @openapi
 * /api/client-contacts/{id}:
 *   get:
 *     summary: Get client contact by id
 *     tags: [ClientContacts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Contact
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     contact_id: { type: integer }
 *                     client_id: { type: integer }
 *                     first_name: { type: string }
 *                     last_name: { type: string }
 *                     email: { type: string }
 *                     phone: { type: string }
 *                     title: { type: string }
 *   put:
 *     summary: Update client contact
 *     tags: [ClientContacts]
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
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               title: { type: string }
 *               is_primary: { type: boolean }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Contact updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     contact_id: { type: integer }
 *                     client_id: { type: integer }
 *                     first_name: { type: string }
 *                     last_name: { type: string }
 *                     email: { type: string }
 *                     phone: { type: string }
 *   delete:
 *     summary: Delete client contact
 *     tags: [ClientContacts]
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
router.post('/', asyncHandler(async (req, res) => {
  const parsed = ClientContactCreate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
  const { client_id, first_name = null, last_name = null, email = null, phone = null, title = null, is_primary = false, is_active = true } = parsed.data;
  const pool = await getPool();
  const result = await pool
    .request()
    .input('client_id', sql.Int, client_id)
    .input('first_name', sql.NVarChar(100), first_name)
    .input('last_name', sql.NVarChar(100), last_name)
    .input('email', sql.NVarChar(200), email)
    .input('phone', sql.NVarChar(60), phone)
    .input('title', sql.NVarChar(200), title)
    .input('is_primary', sql.Bit, is_primary ? 1 : 0)
    .input('is_active', sql.Bit, is_active ? 1 : 0)
    .query(
      `INSERT INTO app.client_contacts (client_id, first_name, last_name, email, phone, title, is_primary, is_active)
       OUTPUT INSERTED.contact_id, INSERTED.client_id, INSERTED.first_name, INSERTED.last_name, INSERTED.email,
              INSERTED.phone, INSERTED.title, INSERTED.is_primary, INSERTED.is_active, INSERTED.created_utc, INSERTED.updated_utc
       VALUES (@client_id, @first_name, @last_name, @email, @phone, @title, @is_primary, @is_active)`
    );
  ok(res, result.recordset[0], 201);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT contact_id, client_id, first_name, last_name, email, phone, title, is_primary, is_active, created_utc, updated_utc FROM app.client_contacts WHERE contact_id=@id`);
  const row = r.recordset[0];
  if (!row) return notFound(res);
  ok(res, row);
}));

router.put('/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
		const parsed = ClientContactUpdate.safeParse(req.body);
		if (!parsed.success) return badRequest(res, parsed.error.issues.map((i) => i.message).join('; '));
		const data = parsed.data;
		const sets: string[] = [];
		const pool = await getPool();
		const request = pool.request().input('id', sql.Int, id);
		if (data.first_name !== undefined) { sets.push('first_name=@first_name'); request.input('first_name', sql.NVarChar(100), data.first_name); }
		if (data.last_name !== undefined) { sets.push('last_name=@last_name'); request.input('last_name', sql.NVarChar(100), data.last_name); }
		if (data.email !== undefined) { sets.push('email=@email'); request.input('email', sql.NVarChar(200), data.email); }
		if (data.phone !== undefined) { sets.push('phone=@phone'); request.input('phone', sql.NVarChar(60), data.phone); }
		if (data.title !== undefined) { sets.push('title=@title'); request.input('title', sql.NVarChar(200), data.title); }
		if (data.is_primary !== undefined) { sets.push('is_primary=@is_primary'); request.input('is_primary', sql.Bit, data.is_primary ? 1 : 0); }
		if (data.is_active !== undefined) { sets.push('is_active=@is_active'); request.input('is_active', sql.Bit, data.is_active ? 1 : 0); }
		if (!sets.length) return badRequest(res, 'No fields to update');
		const result = await request.query(`UPDATE app.client_contacts SET ${sets.join(', ')} WHERE contact_id=@id`);
		if (result.rowsAffected[0] === 0) return notFound(res);
		const read = await pool.request().input('id', sql.Int, id).query(`SELECT contact_id, client_id, first_name, last_name, email, phone, title, is_primary, is_active, created_utc, updated_utc FROM app.client_contacts WHERE contact_id=@id`);
		ok(res, read.recordset[0]);
	}));

router.delete('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res,'id must be a positive integer'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.client_contacts WHERE contact_id=@id`); if (r.rowsAffected[0]===0) return notFound(res); ok(res, { deleted: r.rowsAffected[0] }); }));

export default router;
