import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { ClientContactCreate, ClientContactUpdate } from '../validation/schemas';

const router = Router();

/**
 * @openapi
 * /api/client-contacts:
 *   get:
 *     summary: List client contacts
 *     tags: [ClientContacts]
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
 *                       name: { type: string }
 *                       email: { type: string }
 *                       phone: { type: string }
 *                       role: { type: string }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *   post:
 *     summary: Create client contact
 *     tags: [ClientContacts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, name]
 *             properties:
 *               client_id: { type: integer }
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               role: { type: string }
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
 *                     name: { type: string }
 *                     email: { type: string }
 *                     phone: { type: string }
 *                     role: { type: string }
 */
router.get('/', asyncHandler(async (req, res) => { const { page, limit, offset } = (await import('../utils/http')).getPagination(req); const pool = await getPool(); const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(`SELECT contact_id, client_id, name, email, phone, role FROM app.client_contacts ORDER BY contact_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`); listOk(res, r.recordset, { page, limit, total: r.recordset.length }); }));
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
 *                     name: { type: string }
 *                     email: { type: string }
 *                     phone: { type: string }
 *                     role: { type: string }
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
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               role: { type: string }
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
 *                     name: { type: string }
 *                     email: { type: string }
 *                     phone: { type: string }
 *                     role: { type: string }
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
router.post('/', asyncHandler(async (req, res) => { const parsed = ClientContactCreate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; ')); const { client_id, name, email = null, phone = null, role = null } = parsed.data; const pool = await getPool(); await pool.request().input('client_id', sql.Int, client_id).input('name', sql.NVarChar(200), name).input('email', sql.NVarChar(200), email).input('phone', sql.NVarChar(60), phone).input('role', sql.NVarChar(100), role).query(`INSERT INTO app.client_contacts (client_id, name, email, phone, role) VALUES (@client_id, @name, @email, @phone, @role)`); const read = await pool.request().query(`SELECT TOP 1 contact_id, client_id, name, email, phone, role FROM app.client_contacts ORDER BY contact_id DESC`); ok(res, read.recordset[0], 201); }));
router.put('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (Number.isNaN(id)) return badRequest(res,'id must be int'); const parsed = ClientContactUpdate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; ')); const data = parsed.data; const sets: string[] = []; const pool = await getPool(); const request = pool.request().input('id', sql.Int, id); if (data.name !== undefined) { sets.push('name=@name'); request.input('name', sql.NVarChar(200), data.name); } if (data.email !== undefined) { sets.push('email=@email'); request.input('email', sql.NVarChar(200), data.email); } if (data.phone !== undefined) { sets.push('phone=@phone'); request.input('phone', sql.NVarChar(60), data.phone); } if (data.role !== undefined) { sets.push('role=@role'); request.input('role', sql.NVarChar(100), data.role); } if (!sets.length) return badRequest(res,'No fields to update'); const result = await request.query(`UPDATE app.client_contacts SET ${sets.join(', ')} WHERE contact_id=@id`); if (result.rowsAffected[0]===0) return notFound(res); const read = await pool.request().input('id', sql.Int, id).query(`SELECT contact_id, client_id, name, email, phone, role FROM app.client_contacts WHERE contact_id=@id`); ok(res, read.recordset[0]); }));
router.delete('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (Number.isNaN(id)) return badRequest(res,'id must be int'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.client_contacts WHERE contact_id=@id`); if (r.rowsAffected[0]===0) return notFound(res); ok(res, { deleted: r.rowsAffected[0] }); }));
export default router;
