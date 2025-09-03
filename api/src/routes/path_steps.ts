import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { PathStepCreate, PathStepUpdate } from '../validation/path_schemas';
import { logActivity } from '../utils/activity';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
  const pool = await getPool();
  const r = await pool.request().input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(
    `SELECT step_id, path_id, seq, title, state_gate, required, agent_key, input_contract, output_contract, created_utc, COUNT(*) OVER() AS total FROM app.path_steps ORDER BY path_id, seq OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
  );
  const total = r.recordset[0]?.total ?? 0;
  const items = r.recordset.map(({ total: _t, ...row }: any) => row);
  listOk(res, items, { page, limit, total });
}));

router.get('/:step_id', asyncHandler(async (req, res) => {
  const id = Number(req.params.step_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'step_id must be a positive integer');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT step_id, path_id, seq, title, state_gate, required, agent_key, input_contract, output_contract, created_utc FROM app.path_steps WHERE step_id=@id`);
  const row = r.recordset[0];
  if (!row) return notFound(res);
  ok(res, row);
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = PathStepCreate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data;
  const pool = await getPool();
  const r = await pool.request()
    .input('path_id', sql.Int, data.path_id)
    .input('seq', sql.Int, data.seq)
    .input('title', sql.NVarChar(150), data.title)
    .input('state_gate', sql.NVarChar(40), data.state_gate)
    .input('required', sql.Bit, data.required ? 1 : 0)
    .input('agent_key', sql.NVarChar(80), data.agent_key)
    .input('input_contract', sql.NVarChar(sql.MAX), data.input_contract)
    .input('output_contract', sql.NVarChar(sql.MAX), data.output_contract)
    .query(`INSERT INTO app.path_steps (path_id, seq, title, state_gate, required, agent_key, input_contract, output_contract) VALUES (@path_id, @seq, @title, @state_gate, @required, @agent_key, @input_contract, @output_contract); SELECT SCOPE_IDENTITY() AS id`);
  const id = Math.floor(r.recordset[0].id);
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT step_id, path_id, seq, title, state_gate, required, agent_key, input_contract, output_contract, created_utc FROM app.path_steps WHERE step_id=@id`);
  const created = read.recordset[0];
  await logActivity({ type: 'AuditCreated', title: `PathStep ${created.step_id} created`, client_id: null });
  ok(res, created, 201);
}));

router.put('/:step_id', asyncHandler(async (req, res) => {
  const id = Number(req.params.step_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'step_id must be a positive integer');
  const parsed = PathStepUpdate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data;
  const sets: string[] = [];
  const pool = await getPool();
  const request = pool.request().input('id', sql.Int, id);
  if (data.path_id !== undefined) { sets.push('path_id = @path_id'); request.input('path_id', sql.Int, data.path_id); }
  if (data.seq !== undefined) { sets.push('seq = @seq'); request.input('seq', sql.Int, data.seq); }
  if (data.title !== undefined) { sets.push('title = @title'); request.input('title', sql.NVarChar(150), data.title); }
  if (data.state_gate !== undefined) { sets.push('state_gate = @state_gate'); request.input('state_gate', sql.NVarChar(40), data.state_gate); }
  if (data.required !== undefined) { sets.push('required = @required'); request.input('required', sql.Bit, data.required ? 1 : 0); }
  if (data.agent_key !== undefined) { sets.push('agent_key = @agent_key'); request.input('agent_key', sql.NVarChar(80), data.agent_key); }
  if (data.input_contract !== undefined) { sets.push('input_contract = @input_contract'); request.input('input_contract', sql.NVarChar(sql.MAX), data.input_contract); }
  if (data.output_contract !== undefined) { sets.push('output_contract = @output_contract'); request.input('output_contract', sql.NVarChar(sql.MAX), data.output_contract); }
  if (!sets.length) return badRequest(res, 'No fields to update');
  const result = await request.query(`UPDATE app.path_steps SET ${sets.join(', ')} WHERE step_id = @id`);
  if (result.rowsAffected[0] === 0) return notFound(res);
  const read = await pool.request().input('id', sql.Int, id).query(`SELECT step_id, path_id, seq, title, state_gate, required, agent_key, input_contract, output_contract, created_utc FROM app.path_steps WHERE step_id=@id`);
  await logActivity({ type: 'AuditUpdated', title: `PathStep ${id} updated`, client_id: null });
  ok(res, read.recordset[0]);
}));

router.delete('/:step_id', asyncHandler(async (req, res) => {
  const id = Number(req.params.step_id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'step_id must be a positive integer');
  const pool = await getPool();
  const result = await pool.request().input('id', sql.Int, id).query(`DELETE FROM app.path_steps WHERE step_id=@id`);
  if (result.rowsAffected[0] === 0) return notFound(res);
  await logActivity({ type: 'AuditDeleted', title: `PathStep ${id} deleted`, client_id: null });
  ok(res, { deleted: result.rowsAffected[0] });
}));

// Reorder steps for a path (bulk)
router.put('/reorder', asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const path_id = Number(body.path_id);
  const order = Array.isArray(body.order)
    ? body.order.map((v: any) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0)
    : null;
  if (!Number.isInteger(path_id) || path_id <= 0) return badRequest(res, 'path_id must be a positive integer');
  if (!order || !order.length) return badRequest(res, 'order must be a non-empty array of step ids');
  const pool = await getPool();
  const r = await pool.request()
    .input('path_id', sql.Int, path_id)
    .input('step_order', sql.NVarChar(sql.MAX), JSON.stringify(order))
    .execute('app.sp_path_steps_reorder');
  // optionally return updated list
  const read = await pool.request().input('id', sql.Int, path_id).query(`SELECT step_id, path_id, seq, title, state_gate, required, agent_key, input_contract, output_contract, created_utc FROM app.path_steps WHERE path_id=@id ORDER BY seq`);
  ok(res, read.recordset);
}));

export default router;
