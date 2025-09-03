import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound, getPagination } from '../utils/http';
import { OnboardingTaskCreate, OnboardingTaskUpdate } from '../validation/schemas';
import { logActivity } from '../utils/activity';

const router = Router();

/**
 * @openapi
 * /api/client-onboarding-tasks:
 *   get:
 *     summary: List client onboarding tasks
 *     tags: [ClientOnboardingTasks]
 *     responses:
 *       200:
 *         description: Tasks list
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
 *                       task_id: { type: integer }
 *                       client_id: { type: integer }
 *                       name: { type: string }
 *                       description: { type: string }
 *                       status: { type: string }
 *                       due_utc: { type: string, format: date-time }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *   post:
 *     summary: Create client onboarding task
 *     tags: [ClientOnboardingTasks]
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
 *               description: { type: string }
 *               status: { type: string }
 *               due_utc: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Task created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     task_id: { type: integer }
 *                     client_id: { type: integer }
 *                     name: { type: string }
 *                     description: { type: string }
 *                     status: { type: string }
 *                     due_utc: { type: string, format: date-time }
 */
router.get('/', asyncHandler(async (req, res) => { const { page, limit, offset } = getPagination(req); const pool = await getPool(); const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(`SELECT task_id, client_id, name, description, status, due_utc, COUNT(*) OVER() AS total FROM app.client_onboarding_tasks ORDER BY task_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`); const total = r.recordset[0]?.total ?? 0; const items = r.recordset.map((row:any)=>{ const { total: _t, ...rest } = row; return rest; }); listOk(res, items, { page, limit, total }); }));
/**
 * @openapi
 * /api/client-onboarding-tasks/{id}:
 *   get:
 *     summary: Get client onboarding task by id
 *     tags: [ClientOnboardingTasks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Task
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     task_id: { type: integer }
 *                     client_id: { type: integer }
 *                     name: { type: string }
 *                     description: { type: string }
 *                     status: { type: string }
 *                     due_utc: { type: string, format: date-time }
 *   put:
 *     summary: Update client onboarding task
 *     tags: [ClientOnboardingTasks]
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
 *               description: { type: string }
 *               status: { type: string }
 *               due_utc: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Task updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     task_id: { type: integer }
 *                     client_id: { type: integer }
 *                     name: { type: string }
 *                     description: { type: string }
 *                     status: { type: string }
 *                     due_utc: { type: string, format: date-time }
 *   delete:
 *     summary: Delete client onboarding task
 *     tags: [ClientOnboardingTasks]
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
router.get('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res,'id must be a positive integer'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`SELECT task_id, client_id, name, description, status, due_utc FROM app.client_onboarding_tasks WHERE task_id=@id`); const row = r.recordset[0]; if (!row) return notFound(res); ok(res, row); }));
router.post('/', asyncHandler(async (req, res) => { const parsed = OnboardingTaskCreate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; ')); const { client_id, name, description = null, status = 'open', due_utc = null } = parsed.data as any; const pool = await getPool(); const result = await pool.request().input('client_id', sql.Int, client_id).input('name', sql.NVarChar(200), name).input('description', sql.NVarChar(1000), description).input('status', sql.NVarChar(40), status).input('due_utc', sql.DateTime2, due_utc).query(`INSERT INTO app.client_onboarding_tasks (client_id, name, description, status, due_utc) OUTPUT INSERTED.task_id, INSERTED.client_id, INSERTED.name, INSERTED.description, INSERTED.status, INSERTED.due_utc VALUES (@client_id, @name, @description, @status, @due_utc)`); await logActivity({ type: 'OnboardingTaskCreated', title: `Created onboarding task ${name} for client ${client_id}`, client_id }); ok(res, result.recordset[0], 201); }));
router.put('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res,'id must be a positive integer'); const parsed = OnboardingTaskUpdate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; ')); const data = parsed.data; const sets: string[] = []; const pool = await getPool(); const request = pool.request().input('id', sql.Int, id); if (data.name !== undefined) { sets.push('name=@name'); request.input('name', sql.NVarChar(200), data.name); } if (data.description !== undefined) { sets.push('description=@description'); request.input('description', sql.NVarChar(1000), data.description); } if (data.status !== undefined) { sets.push('status=@status'); request.input('status', sql.NVarChar(40), data.status); } if (data.due_utc !== undefined) { sets.push('due_utc=@due_utc'); request.input('due_utc', sql.DateTime2, data.due_utc); } if (!sets.length) return badRequest(res,'No fields to update'); const result = await request.query(`UPDATE app.client_onboarding_tasks SET ${sets.join(', ')} WHERE task_id=@id`); if (result.rowsAffected[0]===0) return notFound(res); const read = await pool.request().input('id', sql.Int, id).query(`SELECT task_id, client_id, name, description, status, due_utc FROM app.client_onboarding_tasks WHERE task_id=@id`); await logActivity({ type: 'OnboardingTaskUpdated', title: `Updated onboarding task ${id}`, client_id: read.recordset[0].client_id }); ok(res, read.recordset[0]); }));
router.delete('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res,'id must be a positive integer'); const pool = await getPool(); const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.client_onboarding_tasks WHERE task_id=@id`); if (r.rowsAffected[0]===0) return notFound(res); await logActivity({ type: 'OnboardingTaskDeleted', title: `Deleted onboarding task ${id}`, client_id: null }); ok(res, { deleted: r.rowsAffected[0] }); }));
export default router;
