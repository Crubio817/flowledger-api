import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { logActivity } from '../utils/activity';

const router = Router();

/**
 * @openapi
 * /api/clients:
 *   get:
 *     summary: List clients
 *     tags: [Clients]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Clients list
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
 *                       client_id: { type: integer }
 *                       name: { type: string }
 *                       is_active: { type: boolean }
 *                       created_utc: { type: string, format: date-time }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
  const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const pool = await getPool();
    const result = await pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(
        `SELECT client_id, name, is_active, created_utc
         FROM app.clients
         ORDER BY client_id
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
    listOk(res, result.recordset, { page, limit });
  })
);

router.get(
  '/:client_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (Number.isNaN(clientId)) return badRequest(res, 'client_id must be int');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, clientId).query(
      `SELECT client_id, name, is_active, created_utc
       FROM app.clients WHERE client_id = @id`
    );
  const row = result.recordset[0];
  if (!row) return notFound(res);
    ok(res, row);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { client_id, name, is_active = true } = req.body || {};
    if (typeof client_id !== 'number' || !name || typeof name !== 'string')
      return badRequest(res, 'client_id (number) and name (string) are required');

    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.Int, client_id)
      .input('name', sql.NVarChar(200), name)
      .input('active', sql.Bit, is_active ? 1 : 0)
      .query(`INSERT INTO app.clients (client_id, name, is_active) VALUES (@id, @name, @active)`);

    const read = await pool.request().input('id', sql.Int, client_id).query(
      `SELECT client_id, name, is_active, created_utc FROM app.clients WHERE client_id = @id`
    );
  const created = read.recordset[0];
  await logActivity({ type: 'ClientCreated', title: `Client ${name} created`, client_id: client_id });
  ok(res, created, 201);
  })
);

router.put(
  '/:client_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (Number.isNaN(clientId)) return badRequest(res, 'client_id must be int');

    const sets: string[] = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, clientId);

    if (typeof req.body.name === 'string') {
      sets.push('name = @name');
      request.input('name', sql.NVarChar(200), req.body.name);
    }
    if (typeof req.body.is_active === 'boolean') {
      sets.push('is_active = @active');
      request.input('active', sql.Bit, req.body.is_active ? 1 : 0);
    }
    if (!sets.length) return badRequest(res, 'No fields to update');

  const result = await request.query(`UPDATE app.clients SET ${sets.join(', ')} WHERE client_id = @id`);
  if (result.rowsAffected[0] === 0) return notFound(res);

    const read = await pool.request().input('id', sql.Int, clientId).query(
      `SELECT client_id, name, is_active, created_utc FROM app.clients WHERE client_id = @id`
    );
  const updated = read.recordset[0];
  await logActivity({ type: 'ClientUpdated', title: `Client ${clientId} updated`, client_id: clientId });
  ok(res, updated);
  })
);

router.delete(
  '/:client_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (Number.isNaN(clientId)) return badRequest(res, 'client_id must be int');
    const pool = await getPool();
    try {
      const result = await pool.request().input('id', sql.Int, clientId).query(
        `DELETE FROM app.clients WHERE client_id = @id`
      );
  if (result.rowsAffected[0] === 0) return notFound(res);
  await logActivity({ type: 'ClientDeleted', title: `Client ${clientId} deleted`, client_id: clientId });
  ok(res, { deleted: result.rowsAffected[0] });
    } catch (e: any) {
      // Likely FK violation
      res.status(409).json({ status: 'error', data: null, error: e.message });
    }
  })
);

export default router;
