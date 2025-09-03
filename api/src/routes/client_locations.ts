import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound, getPagination } from '../utils/http';
import { ClientLocationCreate, ClientLocationUpdate } from '../validation/schemas';
import { logActivity } from '../utils/activity';

const router = Router();

/**
 * @openapi
 * /api/client-locations:
 *   get:
 *     summary: List client locations
 *     tags: [ClientLocations]
 *     responses:
 *       200:
 *         description: Locations list
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
 *                       location_id: { type: integer }
 *                       client_id: { type: integer }
 *                       name: { type: string }
 *                       address_line1: { type: string }
 *                       address_line2: { type: string }
 *                       city: { type: string }
 *                       state_province: { type: string }
 *                       postal_code: { type: string }
 *                       country: { type: string }
 *                       is_primary: { type: boolean }
 *                       created_utc: { type: string, format: date-time }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *   post:
 *     summary: Create client location
 *     tags: [ClientLocations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, label, line1]
 *             properties:
 *               client_id: { type: integer }
 *               label: { type: string }
 *               line1: { type: string }
 *               line2: { type: string }
 *               city: { type: string }
 *               state_province: { type: string }
 *               postal_code: { type: string }
 *               country: { type: string }
 *               is_primary: { type: boolean }
 *     responses:
 *       201:
 *         description: Location created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     location_id: { type: integer }
 *                     client_id: { type: integer }
 *                     name: { type: string }
 *                     address_line1: { type: string }
 *                     address_line2: { type: string }
 *                     city: { type: string }
 *                     state_province: { type: string }
 *                     postal_code: { type: string }
 *                     country: { type: string }
 *                     is_primary: { type: boolean }
 *                     created_utc: { type: string, format: date-time }
 */
router.get('/', asyncHandler(async (req, res) => { const { page, limit, offset } = getPagination(req); const pool = await getPool(); const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(`SELECT location_id, client_id, label AS name, line1 AS address_line1, line2 AS address_line2, city, state_province, postal_code, country, is_primary, created_utc, COUNT(*) OVER() AS total FROM app.client_locations ORDER BY location_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`); const total = r.recordset[0]?.total ?? 0; const items = r.recordset.map((row:any)=>{ const { total: _t, ...rest } = row; return rest; }); listOk(res, items, { page, limit, total }); }));
router.post('/', asyncHandler(async (req, res) => { const parsed = ClientLocationCreate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; ')); const { client_id, label, line1, line2, city, state_province, postal_code, country, is_primary } = parsed.data; const pool = await getPool(); const result = await pool.request().input('client_id', sql.Int, client_id).input('label', sql.NVarChar(200), label).input('line1', sql.NVarChar(200), line1).input('line2', sql.NVarChar(200), line2 ?? null).input('city', sql.NVarChar(100), city ?? null).input('state_province', sql.NVarChar(100), state_province ?? null).input('postal_code', sql.NVarChar(20), postal_code ?? null).input('country', sql.NVarChar(100), country ?? null).input('is_primary', sql.Bit, is_primary ? 1 : 0).query(`INSERT INTO app.client_locations (client_id, label, line1, line2, city, state_province, postal_code, country, is_primary) OUTPUT INSERTED.location_id, INSERTED.client_id, INSERTED.label AS name, INSERTED.line1 AS address_line1, INSERTED.line2 AS address_line2, INSERTED.city, INSERTED.state_province, INSERTED.postal_code, INSERTED.country, INSERTED.is_primary, INSERTED.created_utc VALUES (@client_id, @label, @line1, @line2, @city, @state_province, @postal_code, @country, @is_primary)`); await logActivity({ type: 'ClientLocationCreated', title: `Created location ${label} for client ${client_id}`, client_id }); ok(res, result.recordset[0], 201); }));
/**
 * @openapi
 * /api/client-locations/{id}:
 *   get:
 *     summary: Get client location by id
 *     tags: [ClientLocations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Location
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     location_id: { type: integer }
 *                     client_id: { type: integer }
 *                     name: { type: string }
 *                     address_line1: { type: string }
 *                     address_line2: { type: string }
 *                     city: { type: string }
 *                     state_province: { type: string }
 *                     postal_code: { type: string }
 *                     country: { type: string }
 *                     is_primary: { type: boolean }
 *                     created_utc: { type: string, format: date-time }
 *   put:
 *     summary: Update client location
 *     tags: [ClientLocations]
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
 *               label: { type: string }
 *               line1: { type: string }
 *               line2: { type: string }
 *               city: { type: string }
 *               state_province: { type: string }
 *               postal_code: { type: string }
 *               country: { type: string }
 *               is_primary: { type: boolean }
 *     responses:
 *       200:
 *         description: Location updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     location_id: { type: integer }
 *                     client_id: { type: integer }
 *                     name: { type: string }
 *                     address_line1: { type: string }
 *                     address_line2: { type: string }
 *                     city: { type: string }
 *                     state_province: { type: string }
 *                     postal_code: { type: string }
 *                     country: { type: string }
 *                     is_primary: { type: boolean }
 *                     created_utc: { type: string, format: date-time }
 *   delete:
 *     summary: Delete client location
 *     tags: [ClientLocations]
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
router.get('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res,'id must be a positive integer'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`SELECT location_id, client_id, label AS name, line1 AS address_line1, line2 AS address_line2, city, state_province, postal_code, country, is_primary, created_utc FROM app.client_locations WHERE location_id=@id`); if (!r.recordset.length) return notFound(res); ok(res, r.recordset[0]); }));
router.put('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res,'id must be a positive integer'); const parsed = ClientLocationUpdate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; ')); const data = parsed.data; const sets: string[] = []; const pool = await getPool(); const request = pool.request().input('id', sql.Int, id); if (data.label !== undefined) { sets.push('label=@label'); request.input('label', sql.NVarChar(200), data.label); } if (data.line1 !== undefined) { sets.push('line1=@line1'); request.input('line1', sql.NVarChar(200), data.line1); } if (data.line2 !== undefined) { sets.push('line2=@line2'); request.input('line2', sql.NVarChar(200), data.line2); } if (data.city !== undefined) { sets.push('city=@city'); request.input('city', sql.NVarChar(100), data.city); } if (data.state_province !== undefined) { sets.push('state_province=@state_province'); request.input('state_province', sql.NVarChar(100), data.state_province); } if (data.postal_code !== undefined) { sets.push('postal_code=@postal_code'); request.input('postal_code', sql.NVarChar(20), data.postal_code); } if (data.country !== undefined) { sets.push('country=@country'); request.input('country', sql.NVarChar(100), data.country); } if (data.is_primary !== undefined) { sets.push('is_primary=@is_primary'); request.input('is_primary', sql.Bit, data.is_primary ? 1 : 0); } if (!sets.length) return badRequest(res,'No fields to update'); const result = await request.query(`UPDATE app.client_locations SET ${sets.join(', ')} WHERE location_id=@id`); if (result.rowsAffected[0]===0) return notFound(res); const read = await pool.request().input('id', sql.Int, id).query(`SELECT location_id, client_id, label AS name, line1 AS address_line1, line2 AS address_line2, city, state_province, postal_code, country, is_primary, created_utc FROM app.client_locations WHERE location_id=@id`); await logActivity({ type: 'ClientLocationUpdated', title: `Updated location ${id}`, client_id: read.recordset[0].client_id }); ok(res, read.recordset[0]); }));
router.delete('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res,'id must be a positive integer'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.client_locations WHERE location_id=@id`); if (r.rowsAffected[0]===0) return notFound(res); await logActivity({ type: 'ClientLocationDeleted', title: `Deleted location ${id}`, client_id: null }); ok(res, { deleted: r.rowsAffected[0] }); }));
export default router;
