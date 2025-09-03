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
    `SELECT progress_id, audit_id, step_id, status, started_utc, completed_utc, output_json, notes, created_utc, updated_utc, COUNT(*) OVER() AS total FROM app.audit_step_progress ORDER BY progress_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
  );
  const total = r.recordset[0]?.total ?? 0;
  const items = r.recordset.map(({ total: _t, ...row }: any) => row);
  listOk(res, items, { page, limit, total });
}));

router.get('/:progress_id', asyncHandler(async (req, res) => {
  const id = Number(req.params.progress_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'progress_id must be a positive integer');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT progress_id, audit_id, step_id, status, started_utc, completed_utc, output_json, notes, created_utc, updated_utc FROM app.audit_step_progress WHERE progress_id=@id`);
  const row = r.recordset[0];
  if (!row) return notFound(res);
  ok(res, row);
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = AuditStepProgressCreate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data;
  const pool = await getPool();
  const r = await pool.request()
    .input('audit_id', sql.BigInt, data.audit_id)
    .input('step_id', sql.Int, data.step_id)
    .input('status', sql.NVarChar(30), data.status ?? 'not_started')
    .input('started_utc', sql.DateTime2, data.started_utc)
    .input('completed_utc', sql.DateTime2, data.completed_utc)
    .input('output_json', sql.NVarChar(sql.MAX), data.output_json)
    .input('notes', sql.NVarChar(sql.MAX), data.notes)
    .query(`INSERT INTO app.audit_step_progress (audit_id, step_id, status, started_utc, completed_utc, output_json, notes) VALUES (@audit_id, @step_id, @status, @started_utc, @completed_utc, @output_json, @notes); SELECT SCOPE_IDENTITY() AS id`);
  const id = Math.floor(r.recordset[0].id);
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT progress_id, audit_id, step_id, status, started_utc, completed_utc, output_json, notes, created_utc, updated_utc FROM app.audit_step_progress WHERE progress_id=@id`);
  const created = read.recordset[0];
  await logActivity({ type: 'AuditCreated', title: `Progress ${created.progress_id} created`, audit_id: created.audit_id });
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
  if (data.audit_id !== undefined) { sets.push('audit_id = @audit_id'); request.input('audit_id', sql.BigInt, data.audit_id); }
  if (data.step_id !== undefined) { sets.push('step_id = @step_id'); request.input('step_id', sql.Int, data.step_id); }
  if (data.status !== undefined) { sets.push('status = @status'); request.input('status', sql.NVarChar(30), data.status); }
  if (data.started_utc !== undefined) { sets.push('started_utc = @started_utc'); request.input('started_utc', sql.DateTime2, data.started_utc); }
  if (data.completed_utc !== undefined) { sets.push('completed_utc = @completed_utc'); request.input('completed_utc', sql.DateTime2, data.completed_utc); }
  if (data.output_json !== undefined) { sets.push('output_json = @output_json'); request.input('output_json', sql.NVarChar(sql.MAX), data.output_json); }
  if (data.notes !== undefined) { sets.push('notes = @notes'); request.input('notes', sql.NVarChar(sql.MAX), data.notes); }
  if (!sets.length) return badRequest(res, 'No fields to update');
  sets.push('updated_utc = SYSUTCDATETIME()');
  const result = await request.query(`UPDATE app.audit_step_progress SET ${sets.join(', ')} WHERE progress_id = @id`);
  if (result.rowsAffected[0] === 0) return notFound(res);
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT progress_id, audit_id, step_id, status, started_utc, completed_utc, output_json, notes, created_utc, updated_utc FROM app.audit_step_progress WHERE progress_id=@id`);
  const updated = read.recordset[0];
  await logActivity({ type: 'AuditUpdated', title: `Progress ${updated.progress_id} updated`, audit_id: updated.audit_id });
  ok(res, updated);
}));

router.delete('/:progress_id', asyncHandler(async (req, res) => {
  const id = Number(req.params.progress_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'progress_id must be a positive integer');
  const pool = await getPool();
  // Get audit_id before deleting
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT audit_id FROM app.audit_step_progress WHERE progress_id=@id`);
  if (!read.recordset[0]) return notFound(res);
  const audit_id = read.recordset[0].audit_id;
  const result = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.audit_step_progress WHERE progress_id=@id`);
  if (result.rowsAffected[0] === 0) return notFound(res);
  await logActivity({ type: 'AuditDeleted', title: `Progress ${id} deleted`, audit_id });
  ok(res, { deleted: result.rowsAffected[0] });
}));

export default router;
