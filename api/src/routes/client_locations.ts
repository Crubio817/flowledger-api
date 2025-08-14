import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { ClientLocationCreate, ClientLocationUpdate } from '../validation/schemas';

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
 *                       address: { type: string }
 *                       active: { type: boolean }
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
 *             required: [client_id, name]
 *             properties:
 *               client_id: { type: integer }
 *               name: { type: string }
 *               address: { type: string }
 *               active: { type: boolean }
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
 *                     address: { type: string }
 *                     active: { type: boolean }
 */
router.get('/', asyncHandler(async (req, res) => { const { page, limit, offset } = (await import('../utils/http')).getPagination(req); const pool = await getPool(); const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(`SELECT location_id, client_id, name, address, active FROM app.client_locations ORDER BY location_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`); listOk(res, r.recordset, { page, limit, total: r.recordset.length }); }));
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
 *                     address: { type: string }
 *                     active: { type: boolean }
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
 *               name: { type: string }
 *               address: { type: string }
 *               active: { type: boolean }
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
 *                     address: { type: string }
 *                     active: { type: boolean }
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
router.post('/', asyncHandler(async (req, res) => { const parsed = ClientLocationCreate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; ')); const { client_id, name, address = null, active = true } = parsed.data; const pool = await getPool(); await pool.request().input('client_id', sql.Int, client_id).input('name', sql.NVarChar(200), name).input('address', sql.NVarChar(1000), address).input('active', sql.Bit, active ? 1 : 0).query(`INSERT INTO app.client_locations (client_id, name, address, active) VALUES (@client_id, @name, @address, @active)`); const read = await pool.request().query(`SELECT TOP 1 location_id, client_id, name, address, active FROM app.client_locations ORDER BY location_id DESC`); ok(res, read.recordset[0], 201); }));
router.put('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (Number.isNaN(id)) return badRequest(res,'id must be int'); const parsed = ClientLocationUpdate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; ')); const data = parsed.data; const sets: string[] = []; const pool = await getPool(); const request = pool.request().input('id', sql.Int, id); if (data.name !== undefined) { sets.push('name=@name'); request.input('name', sql.NVarChar(200), data.name); } if (data.address !== undefined) { sets.push('address=@address'); request.input('address', sql.NVarChar(1000), data.address); } if (data.active !== undefined) { sets.push('active=@active'); request.input('active', sql.Bit, data.active ? 1 : 0); } if (!sets.length) return badRequest(res,'No fields to update'); const result = await request.query(`UPDATE app.client_locations SET ${sets.join(', ')} WHERE location_id=@id`); if (result.rowsAffected[0]===0) return notFound(res); const read = await pool.request().input('id', sql.Int, id).query(`SELECT location_id, client_id, name, address, active FROM app.client_locations WHERE location_id=@id`); ok(res, read.recordset[0]); }));
router.delete('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (Number.isNaN(id)) return badRequest(res,'id must be int'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.client_locations WHERE location_id=@id`); if (r.rowsAffected[0]===0) return notFound(res); ok(res, { deleted: r.rowsAffected[0] }); }));
export default router;
