import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound, getPagination } from '../utils/http';
import { ClientIntegrationCreate, ClientIntegrationUpdate } from '../validation/schemas';
import { logActivity } from '../utils/activity';

const router = Router();

/**
 * @openapi
 * /api/client-integrations:
 *   get:
 *     summary: List client integrations
 *     tags: [ClientIntegrations]
 *     responses:
 *       200:
 *         description: Integrations list
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
 *                       integration_id: { type: integer }
 *                       client_id: { type: integer }
 *                       integration_code: { type: string }
 *                       status: { type: string }
 *                       config_json: { type: string }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *   post:
 *     summary: Create client integration
 *     tags: [ClientIntegrations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, integration_code]
 *             properties:
 *               client_id: { type: integer }
 *               integration_code: { type: string }
 *               status: { type: string }
 *               config_json: { type: string }
 *     responses:
 *       201:
 *         description: Integration created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     integration_id: { type: integer }
 *                     client_id: { type: integer }
 *                     integration_code: { type: string }
 *                     status: { type: string }
 *                     config_json: { type: string }
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req);
  const pool = await getPool();
  const r = await pool.request()
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .query(`SELECT integration_id, client_id, integration_code, status, config_json, COUNT(*) OVER() AS total FROM app.client_integrations ORDER BY integration_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  const total = r.recordset[0]?.total ?? 0;
  const items = r.recordset.map((row: any) => { const { total: _t, ...rest } = row; return rest; });
  listOk(res, items, { page, limit, total });
}));
/**
 * @openapi
 * /api/client-integrations/{id}:
 *   get:
 *     summary: Get client integration by id
 *     tags: [ClientIntegrations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Integration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     integration_id: { type: integer }
 *                     client_id: { type: integer }
 *                     integration_code: { type: string }
 *                     status: { type: string }
 *                     config_json: { type: string }
 *   put:
 *     summary: Update client integration
 *     tags: [ClientIntegrations]
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
 *               integration_code: { type: string }
 *               status: { type: string }
 *               config_json: { type: string }
 *     responses:
 *       200:
 *         description: Integration updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     integration_id: { type: integer }
 *                     client_id: { type: integer }
 *                     integration_code: { type: string }
 *                     status: { type: string }
 *                     config_json: { type: string }
 *   delete:
 *     summary: Delete client integration
 *     tags: [ClientIntegrations]
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
router.get('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`SELECT integration_id, client_id, integration_code, status, config_json FROM app.client_integrations WHERE integration_id=@id`); const row = r.recordset[0]; if (!row) return notFound(res); ok(res, row); }));
router.post('/', asyncHandler(async (req, res) => { const parsed = ClientIntegrationCreate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; ')); const { client_id, integration_code, status = 'waiting', config_json = null } = parsed.data; const pool = await getPool(); const result = await pool.request().input('client_id', sql.Int, client_id).input('integration_code', sql.NVarChar(80), integration_code).input('status', sql.NVarChar(40), status).input('config_json', sql.NVarChar(sql.MAX), config_json).query(`INSERT INTO app.client_integrations (client_id, integration_code, status, config_json) OUTPUT INSERTED.integration_id, INSERTED.client_id, INSERTED.integration_code, INSERTED.status, INSERTED.config_json VALUES (@client_id, @integration_code, @status, @config_json)`); await logActivity({ type: 'ClientIntegrationCreated', title: `Created integration ${integration_code} for client ${client_id}`, client_id }); ok(res, result.recordset[0], 201); }));
router.put('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer'); const parsed = ClientIntegrationUpdate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; ')); const data = parsed.data; const sets: string[] = []; const pool = await getPool(); const request = pool.request().input('id', sql.Int, id); if (data.integration_code !== undefined) { sets.push('integration_code=@integration_code'); request.input('integration_code', sql.NVarChar(80), data.integration_code); } if (data.status !== undefined) { sets.push('status=@status'); request.input('status', sql.NVarChar(40), data.status); } if (data.config_json !== undefined) { sets.push('config_json=@config_json'); request.input('config_json', sql.NVarChar(sql.MAX), data.config_json); } if (!sets.length) return badRequest(res, 'No fields to update'); const result = await request.query(`UPDATE app.client_integrations SET ${sets.join(', ')} WHERE integration_id=@id`); if (result.rowsAffected[0]===0) return notFound(res); const read = await pool.request().input('id', sql.Int, id).query(`SELECT integration_id, client_id, integration_code, status, config_json FROM app.client_integrations WHERE integration_id=@id`); await logActivity({ type: 'ClientIntegrationUpdated', title: `Updated integration ${id}`, client_id: read.recordset[0].client_id }); ok(res, read.recordset[0]); }));
router.delete('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.client_integrations WHERE integration_id=@id`); if (r.rowsAffected[0]===0) return notFound(res); await logActivity({ type: 'ClientIntegrationDeleted', title: `Deleted integration ${id}`, client_id: null }); ok(res, { deleted: r.rowsAffected[0] }); }));
export default router;
