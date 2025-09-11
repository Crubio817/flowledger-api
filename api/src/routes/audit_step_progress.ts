import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { AuditStepProgressCreate, AuditStepProgressUpdate } from '../validation/path_schemas';
import { logActivity } from '../utils/activity';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
  const pool = await getPool();
  const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(
    `SELECT audit_step_id, audit_path_id, title, state, severity, due_at, created_at, updated_at, COUNT(*) OVER() AS total FROM app.audit_step ORDER BY audit_step_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
  );
  const total = r.recordset[0]?.total ?? 0;
  const items = r.recordset.map(({ total: _t, ...row }: any) => row);
  listOk(res, items, { page, limit, total });
}));

router.get('/:progress_id', asyncHandler(async (req, res) => {
  const id = Number(req.params.progress_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'progress_id must be a positive integer');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT audit_step_id, audit_path_id, title, desc, owner_id, state, severity, due_at, created_at, updated_at FROM app.audit_step WHERE audit_step_id=@id`);
  const row = r.recordset[0];
  if (!row) return notFound(res);
  ok(res, row);
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = AuditStepProgressCreate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data;
  const pool = await getPool();

  // Map old progress fields to new audit_step fields
  const state = data.status === 'done' ? 'done' : data.status === 'in_progress' ? 'in_progress' : 'todo';
  const title = `Step ${data.step_id} Progress`; // Generate a title since the new schema requires it

  const r = await pool.request()
    .input('audit_path_id', sql.BigInt, data.audit_id) // Map audit_id to audit_path_id
    .input('title', sql.NVarChar(200), title)
    .input('state', sql.NVarChar(12), state)
    .input('severity', sql.NVarChar(6), 'med') // Default severity
    .input('due_at', sql.DateTime2, data.completed_utc) // Map completed_utc to due_at
    .query(`INSERT INTO app.audit_step (audit_path_id, title, state, severity, due_at) VALUES (@audit_path_id, @title, @state, @severity, @due_at); SELECT SCOPE_IDENTITY() AS id`);

  const id = Math.floor(r.recordset[0].id);
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT audit_step_id, audit_path_id, title, desc, owner_id, state, severity, due_at, created_at, updated_at FROM app.audit_step WHERE audit_step_id=@id`);
  const created = read.recordset[0];
  await logActivity({ type: 'AuditCreated', title: `Step ${created.audit_step_id} created`, audit_id: created.audit_path_id });
  ok(res, created, 201);
}));

router.put('/:progress_id', asyncHandler(async (req, res) => {
  const id = Number(req.params.progress_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'progress_id must be a positive integer');
  const parsed = AuditStepProgressUpdate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data;
  const sets: string[] = [];
  const pool = await getPool();
  const request = pool.request().input('id', sql.Int, id);

  // Map old fields to new schema
  if (data.status !== undefined) {
    const state = data.status === 'done' ? 'done' : data.status === 'in_progress' ? 'in_progress' : 'todo';
    sets.push('state = @state');
    request.input('state', sql.NVarChar(12), state);
  }
  if (data.completed_utc !== undefined) {
    sets.push('due_at = @due_at');
    request.input('due_at', sql.DateTime2, data.completed_utc);
  }

  if (!sets.length) return badRequest(res, 'No fields to update');
  sets.push('updated_at = SYSUTCDATETIME()');
  const result = await request.query(`UPDATE app.audit_step SET ${sets.join(', ')} WHERE audit_step_id = @id`);
  if (result.rowsAffected[0] === 0) return notFound(res);
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT audit_step_id, audit_path_id, title, desc, owner_id, state, severity, due_at, created_at, updated_at FROM app.audit_step WHERE audit_step_id=@id`);
  const updated = read.recordset[0];
  await logActivity({ type: 'AuditUpdated', title: `Step ${updated.audit_step_id} updated`, audit_id: updated.audit_path_id });
  ok(res, updated);
}));

router.delete('/:progress_id', asyncHandler(async (req, res) => {
  const id = Number(req.params.progress_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'progress_id must be a positive integer');
  const pool = await getPool();
  // Get audit_path_id before deleting
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT audit_path_id FROM app.audit_step WHERE audit_step_id=@id`);
  if (!read.recordset[0]) return notFound(res);
  const audit_path_id = read.recordset[0].audit_path_id;
  const result = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.audit_step WHERE audit_step_id=@id`);
  if (result.rowsAffected[0] === 0) return notFound(res);
  await logActivity({ type: 'AuditDeleted', title: `Step ${id} deleted`, audit_id: audit_path_id });
  ok(res, { deleted: result.rowsAffected[0] });
}));

export default router;
