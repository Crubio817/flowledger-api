import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { ClientCreateBody, ClientUpdateBody, CreateProcBody, ClientSetupBody } from '../validation/schemas';
import { orchestrateClientSetup } from '../utils/clientSetup';
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
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
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
    const parsed = ClientCreateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const { client_id, name, is_active = true } = parsed.data;
    if (typeof client_id !== 'number') return badRequest(res, 'client_id required');
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, client_id)
      .input('name', sql.NVarChar(200), name)
      .input('active', sql.Bit, is_active ? 1 : 0)
      .query(`INSERT INTO app.clients (client_id, name, is_active) VALUES (@id, @name, @active)`);
    const read = await pool.request().input('id', sql.Int, client_id).query(`SELECT client_id, name, is_active, created_utc FROM app.clients WHERE client_id = @id`);
    const created = read.recordset[0];
    await logActivity({ type: 'ClientCreated', title: `Client ${name} created`, client_id });
    ok(res, created, 201);
  })
);

router.put(
  '/:client_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    const parsed = ClientUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const data = parsed.data;
    const sets: string[] = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, clientId);
    if (data.name !== undefined) { sets.push('name = @name'); request.input('name', sql.NVarChar(200), data.name); }
    if (data.is_active !== undefined) { sets.push('is_active = @active'); request.input('active', sql.Bit, data.is_active ? 1 : 0); }
    if (!sets.length) return badRequest(res, 'No fields to update');
    const result = await request.query(`UPDATE app.clients SET ${sets.join(', ')} WHERE client_id = @id`);
    if (result.rowsAffected[0] === 0) return notFound(res);
    const read = await pool.request().input('id', sql.Int, clientId).query(`SELECT client_id, name, is_active, created_utc FROM app.clients WHERE client_id = @id`);
    const updated = read.recordset[0];
    await logActivity({ type: 'ClientUpdated', title: `Client ${clientId} updated`, client_id: clientId });
    ok(res, updated);
  })
);

router.delete(
  '/:client_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
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
      res.status(409).json({ error: { code: 'Conflict', message: e?.message || 'Conflict' } });
    }
  })
);

/**
 * @openapi
 * /api/clients/create-proc:
 *   post:
 *     summary: Create client via stored procedure sp_create_client
 *     description: Dynamically inspects parameters of app.sp_create_client and binds matching JSON body fields (strip leading @). Any OUTPUT params returned if present along with first recordset row.
 *     tags: [Clients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *             description: Keys must match stored procedure parameter names without the leading @ symbol.
 *     responses:
 *       200:
 *         description: Client created (procedure result)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     client: { type: object, additionalProperties: true }
 *                     proc_result: { type: object, additionalProperties: true }
 */
router.post(
  '/create-proc',
  asyncHandler(async (req, res) => {
    const parsed = CreateProcBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const pool = await getPool();
    // Introspect proc parameters
    const paramMeta = await pool.request().query(`
      SELECT p.name AS param_name, t.name AS type_name, p.max_length, p.is_output, p.has_default_value
      FROM sys.parameters p
      JOIN sys.procedures s ON p.object_id = s.object_id
      JOIN sys.schemas sc ON s.schema_id = sc.schema_id
      JOIN sys.types t ON p.user_type_id = t.user_type_id
      WHERE sc.name='app' AND s.name='sp_create_client'
      ORDER BY p.parameter_id`);
    const params = paramMeta.recordset as { param_name: string; type_name: string; max_length: number; is_output: boolean; has_default_value: boolean }[];
    if (!params.length) return badRequest(res, 'Stored procedure sp_create_client not found');
  const body = parsed.data as Record<string, unknown>;
    const request = pool.request();
    // Bind inputs
    // Bind inputs and outputs where possible so driver populates result.output
    for (const p of params) {
      const key = p.param_name.replace(/^@/, '');
      const typeName = p.type_name;
      // helper to map SQL type name -> mssql type
      const mapType = (tn: string) => {
        switch (tn) {
          case 'bit': return sql.Bit;
          case 'int': return sql.Int;
          case 'bigint': return sql.BigInt;
          case 'nvarchar': return p.max_length === -1 ? sql.NVarChar(sql.MAX) : sql.NVarChar(p.max_length);
          case 'varchar': return p.max_length === -1 ? sql.VarChar(sql.MAX) : sql.VarChar(p.max_length);
          case 'datetime2': return sql.DateTime2;
          case 'datetimeoffset': return sql.DateTimeOffset;
          default: return undefined as any;
        }
      };

      const mapped = mapType(typeName);
      if (p.is_output) {
        // register as output param if type known, otherwise register without explicit type
        if (mapped) request.output(key, mapped as any);
        else request.output(key, sql.NVarChar(sql.MAX));
        continue;
      }

      // requiredness check
      if (body[key] === undefined && !p.has_default_value) {
        return badRequest(res, `Missing required field: ${key}`);
      }

      if (body[key] !== undefined) {
        const val = body[key];
        if (typeName === 'bit') {
          request.input(key, sql.Bit, !!val ? 1 : 0);
        } else if (typeName === 'int' || typeName === 'bigint') {
          if (val === null || val === undefined || val === '') return badRequest(res, `Param ${key} must be number`);
          request.input(key, typeName === 'bigint' ? sql.BigInt : sql.Int, Number(val));
        } else if (typeName === 'nvarchar' || typeName === 'varchar') {
          request.input(key, mapped || sql.NVarChar(p.max_length === -1 ? sql.MAX : p.max_length), String(val));
        } else if (typeName === 'datetime2' || typeName === 'datetimeoffset') {
          request.input(key, mapped || sql.DateTime2, val as any);
        } else {
          request.input(key, body[key] as any);
        }
      }
    }
    const result = await request.execute('app.sp_create_client');
    let clientRow: any = null;

    // Include driver-populated output params in proc_result
    const proc_result: any = { recordset: result.recordset, returnValue: result.returnValue, output: result.output };

    // Try to infer client_id from multiple places: first recordset row, output params, returnValue
    const first = result.recordset && result.recordset[0];
    let clientId: any = first && (first.client_id || first.new_client_id || first.id);
    if (!clientId && result.output) {
      // common output names
      clientId = result.output.new_client_id || result.output.client_id || result.output.id;
    }
    if (!clientId && typeof result.returnValue === 'number') clientId = result.returnValue;
    if (typeof clientId === 'string' && /^\d+$/.test(clientId)) clientId = Number(clientId);

    // Choose appropriate SQL type for reading the client row
    if (typeof clientId === 'number') {
      // prefer bigint if metadata says so
      const idParamMeta = params.find(p => p.param_name.replace(/^@/, '') === 'client_id' || p.param_name.replace(/^@/, '') === 'new_client_id');
      const idSqlType = idParamMeta && idParamMeta.type_name === 'bigint' ? sql.BigInt : sql.Int;
      const read = await pool.request().input('id', idSqlType, clientId).query(`SELECT client_id, name, is_active, created_utc FROM app.clients WHERE client_id=@id`);
      clientRow = read.recordset[0] || null;
    }

    ok(res, { client: clientRow, proc_result });
  })
);

/**
 * @openapi
 * /api/clients/{client_id}/setup:
 *   post:
 *     summary: Orchestrate post-creation client setup (idempotent)
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: client_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [playbook_code, owner_user_id]
 *             properties:
 *               client_name: { type: string }
 *               playbook_code: { type: string }
 *               owner_user_id: { type: integer }
 *     responses:
 *       200:
 *         description: Setup executed (idempotent)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     client_slug: { type: string }
 *                     folders:
 *                       type: array
 *                       items: { type: string }
 */
router.post(
  '/:client_id/setup',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (Number.isNaN(clientId)) return badRequest(res, 'client_id must be int');
    const parsed = ClientSetupBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const pool = await getPool();
    const exists = await pool.request().input('id', sql.Int, clientId).query('SELECT client_id, name FROM app.clients WHERE client_id=@id');
    const row = exists.recordset[0];
    if (!row) return notFound(res);
    const result = await orchestrateClientSetup({ client_id: clientId, client_name: parsed.data.client_name || row.name, playbook_code: parsed.data.playbook_code, owner_user_id: parsed.data.owner_user_id });
    ok(res, result);
  })
);

export default router;
