import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { IndustryCreateBody, IndustryUpdateBody, ClientIndustryCreateBody, ClientIndustryUpdateBody } from '../validation/schemas';
import { logActivity } from '../utils/activity';

const router = Router();

// Normalize industry row
function normalizeIndustryRow(row: any) {
  if (!row) return row;
  const toNum = (k: string) => {
    if (row[k] !== undefined && row[k] !== null && typeof row[k] !== 'number') {
      const n = Number(row[k]);
      if (!Number.isNaN(n)) row[k] = n;
    }
  };
  toNum('industry_id');
  return row;
}

// Normalize client industry row
function normalizeClientIndustryRow(row: any) {
  if (!row) return row;
  const toNum = (k: string) => {
    if (row[k] !== undefined && row[k] !== null && typeof row[k] !== 'number') {
      const n = Number(row[k]);
      if (!Number.isNaN(n)) row[k] = n;
    }
  };
  toNum('client_id');
  toNum('industry_id');
  return row;
}

async function industryExists(industryId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.BigInt, industryId).query(
    `SELECT industry_id FROM app.industries WHERE industry_id = @id`
  );
  return r.recordset.length > 0;
}

async function industryNameExists(name: string, excludeId?: number) {
  const pool = await getPool();
  const request = pool.request().input('name', sql.NVarChar(200), name);
  let query = `SELECT industry_id FROM app.industries WHERE name = @name`;
  if (excludeId) {
    request.input('exclude', sql.BigInt, excludeId);
    query += ' AND industry_id != @exclude';
  }
  const r = await request.query(query);
  return r.recordset.length > 0;
}

async function clientExists(clientId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.BigInt, clientId).query(
    `SELECT client_id FROM app.clients WHERE client_id = @id`
  );
  return r.recordset.length > 0;
}

async function clientIndustryExists(clientId: number, industryId: number) {
  const pool = await getPool();
  const r = await pool.request()
    .input('client_id', sql.BigInt, clientId)
    .input('industry_id', sql.BigInt, industryId)
    .query(`SELECT client_id FROM app.client_industries WHERE client_id = @client_id AND industry_id = @industry_id`);
  return r.recordset.length > 0;
}

/**
 * @openapi
 * /api/industries:
 *   get:
 *     summary: List industries
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: include_inactive
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
 *                 data: { type: array, items: { $ref: '#/components/schemas/Industry' } }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const pool = await getPool();
    const q = req.query.q as string;
    const includeInactive = req.query.include_inactive === '1' || req.query.include_inactive === 'true';

    let where = '1=1';
    const request = pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit);
    if (!includeInactive) {
      where += ' AND is_active = 1';
    }
    if (q) {
      request.input('q', sql.NVarChar(200), `%${q}%`);
      where += ' AND (name LIKE @q OR description LIKE @q)';
    }

    const result = await request.query(`SELECT industry_id, name, description, is_active, created_utc, updated_utc FROM app.industries WHERE ${where} ORDER BY name OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
    const rows = (result.recordset || []).map(normalizeIndustryRow);
    listOk(res, rows, { page, limit });
  })
);

/**
 * @openapi
 * /api/industries/{industry_id}:
 *   get:
 *     summary: Get industry by id
 *     parameters:
 *       - in: path
 *         name: industry_id
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
 *                 data: { $ref: '#/components/schemas/Industry' }
 */
router.get(
  '/:industry_id',
  asyncHandler(async (req, res) => {
    const industryId = Number(req.params.industry_id);
    if (!Number.isInteger(industryId) || industryId <= 0) return badRequest(res, 'industry_id must be a positive integer');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.BigInt, industryId).query(`SELECT industry_id, name, description, is_active, created_utc, updated_utc FROM app.industries WHERE industry_id = @id`);
    const row = result.recordset[0];
    if (!row) return notFound(res);
    ok(res, normalizeIndustryRow(row));
  })
);

/**
 * @openapi
 * /api/industries:
 *   post:
 *     summary: Create industry
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/IndustryCreateBody' }
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/Industry' }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = IndustryCreateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    if (await industryNameExists(data.name)) return badRequest(res, 'Industry name must be unique');

    const request = pool.request()
      .input('name', sql.NVarChar(200), data.name)
      .input('description', sql.NVarChar(1000), data.description)
      .input('is_active', sql.Bit, data.is_active !== undefined ? data.is_active : true);

    await request.query(`INSERT INTO app.industries (name, description, is_active) VALUES (@name, @description, @is_active)`);
    const read = await pool.request().query(`SELECT industry_id, name, description, is_active, created_utc, updated_utc FROM app.industries WHERE industry_id = SCOPE_IDENTITY()`);
    const created = read.recordset[0];
    normalizeIndustryRow(created);
    if (created && created.industry_id) res.setHeader('Location', `/industries/${created.industry_id}`);
    await logActivity({ type: 'IndustryCreated', title: `Industry ${data.name} created`, industry_id: created?.industry_id });
    ok(res, created, 201);
  })
);

/**
 * @openapi
 * /api/industries/{industry_id}:
 *   put:
 *     summary: Update industry (full replace)
 *     parameters:
 *       - in: path
 *         name: industry_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/IndustryUpdateBody' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/Industry' }
 */
router.put(
  '/:industry_id',
  asyncHandler(async (req, res) => {
    const industryId = Number(req.params.industry_id);
    if (!Number.isInteger(industryId) || industryId <= 0) return badRequest(res, 'industry_id must be a positive integer');
    const parsed = IndustryUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    if (!(await industryExists(industryId))) return notFound(res);
    if (data.name && await industryNameExists(data.name, industryId)) return badRequest(res, 'Industry name must be unique');

    const sets: string[] = [];
    const request = pool.request().input('id', sql.BigInt, industryId);
    if (data.name !== undefined) { sets.push('name = @name'); request.input('name', sql.NVarChar(200), data.name); }
    if (data.description !== undefined) { sets.push('description = @description'); request.input('description', sql.NVarChar(1000), data.description); }
    if (data.is_active !== undefined) { sets.push('is_active = @is_active'); request.input('is_active', sql.Bit, data.is_active); }
    sets.push('updated_utc = SYSUTCDATETIME()');

    await request.query(`UPDATE app.industries SET ${sets.join(', ')} WHERE industry_id = @id`);
    const read = await pool.request().input('id', sql.BigInt, industryId).query(`SELECT industry_id, name, description, is_active, created_utc, updated_utc FROM app.industries WHERE industry_id = @id`);
    const updated = read.recordset[0];
    normalizeIndustryRow(updated);
    await logActivity({ type: 'IndustryUpdated', title: `Industry ${industryId} updated`, industry_id: industryId });
    ok(res, updated);
  })
);

/**
 * @openapi
 * /api/industries/{industry_id}:
 *   patch:
 *     summary: Update industry (partial)
 *     parameters:
 *       - in: path
 *         name: industry_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/IndustryUpdateBody' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/Industry' }
 */
router.patch(
  '/:industry_id',
  asyncHandler(async (req, res) => {
    const industryId = Number(req.params.industry_id);
    if (!Number.isInteger(industryId) || industryId <= 0) return badRequest(res, 'industry_id must be a positive integer');
    const parsed = IndustryUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    if (!(await industryExists(industryId))) return notFound(res);
    if (data.name && await industryNameExists(data.name, industryId)) return badRequest(res, 'Industry name must be unique');

    const sets: string[] = [];
    const request = pool.request().input('id', sql.BigInt, industryId);
    if (data.name !== undefined) { sets.push('name = @name'); request.input('name', sql.NVarChar(200), data.name); }
    if (data.description !== undefined) { sets.push('description = @description'); request.input('description', sql.NVarChar(1000), data.description); }
    if (data.is_active !== undefined) { sets.push('is_active = @is_active'); request.input('is_active', sql.Bit, data.is_active); }
    sets.push('updated_utc = SYSUTCDATETIME()');

    await request.query(`UPDATE app.industries SET ${sets.join(', ')} WHERE industry_id = @id`);
    const read = await pool.request().input('id', sql.BigInt, industryId).query(`SELECT industry_id, name, description, is_active, created_utc, updated_utc FROM app.industries WHERE industry_id = @id`);
    const updated = read.recordset[0];
    normalizeIndustryRow(updated);
    await logActivity({ type: 'IndustryUpdated', title: `Industry ${industryId} updated`, industry_id: industryId });
    ok(res, updated);
  })
);

/**
 * @openapi
 * /api/industries/{industry_id}:
 *   delete:
 *     summary: Delete industry (soft delete)
 *     parameters:
 *       - in: path
 *         name: industry_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Industry deleted
 */
router.delete(
  '/:industry_id',
  asyncHandler(async (req, res) => {
    const industryId = Number(req.params.industry_id);
    if (!Number.isInteger(industryId) || industryId <= 0) return badRequest(res, 'industry_id must be a positive integer');
    const pool = await getPool();

    if (!(await industryExists(industryId))) return notFound(res);

    await pool.request().input('id', sql.BigInt, industryId).query(`UPDATE app.industries SET is_active = 0, updated_utc = SYSUTCDATETIME() WHERE industry_id = @id`);
    await logActivity({ type: 'IndustryDeleted', title: `Industry ${industryId} deleted`, industry_id: industryId });
    ok(res, { deleted: true });
  })
);

// Client Industries

/**
 * @openapi
 * /api/clients/{client_id}/industries:
 *   get:
 *     summary: List industries for a client
 *     parameters:
 *       - in: path
 *         name: client_id
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
 *                 data: { type: array, items: { $ref: '#/components/schemas/ClientIndustry' } }
 */
router.get(
  '/clients/:client_id/industries',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    const pool = await getPool();

    if (!(await clientExists(clientId))) return notFound(res);

    const result = await pool.request().input('client_id', sql.BigInt, clientId).query(`
      SELECT ci.client_id, ci.industry_id, ci.is_primary, ci.created_utc, i.name as industry_name
      FROM app.client_industries ci
      JOIN app.industries i ON ci.industry_id = i.industry_id
      WHERE ci.client_id = @client_id
      ORDER BY ci.is_primary DESC, i.name
    `);
    const rows = (result.recordset || []).map(normalizeClientIndustryRow);
    ok(res, rows);
  })
);

/**
 * @openapi
 * /api/clients/{client_id}/industries:
 *   post:
 *     summary: Add industry to client
 *     parameters:
 *       - in: path
 *         name: client_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClientIndustryCreateBody' }
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/ClientIndustry' }
 */
router.post(
  '/clients/:client_id/industries',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    const parsed = ClientIndustryCreateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    if (!(await clientExists(clientId))) return notFound(res);
    if (!(await industryExists(data.industry_id))) return badRequest(res, 'Industry does not exist');
    if (await clientIndustryExists(clientId, data.industry_id)) return badRequest(res, 'Client already has this industry');

    const request = pool.request()
      .input('client_id', sql.BigInt, clientId)
      .input('industry_id', sql.BigInt, data.industry_id)
      .input('is_primary', sql.Bit, data.is_primary || false);

    await request.query(`INSERT INTO app.client_industries (client_id, industry_id, is_primary) VALUES (@client_id, @industry_id, @is_primary)`);

    const read = await pool.request()
      .input('client_id', sql.BigInt, clientId)
      .input('industry_id', sql.BigInt, data.industry_id)
      .query(`
        SELECT ci.client_id, ci.industry_id, ci.is_primary, ci.created_utc, i.name as industry_name
        FROM app.client_industries ci
        JOIN app.industries i ON ci.industry_id = i.industry_id
        WHERE ci.client_id = @client_id AND ci.industry_id = @industry_id
      `);

    const created = read.recordset[0];
    normalizeClientIndustryRow(created);
    await logActivity({ type: 'ClientIndustryAdded', title: `Industry added to client ${clientId}`, client_id: clientId, industry_id: data.industry_id });
    ok(res, created, 201);
  })
);

/**
 * @openapi
 * /api/clients/{client_id}/industries/{industry_id}:
 *   put:
 *     summary: Update client industry
 *     parameters:
 *       - in: path
 *         name: client_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: industry_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClientIndustryUpdateBody' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/ClientIndustry' }
 */
router.put(
  '/clients/:client_id/industries/:industry_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    const industryId = Number(req.params.industry_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    if (!Number.isInteger(industryId) || industryId <= 0) return badRequest(res, 'industry_id must be a positive integer');
    const parsed = ClientIndustryUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    if (!(await clientIndustryExists(clientId, industryId))) return notFound(res);

    const sets: string[] = [];
    const request = pool.request().input('client_id', sql.BigInt, clientId).input('industry_id', sql.BigInt, industryId);
    if (data.is_primary !== undefined) { sets.push('is_primary = @is_primary'); request.input('is_primary', sql.Bit, data.is_primary); }

    if (sets.length > 0) {
      await request.query(`UPDATE app.client_industries SET ${sets.join(', ')} WHERE client_id = @client_id AND industry_id = @industry_id`);
    }

    const read = await pool.request()
      .input('client_id', sql.BigInt, clientId)
      .input('industry_id', sql.BigInt, industryId)
      .query(`
        SELECT ci.client_id, ci.industry_id, ci.is_primary, ci.created_utc, i.name as industry_name
        FROM app.client_industries ci
        JOIN app.industries i ON ci.industry_id = i.industry_id
        WHERE ci.client_id = @client_id AND ci.industry_id = @industry_id
      `);

    const updated = read.recordset[0];
    normalizeClientIndustryRow(updated);
    await logActivity({ type: 'ClientIndustryUpdated', title: `Client industry updated for client ${clientId}`, client_id: clientId, industry_id: industryId });
    ok(res, updated);
  })
);

/**
 * @openapi
 * /api/clients/{client_id}/industries/{industry_id}:
 *   patch:
 *     summary: Update client industry (partial)
 *     parameters:
 *       - in: path
 *         name: client_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: industry_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClientIndustryUpdateBody' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/ClientIndustry' }
 */
router.patch(
  '/clients/:client_id/industries/:industry_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    const industryId = Number(req.params.industry_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    if (!Number.isInteger(industryId) || industryId <= 0) return badRequest(res, 'industry_id must be a positive integer');
    const parsed = ClientIndustryUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    if (!(await clientIndustryExists(clientId, industryId))) return notFound(res);

    const sets: string[] = [];
    const request = pool.request().input('client_id', sql.BigInt, clientId).input('industry_id', sql.BigInt, industryId);
    if (data.is_primary !== undefined) { sets.push('is_primary = @is_primary'); request.input('is_primary', sql.Bit, data.is_primary); }

    if (sets.length > 0) {
      await request.query(`UPDATE app.client_industries SET ${sets.join(', ')} WHERE client_id = @client_id AND industry_id = @industry_id`);
    }

    const read = await pool.request()
      .input('client_id', sql.BigInt, clientId)
      .input('industry_id', sql.BigInt, industryId)
      .query(`
        SELECT ci.client_id, ci.industry_id, ci.is_primary, ci.created_utc, i.name as industry_name
        FROM app.client_industries ci
        JOIN app.industries i ON ci.industry_id = i.industry_id
        WHERE ci.client_id = @client_id AND ci.industry_id = @industry_id
      `);

    const updated = read.recordset[0];
    normalizeClientIndustryRow(updated);
    await logActivity({ type: 'ClientIndustryUpdated', title: `Client industry updated for client ${clientId}`, client_id: clientId, industry_id: industryId });
    ok(res, updated);
  })
);
router.delete(
  '/clients/:client_id/industries/:industry_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    const industryId = Number(req.params.industry_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    if (!Number.isInteger(industryId) || industryId <= 0) return badRequest(res, 'industry_id must be a positive integer');
    const pool = await getPool();

    if (!(await clientIndustryExists(clientId, industryId))) return notFound(res);

    await pool.request()
      .input('client_id', sql.BigInt, clientId)
      .input('industry_id', sql.BigInt, industryId)
      .query(`DELETE FROM app.client_industries WHERE client_id = @client_id AND industry_id = @industry_id`);

    await logActivity({ type: 'ClientIndustryRemoved', title: `Industry removed from client ${clientId}`, client_id: clientId, industry_id: industryId });
    ok(res, { deleted: true });
  })
);

export default router;
