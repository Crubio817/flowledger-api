import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { TaskPackCreateBody, TaskPackUpdateBody, PackTaskCreateBody, PackTaskUpdateBody } from '../validation/schemas';
import { logActivity } from '../utils/activity';

const router = Router();

// Normalize task pack row
function normalizeTaskPackRow(row: any) {
  if (!row) return row;
  const toNum = (k: string) => {
    if (row[k] !== undefined && row[k] !== null && typeof row[k] !== 'number') {
      const n = Number(row[k]);
      if (!Number.isNaN(n)) row[k] = n;
    }
  };
  toNum('pack_id');
  return row;
}

// Normalize pack task row
function normalizePackTaskRow(row: any) {
  if (!row) return row;
  const toNum = (k: string) => {
    if (row[k] !== undefined && row[k] !== null && typeof row[k] !== 'number') {
      const n = Number(row[k]);
      if (!Number.isNaN(n)) row[k] = n;
    }
  };
  toNum('pack_task_id');
  toNum('pack_id');
  toNum('sort_order');
  toNum('due_days');
  return row;
}

async function packExists(packId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.BigInt, packId).query(
    `SELECT pack_id FROM app.task_packs WHERE pack_id = @id`
  );
  return r.recordset.length > 0;
}

async function packCodeExists(packCode: string, excludeId?: number) {
  const pool = await getPool();
  const request = pool.request().input('code', sql.NVarChar(50), packCode);
  let query = `SELECT pack_id FROM app.task_packs WHERE pack_code = @code`;
  if (excludeId) {
    request.input('exclude', sql.BigInt, excludeId);
    query += ' AND pack_id != @exclude';
  }
  const r = await request.query(query);
  return r.recordset.length > 0;
}

async function packHasTasks(packId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.BigInt, packId).query(
    `SELECT TOP 1 pack_task_id FROM app.pack_tasks WHERE pack_id = @id`
  );
  return r.recordset.length > 0;
}

/**
 * @openapi
 * /api/task-packs:
 *   get:
 *     summary: List task packs
 *     parameters:
 *       - in: query
 *         name: status_scope
 *         schema: { type: string, enum: [active, prospect, any] }
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
 *                 data: { type: array, items: { $ref: '#/components/schemas/TaskPack' } }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const pool = await getPool();
    const statusScope = req.query.status_scope as string;
    const q = req.query.q as string;
    const includeInactive = req.query.include_inactive === '1' || req.query.include_inactive === 'true';

    let where = '1=1';
    const request = pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit);
    if (statusScope) {
      request.input('status_scope', sql.NVarChar(20), statusScope);
      where += ' AND status_scope = @status_scope';
    }
    if (!includeInactive) {
      where += ' AND is_active = 1';
    }
    if (q) {
      request.input('q', sql.NVarChar(200), `%${q}%`);
      where += ' AND (pack_code LIKE @q OR pack_name LIKE @q OR description LIKE @q)';
    }

    const result = await request.query(`SELECT pack_id, pack_code, pack_name, description, status_scope, is_active, effective_from_utc, effective_to_utc, created_utc, updated_utc FROM app.task_packs WHERE ${where} ORDER BY pack_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
    const rows = (result.recordset || []).map(normalizeTaskPackRow);
    listOk(res, rows, { page, limit });
  })
);

/**
 * @openapi
 * /api/task-packs/{pack_id}:
 *   get:
 *     summary: Get task pack by id
 *     parameters:
 *       - in: path
 *         name: pack_id
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
 *                 data: { $ref: '#/components/schemas/TaskPack' }
 */
router.get(
  '/:pack_id',
  asyncHandler(async (req, res) => {
    const packId = Number(req.params.pack_id);
    if (!Number.isInteger(packId) || packId <= 0) return badRequest(res, 'pack_id must be a positive integer');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.BigInt, packId).query(`SELECT pack_id, pack_code, pack_name, description, status_scope, is_active, effective_from_utc, effective_to_utc, created_utc, updated_utc FROM app.task_packs WHERE pack_id = @id`);
    const row = result.recordset[0];
    if (!row) return notFound(res);
    ok(res, normalizeTaskPackRow(row));
  })
);

/**
 * @openapi
 * /api/task-packs:
 *   post:
 *     summary: Create task pack
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TaskPackCreateBody' }
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/TaskPack' }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = TaskPackCreateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    if (await packCodeExists(data.pack_code)) return badRequest(res, 'pack_code must be unique');

    const request = pool.request()
      .input('pack_code', sql.NVarChar(50), data.pack_code)
      .input('pack_name', sql.NVarChar(200), data.pack_name)
      .input('description', sql.NVarChar(1000), data.description)
      .input('status_scope', sql.NVarChar(20), data.status_scope)
      .input('is_active', sql.Bit, data.is_active)
      .input('effective_from_utc', sql.DateTime2, data.effective_from_utc)
      .input('effective_to_utc', sql.DateTime2, data.effective_to_utc);

    await request.query(`INSERT INTO app.task_packs (pack_code, pack_name, description, status_scope, is_active, effective_from_utc, effective_to_utc) VALUES (@pack_code, @pack_name, @description, @status_scope, @is_active, @effective_from_utc, @effective_to_utc)`);
    const read = await pool.request().query(`SELECT pack_id, pack_code, pack_name, description, status_scope, is_active, effective_from_utc, effective_to_utc, created_utc, updated_utc FROM app.task_packs WHERE pack_id = SCOPE_IDENTITY()`);
    const created = read.recordset[0];
    normalizeTaskPackRow(created);
    if (created && created.pack_id) res.setHeader('Location', `/task-packs/${created.pack_id}`);
    await logActivity({ type: 'TaskPackCreated', title: `Task pack ${data.pack_name} created`, pack_id: created?.pack_id });
    ok(res, created, 201);
  })
);

/**
 * @openapi
 * /api/task-packs/{pack_id}:
 *   put:
 *     summary: Update task pack (full replace)
 *     parameters:
 *       - in: path
 *         name: pack_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TaskPackUpdateBody' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/TaskPack' }
 */
router.put(
  '/:pack_id',
  asyncHandler(async (req, res) => {
    const packId = Number(req.params.pack_id);
    if (!Number.isInteger(packId) || packId <= 0) return badRequest(res, 'pack_id must be a positive integer');
    const parsed = TaskPackUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    if (!(await packExists(packId))) return notFound(res);
    if (data.pack_code && await packCodeExists(data.pack_code, packId)) return badRequest(res, 'pack_code must be unique');

    const sets: string[] = [];
    const request = pool.request().input('id', sql.BigInt, packId);
    if (data.pack_code !== undefined) { sets.push('pack_code = @pack_code'); request.input('pack_code', sql.NVarChar(50), data.pack_code); }
    if (data.pack_name !== undefined) { sets.push('pack_name = @pack_name'); request.input('pack_name', sql.NVarChar(200), data.pack_name); }
    if (data.description !== undefined) { sets.push('description = @description'); request.input('description', sql.NVarChar(1000), data.description); }
    if (data.status_scope !== undefined) { sets.push('status_scope = @status_scope'); request.input('status_scope', sql.NVarChar(20), data.status_scope); }
    if (data.is_active !== undefined) { sets.push('is_active = @is_active'); request.input('is_active', sql.Bit, data.is_active); }
    if (data.effective_from_utc !== undefined) { sets.push('effective_from_utc = @effective_from_utc'); request.input('effective_from_utc', sql.DateTime2, data.effective_from_utc); }
    if (data.effective_to_utc !== undefined) { sets.push('effective_to_utc = @effective_to_utc'); request.input('effective_to_utc', sql.DateTime2, data.effective_to_utc); }
    sets.push('updated_utc = SYSUTCDATETIME()');

    await request.query(`UPDATE app.task_packs SET ${sets.join(', ')} WHERE pack_id = @id`);
    const read = await pool.request().input('id', sql.BigInt, packId).query(`SELECT pack_id, pack_code, pack_name, description, status_scope, is_active, effective_from_utc, effective_to_utc, created_utc, updated_utc FROM app.task_packs WHERE pack_id = @id`);
    const updated = read.recordset[0];
    normalizeTaskPackRow(updated);
    await logActivity({ type: 'TaskPackUpdated', title: `Task pack ${packId} updated`, pack_id: packId });
    ok(res, updated);
  })
);

/**
 * @openapi
 * /api/task-packs/{pack_id}:
 *   patch:
 *     summary: Update task pack (partial)
 *     parameters:
 *       - in: path
 *         name: pack_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TaskPackUpdateBody' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/TaskPack' }
 */
router.patch(
  '/:pack_id',
  asyncHandler(async (req, res) => {
    const packId = Number(req.params.pack_id);
    if (!Number.isInteger(packId) || packId <= 0) return badRequest(res, 'pack_id must be a positive integer');
    const parsed = TaskPackUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    if (!(await packExists(packId))) return notFound(res);
    if (data.pack_code && await packCodeExists(data.pack_code, packId)) return badRequest(res, 'pack_code must be unique');

    const sets: string[] = [];
    const request = pool.request().input('id', sql.BigInt, packId);
    if (data.pack_code !== undefined) { sets.push('pack_code = @pack_code'); request.input('pack_code', sql.NVarChar(50), data.pack_code); }
    if (data.pack_name !== undefined) { sets.push('pack_name = @pack_name'); request.input('pack_name', sql.NVarChar(200), data.pack_name); }
    if (data.description !== undefined) { sets.push('description = @description'); request.input('description', sql.NVarChar(1000), data.description); }
    if (data.status_scope !== undefined) { sets.push('status_scope = @status_scope'); request.input('status_scope', sql.NVarChar(20), data.status_scope); }
    if (data.is_active !== undefined) { sets.push('is_active = @is_active'); request.input('is_active', sql.Bit, data.is_active); }
    if (data.effective_from_utc !== undefined) { sets.push('effective_from_utc = @effective_from_utc'); request.input('effective_from_utc', sql.DateTime2, data.effective_from_utc); }
    if (data.effective_to_utc !== undefined) { sets.push('effective_to_utc = @effective_to_utc'); request.input('effective_to_utc', sql.DateTime2, data.effective_to_utc); }
    sets.push('updated_utc = SYSUTCDATETIME()');

    await request.query(`UPDATE app.task_packs SET ${sets.join(', ')} WHERE pack_id = @id`);
    const read = await pool.request().input('id', sql.BigInt, packId).query(`SELECT pack_id, pack_code, pack_name, description, status_scope, is_active, effective_from_utc, effective_to_utc, created_utc, updated_utc FROM app.task_packs WHERE pack_id = @id`);
    const updated = read.recordset[0];
    normalizeTaskPackRow(updated);
    await logActivity({ type: 'TaskPackUpdated', title: `Task pack ${packId} updated`, pack_id: packId });
    ok(res, updated);
  })
);

/**
 * @openapi
 * /api/task-packs/{pack_id}:
 *   delete:
 *     summary: Delete task pack (soft delete)
 *     parameters:
 *       - in: path
 *         name: pack_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete(
  '/:pack_id',
  asyncHandler(async (req, res) => {
    const packId = Number(req.params.pack_id);
    if (!Number.isInteger(packId) || packId <= 0) return badRequest(res, 'pack_id must be a positive integer');
    const pool = await getPool();

    if (!(await packExists(packId))) return notFound(res);
    if (await packHasTasks(packId)) return badRequest(res, 'Cannot delete pack with existing tasks');

    await pool.request().input('id', sql.BigInt, packId).query(`UPDATE app.task_packs SET is_active = 0, updated_utc = SYSUTCDATETIME() WHERE pack_id = @id`);
    await logActivity({ type: 'TaskPackDeleted', title: `Task pack ${packId} deleted`, pack_id: packId });
    ok(res, { deleted: true });
  })
);

// Pack Tasks

/**
 * @openapi
 * /api/task-packs/{pack_id}/tasks:
 *   get:
 *     summary: List pack tasks
 *     parameters:
 *       - in: path
 *         name: pack_id
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
 *                 data: { type: array, items: { $ref: '#/components/schemas/PackTask' } }
 */
router.get(
  '/:pack_id/tasks',
  asyncHandler(async (req, res) => {
    const packId = Number(req.params.pack_id);
    if (!Number.isInteger(packId) || packId <= 0) return badRequest(res, 'pack_id must be a positive integer');
    const pool = await getPool();

    if (!(await packExists(packId))) return notFound(res);

    const result = await pool.request().input('id', sql.BigInt, packId).query(`SELECT pack_task_id, pack_id, name, sort_order, due_days, status_scope, is_active, created_utc, updated_utc FROM app.pack_tasks WHERE pack_id = @id ORDER BY sort_order, pack_task_id`);
    const rows = (result.recordset || []).map(normalizePackTaskRow);
    ok(res, rows);
  })
);

/**
 * @openapi
 * /api/task-packs/{pack_id}/tasks/{pack_task_id}:
 *   get:
 *     summary: Get pack task by id
 *     parameters:
 *       - in: path
 *         name: pack_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: pack_task_id
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
 *                 data: { $ref: '#/components/schemas/PackTask' }
 */
router.get(
  '/:pack_id/tasks/:pack_task_id',
  asyncHandler(async (req, res) => {
    const packId = Number(req.params.pack_id);
    const packTaskId = Number(req.params.pack_task_id);
    if (!Number.isInteger(packId) || packId <= 0) return badRequest(res, 'pack_id must be a positive integer');
    if (!Number.isInteger(packTaskId) || packTaskId <= 0) return badRequest(res, 'pack_task_id must be a positive integer');
    const pool = await getPool();

    const result = await pool.request().input('id', sql.BigInt, packTaskId).input('pack_id', sql.BigInt, packId).query(`SELECT pack_task_id, pack_id, name, sort_order, due_days, status_scope, is_active, created_utc, updated_utc FROM app.pack_tasks WHERE pack_task_id = @id AND pack_id = @pack_id`);
    const row = result.recordset[0];
    if (!row) return notFound(res);
    ok(res, normalizePackTaskRow(row));
  })
);

/**
 * @openapi
 * /api/task-packs/{pack_id}/tasks:
 *   post:
 *     summary: Create pack task
 *     parameters:
 *       - in: path
 *         name: pack_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PackTaskCreateBody' }
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/PackTask' }
 */
router.post(
  '/:pack_id/tasks',
  asyncHandler(async (req, res) => {
    const packId = Number(req.params.pack_id);
    if (!Number.isInteger(packId) || packId <= 0) return badRequest(res, 'pack_id must be a positive integer');
    const parsed = PackTaskCreateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    if (!(await packExists(packId))) return notFound(res);

    const request = pool.request()
      .input('pack_id', sql.BigInt, packId)
      .input('name', sql.NVarChar(200), data.name)
      .input('sort_order', sql.Int, data.sort_order)
      .input('due_days', sql.Int, data.due_days)
      .input('status_scope', sql.NVarChar(20), data.status_scope)
      .input('is_active', sql.Bit, data.is_active);

    await request.query(`INSERT INTO app.pack_tasks (pack_id, name, sort_order, due_days, status_scope, is_active) VALUES (@pack_id, @name, @sort_order, @due_days, @status_scope, @is_active)`);
    const read = await pool.request().query(`SELECT pack_task_id, pack_id, name, sort_order, due_days, status_scope, is_active, created_utc, updated_utc FROM app.pack_tasks WHERE pack_task_id = SCOPE_IDENTITY()`);
    const created = read.recordset[0];
    normalizePackTaskRow(created);
    if (created && created.pack_task_id) res.setHeader('Location', `/task-packs/${packId}/tasks/${created.pack_task_id}`);
    await logActivity({ type: 'PackTaskCreated', title: `Pack task ${data.name} created`, pack_id: packId, pack_task_id: created?.pack_task_id });
    ok(res, created, 201);
  })
);

/**
 * @openapi
 * /api/task-packs/{pack_id}/tasks/{pack_task_id}:
 *   put:
 *     summary: Update pack task (full replace)
 *     parameters:
 *       - in: path
 *         name: pack_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: pack_task_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PackTaskUpdateBody' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/PackTask' }
 */
router.put(
  '/:pack_id/tasks/:pack_task_id',
  asyncHandler(async (req, res) => {
    const packId = Number(req.params.pack_id);
    const packTaskId = Number(req.params.pack_task_id);
    if (!Number.isInteger(packId) || packId <= 0) return badRequest(res, 'pack_id must be a positive integer');
    if (!Number.isInteger(packTaskId) || packTaskId <= 0) return badRequest(res, 'pack_task_id must be a positive integer');
    const parsed = PackTaskUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    const result = await pool.request().input('id', sql.BigInt, packTaskId).input('pack_id', sql.BigInt, packId).query(`SELECT pack_task_id FROM app.pack_tasks WHERE pack_task_id = @id AND pack_id = @pack_id`);
    if (!result.recordset[0]) return notFound(res);

    const sets: string[] = [];
    const request = pool.request().input('id', sql.BigInt, packTaskId);
    if (data.name !== undefined) { sets.push('name = @name'); request.input('name', sql.NVarChar(200), data.name); }
    if (data.sort_order !== undefined) { sets.push('sort_order = @sort_order'); request.input('sort_order', sql.Int, data.sort_order); }
    if (data.due_days !== undefined) { sets.push('due_days = @due_days'); request.input('due_days', sql.Int, data.due_days); }
    if (data.status_scope !== undefined) { sets.push('status_scope = @status_scope'); request.input('status_scope', sql.NVarChar(20), data.status_scope); }
    if (data.is_active !== undefined) { sets.push('is_active = @is_active'); request.input('is_active', sql.Bit, data.is_active); }
    sets.push('updated_utc = SYSUTCDATETIME()');

    await request.query(`UPDATE app.pack_tasks SET ${sets.join(', ')} WHERE pack_task_id = @id`);
    const read = await pool.request().input('id', sql.BigInt, packTaskId).query(`SELECT pack_task_id, pack_id, name, sort_order, due_days, status_scope, is_active, created_utc, updated_utc FROM app.pack_tasks WHERE pack_task_id = @id`);
    const updated = read.recordset[0];
    normalizePackTaskRow(updated);
    await logActivity({ type: 'PackTaskUpdated', title: `Pack task ${packTaskId} updated`, pack_id: packId, pack_task_id: packTaskId });
    ok(res, updated);
  })
);

/**
 * @openapi
 * /api/task-packs/{pack_id}/tasks/{pack_task_id}:
 *   patch:
 *     summary: Update pack task (partial)
 *     parameters:
 *       - in: path
 *         name: pack_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: pack_task_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PackTaskUpdateBody' }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data: { $ref: '#/components/schemas/PackTask' }
 */
router.patch(
  '/:pack_id/tasks/:pack_task_id',
  asyncHandler(async (req, res) => {
    const packId = Number(req.params.pack_id);
    const packTaskId = Number(req.params.pack_task_id);
    if (!Number.isInteger(packId) || packId <= 0) return badRequest(res, 'pack_id must be a positive integer');
    if (!Number.isInteger(packTaskId) || packTaskId <= 0) return badRequest(res, 'pack_task_id must be a positive integer');
    const parsed = PackTaskUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    const result = await pool.request().input('id', sql.BigInt, packTaskId).input('pack_id', sql.BigInt, packId).query(`SELECT pack_task_id FROM app.pack_tasks WHERE pack_task_id = @id AND pack_id = @pack_id`);
    if (!result.recordset[0]) return notFound(res);

    const sets: string[] = [];
    const request = pool.request().input('id', sql.BigInt, packTaskId);
    if (data.name !== undefined) { sets.push('name = @name'); request.input('name', sql.NVarChar(200), data.name); }
    if (data.sort_order !== undefined) { sets.push('sort_order = @sort_order'); request.input('sort_order', sql.Int, data.sort_order); }
    if (data.due_days !== undefined) { sets.push('due_days = @due_days'); request.input('due_days', sql.Int, data.due_days); }
    if (data.status_scope !== undefined) { sets.push('status_scope = @status_scope'); request.input('status_scope', sql.NVarChar(20), data.status_scope); }
    if (data.is_active !== undefined) { sets.push('is_active = @is_active'); request.input('is_active', sql.Bit, data.is_active); }
    sets.push('updated_utc = SYSUTCDATETIME()');

    await request.query(`UPDATE app.pack_tasks SET ${sets.join(', ')} WHERE pack_task_id = @id`);
    const read = await pool.request().input('id', sql.BigInt, packTaskId).query(`SELECT pack_task_id, pack_id, name, sort_order, due_days, status_scope, is_active, created_utc, updated_utc FROM app.pack_tasks WHERE pack_task_id = @id`);
    const updated = read.recordset[0];
    normalizePackTaskRow(updated);
    await logActivity({ type: 'PackTaskUpdated', title: `Pack task ${packTaskId} updated`, pack_id: packId, pack_task_id: packTaskId });
    ok(res, updated);
  })
);

/**
 * @openapi
 * /api/task-packs/{pack_id}/tasks/{pack_task_id}:
 *   delete:
 *     summary: Delete pack task (soft delete)
 *     parameters:
 *       - in: path
 *         name: pack_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: pack_task_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete(
  '/:pack_id/tasks/:pack_task_id',
  asyncHandler(async (req, res) => {
    const packId = Number(req.params.pack_id);
    const packTaskId = Number(req.params.pack_task_id);
    if (!Number.isInteger(packId) || packId <= 0) return badRequest(res, 'pack_id must be a positive integer');
    if (!Number.isInteger(packTaskId) || packTaskId <= 0) return badRequest(res, 'pack_task_id must be a positive integer');
    const pool = await getPool();

    const result = await pool.request().input('id', sql.BigInt, packTaskId).input('pack_id', sql.BigInt, packId).query(`SELECT pack_task_id FROM app.pack_tasks WHERE pack_task_id = @id AND pack_id = @pack_id`);
    if (!result.recordset[0]) return notFound(res);

    await pool.request().input('id', sql.BigInt, packTaskId).query(`UPDATE app.pack_tasks SET is_active = 0, updated_utc = SYSUTCDATETIME() WHERE pack_task_id = @id`);
    await logActivity({ type: 'PackTaskDeleted', title: `Pack task ${packTaskId} deleted`, pack_id: packId, pack_task_id: packTaskId });
    ok(res, { deleted: true });
  })
);

export default router;
