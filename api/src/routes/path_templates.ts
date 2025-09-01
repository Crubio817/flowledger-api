import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { PathTemplateCreate, PathTemplateUpdate } from '../validation/path_schemas';
import { logActivity } from '../utils/activity';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
  const pool = await getPool();
  const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(
    `SELECT path_id, name, description, version, active, created_utc, COUNT(*) OVER() AS total FROM app.path_templates ORDER BY path_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
  );
  const total = r.recordset[0]?.total ?? 0;
  const items = r.recordset.map(({ total: _t, ...row }: any) => row);
  listOk(res, items, { page, limit, total });
}));

router.get('/:path_id', asyncHandler(async (req, res) => {
  const id = Number(req.params.path_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'path_id must be a positive integer');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT path_id, name, description, version, active, created_utc FROM app.path_templates WHERE path_id=@id`);
  const row = r.recordset[0];
  if (!row) return notFound(res);
  ok(res, row);
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = PathTemplateCreate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const { name, description = null, version = 'v1.0', active = true } = parsed.data;
  const pool = await getPool();
  const r = await pool.request()
    .input('name', sql.NVarChar(120), name)
    .input('description', sql.NVarChar(400), description)
    .input('version', sql.NVarChar(20), version)
    .input('active', sql.Bit, active ? 1 : 0)
    .query(`INSERT INTO app.path_templates (name, description, version, active) VALUES (@name, @description, @version, @active); SELECT SCOPE_IDENTITY() AS id`);
  const id = Math.floor(r.recordset[0].id);
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT path_id, name, description, version, active, created_utc FROM app.path_templates WHERE path_id=@id`);
  const created = read.recordset[0];
  await logActivity({ type: 'AuditCreated', title: `Path ${name} created`, client_id: null });
  ok(res, created, 201);
}));

router.put('/:path_id', asyncHandler(async (req, res) => {
  const id = Number(req.params.path_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'path_id must be a positive integer');
  const parsed = PathTemplateUpdate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data;
  const sets: string[] = [];
  const pool = await getPool();
  const request = pool.request().input('id', sql.Int, id);
  if (data.name !== undefined) { sets.push('name = @name'); request.input('name', sql.NVarChar(120), data.name); }
  if (data.description !== undefined) { sets.push('description = @description'); request.input('description', sql.NVarChar(400), data.description); }
  if (data.version !== undefined) { sets.push('version = @version'); request.input('version', sql.NVarChar(20), data.version); }
  if (data.active !== undefined) { sets.push('active = @active'); request.input('active', sql.Bit, data.active ? 1 : 0); }
  if (!sets.length) return badRequest(res, 'No fields to update');
  sets.push('created_utc = created_utc');
  const result = await request.query(`UPDATE app.path_templates SET ${sets.join(', ')} WHERE path_id = @id`);
  if (result.rowsAffected[0] === 0) return notFound(res);
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT path_id, name, description, version, active, created_utc FROM app.path_templates WHERE path_id=@id`);
  ok(res, read.recordset[0]);
}));

router.delete('/:path_id', asyncHandler(async (req, res) => {
  const id = Number(req.params.path_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'path_id must be a positive integer');
  const pool = await getPool();
  const result = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.path_templates WHERE path_id=@id`);
  if (result.rowsAffected[0] === 0) return notFound(res);
  await logActivity({ type: 'AuditDeleted', title: `Path ${id} deleted`, client_id: null });
  ok(res, { deleted: result.rowsAffected[0] });
}));

// Publish a path template (create a new active version)
router.post('/:path_id/publish', asyncHandler(async (req, res) => {
  const id = Number(req.params.path_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'path_id must be a positive integer');
  const new_version = String(req.body?.new_version ?? '').trim();
  if (!new_version) return badRequest(res, 'new_version is required');
  if (new_version.length > 20) return badRequest(res, 'new_version must be 20 characters or fewer');
  const pool = await getPool();
  const r = await pool.request()
    .input('path_id', sql.Int, id)
    .input('new_version', sql.NVarChar(20), new_version)
    .execute('app.sp_path_template_publish');
  // proc returns the newly created template row
  const created = r.recordset?.[0];
  if (!created) return notFound(res);
  await logActivity({ type: 'AuditCreated', title: `Path ${created.path_id} published`, client_id: null });
  ok(res, created, 201);
}));

// Clone a path template as a draft
router.post('/:path_id/clone', asyncHandler(async (req, res) => {
  const id = Number(req.params.path_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'path_id must be a positive integer');
  const pool = await getPool();
  const r = await pool.request().input('path_id', sql.Int, id).execute('app.sp_path_template_clone');
  const created = r.recordset?.[0];
  if (!created) return notFound(res);
  await logActivity({ type: 'AuditCreated', title: `Path ${created.path_id} cloned`, client_id: null });
  ok(res, created, 201);
}));

// Usage: audit count and recent audits for template
router.get('/:path_id/usage', asyncHandler(async (req, res) => {
  const id = Number(req.params.path_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'path_id must be a positive integer');
  const pool = await getPool();
  const r = await pool.request().input('path_id', sql.Int, id).execute('app.sp_path_template_usage');
  // proc returns two resultsets: first a single row with audit_count, second the audits list
  const recordsets = (r.recordsets as any[]) ?? [];
  const auditCountRow = recordsets[0]?.[0] ?? null;
  const audits = recordsets[1] ?? [];
  const resp = { audit_count: auditCountRow?.audit_count ?? 0, audits };
  ok(res, resp);
}));

export default router;
