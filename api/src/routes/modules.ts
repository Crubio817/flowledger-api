import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';

const router = Router();

// Helpers
function isUuid(v: string) { return /^[0-9a-fA-F-]{36}$/.test(v); }

// modules.module CRUD
router.get('/registry', asyncHandler(async (_req, res) => {
  const pool = await getPool();
  const rs = await pool.request().query(`SELECT module_id, [key], name, description, scope, color, created_at FROM modules.[module] ORDER BY name`);
  listOk(res, rs.recordset, { page: 1, limit: rs.recordset.length });
}));

router.post('/registry', asyncHandler(async (req, res) => {
  const { key, name, description, scope = 'external', color = '#007bff' } = req.body || {};
  if (!key || !name) return badRequest(res, 'key and name are required');
  if (!['internal','external','hybrid'].includes(String(scope))) return badRequest(res, 'invalid scope');
  const pool = await getPool();
  try {
    const rs = await pool.request()
      .input('key', sql.VarChar(100), key)
      .input('name', sql.NVarChar(200), name)
      .input('desc', sql.NVarChar(1000), description || null)
      .input('scope', sql.VarChar(30), scope)
      .input('color', sql.VarChar(7), color)
      .query(`INSERT INTO modules.[module]([key], name, description, scope, color)
              OUTPUT INSERTED.module_id, INSERTED.[key], INSERTED.name, INSERTED.description, INSERTED.scope, INSERTED.color, INSERTED.created_at
              VALUES (@key, @name, @desc, @scope, @color)`);
    ok(res, rs.recordset[0], 201);
  } catch (e: any) {
    if ((e.number === 2627 || e.code === 'EREQUEST') && String(e.message||'').includes('UQ')) {
      return badRequest(res, 'key must be unique');
    }
    throw e;
  }
}));

router.put('/registry/:module_id', asyncHandler(async (req, res) => {
  const { module_id } = req.params;
  if (!isUuid(module_id)) return badRequest(res, 'module_id must be UUID');
  const { name, description, scope, color } = req.body || {};
  const sets: string[] = [];
  const pool = await getPool();
  const r = pool.request().input('id', sql.UniqueIdentifier, module_id);
  if (name !== undefined) { sets.push('name=@name'); r.input('name', sql.NVarChar(200), name); }
  if (description !== undefined) { sets.push('description=@desc'); r.input('desc', sql.NVarChar(1000), description); }
  if (scope !== undefined) {
    if (!['internal','external','hybrid'].includes(String(scope))) return badRequest(res, 'invalid scope');
    sets.push('scope=@scope'); r.input('scope', sql.VarChar(30), scope);
  }
  if (color !== undefined) { sets.push('color=@color'); r.input('color', sql.VarChar(7), color); }
  if (!sets.length) return badRequest(res, 'No fields to update');
  const upd = await r.query(`UPDATE modules.[module] SET ${sets.join(', ')} WHERE module_id=@id`);
  if (!upd.rowsAffected[0]) return notFound(res);
  const read = await (await getPool()).request().input('id', sql.UniqueIdentifier, module_id)
    .query(`SELECT module_id, [key], name, description, scope, color, created_at FROM modules.[module] WHERE module_id=@id`);
  ok(res, read.recordset[0]);
}));

router.delete('/registry/:module_id', asyncHandler(async (req, res) => {
  const { module_id } = req.params;
  if (!isUuid(module_id)) return badRequest(res, 'module_id must be UUID');
  const pool = await getPool();
  try {
    const del = await pool.request().input('id', sql.UniqueIdentifier, module_id)
      .query('DELETE FROM modules.[module] WHERE module_id=@id');
    if (!del.rowsAffected[0]) return notFound(res);
    ok(res, { deleted: del.rowsAffected[0] });
  } catch (e: any) {
    // FK conflict if versions/instances exist
    return res.status(409).json({ error: { code: 'Conflict', message: e?.message || 'Conflict' } });
  }
}));

// module_version
router.get('/:module_id/versions', asyncHandler(async (req, res) => {
  const { module_id } = req.params;
  if (!isUuid(module_id)) return badRequest(res, 'module_id must be UUID');
  const pool = await getPool();
  const rs = await pool.request().input('id', sql.UniqueIdentifier, module_id)
    .query(`SELECT module_version_id, module_id, semver, status, created_at FROM modules.module_version WHERE module_id=@id ORDER BY created_at DESC`);
  listOk(res, rs.recordset, { page: 1, limit: rs.recordset.length });
}));

router.post('/:module_id/versions', asyncHandler(async (req, res) => {
  const { module_id } = req.params; const { semver, status = 'released' } = req.body || {};
  if (!isUuid(module_id)) return badRequest(res, 'module_id must be UUID');
  if (!semver) return badRequest(res, 'semver required');
  if (!['draft','released','deprecated'].includes(String(status))) return badRequest(res, 'invalid status');
  const pool = await getPool();
  try {
    const rs = await pool.request()
      .input('module_id', sql.UniqueIdentifier, module_id)
      .input('semver', sql.VarChar(20), semver)
      .input('status', sql.VarChar(20), status)
      .query(`INSERT INTO modules.module_version (module_id, semver, status)
              OUTPUT INSERTED.module_version_id, INSERTED.module_id, INSERTED.semver, INSERTED.status, INSERTED.created_at
              VALUES (@module_id, @semver, @status)`);
    ok(res, rs.recordset[0], 201);
  } catch (e: any) {
    if (String(e.message||'').includes('UQ_modules_module_version')) return badRequest(res, 'version already exists');
    throw e;
  }
}));

// module_instance
router.get('/instances', asyncHandler(async (_req, res) => {
  const pool = await getPool();
  const rs = await pool.request().query(`
    SELECT i.module_instance_id, i.module_id, m.[key] as module_key, i.module_version_id, i.client_id, i.is_enabled, i.created_at
    FROM modules.module_instance i
    JOIN modules.[module] m ON m.module_id = i.module_id
    ORDER BY i.created_at DESC`);
  listOk(res, rs.recordset, { page: 1, limit: rs.recordset.length });
}));

router.post('/instances', asyncHandler(async (req, res) => {
  const { module_id, module_version_id = null, client_id, is_enabled = true } = req.body || {};
  if (!isUuid(module_id) || (module_version_id && !isUuid(module_version_id))) return badRequest(res, 'module_id/version must be UUID');
  const clientIdNum = Number(client_id);
  if (!Number.isInteger(clientIdNum) || clientIdNum <= 0) return badRequest(res, 'client_id must be positive integer');
  const pool = await getPool();
  const rs = await pool.request()
    .input('module_id', sql.UniqueIdentifier, module_id)
    .input('module_version_id', sql.UniqueIdentifier, module_version_id)
    .input('client_id', sql.Int, clientIdNum)
    .input('is_enabled', sql.Bit, is_enabled ? 1 : 0)
    .query(`INSERT INTO modules.module_instance (module_id, module_version_id, client_id, is_enabled)
            OUTPUT INSERTED.module_instance_id, INSERTED.module_id, INSERTED.module_version_id, INSERTED.client_id, INSERTED.is_enabled, INSERTED.created_at
            VALUES (@module_id, @module_version_id, @client_id, @is_enabled)`);
  ok(res, rs.recordset[0], 201);
}));

router.put('/instances/:module_instance_id', asyncHandler(async (req, res) => {
  const { module_instance_id } = req.params;
  if (!isUuid(module_instance_id)) return badRequest(res, 'module_instance_id must be UUID');
  const { module_version_id, is_enabled } = req.body || {};
  const sets: string[] = [];
  const r = (await getPool()).request().input('id', sql.UniqueIdentifier, module_instance_id);
  if (module_version_id !== undefined) {
    if (module_version_id !== null && !isUuid(module_version_id)) return badRequest(res, 'module_version_id must be UUID or null');
    sets.push('module_version_id=@ver'); r.input('ver', sql.UniqueIdentifier, module_version_id);
  }
  if (is_enabled !== undefined) { sets.push('is_enabled=@en'); r.input('en', sql.Bit, is_enabled ? 1 : 0); }
  if (!sets.length) return badRequest(res, 'No fields to update');
  const upd = await r.query(`UPDATE modules.module_instance SET ${sets.join(', ')} WHERE module_instance_id=@id`);
  if (!upd.rowsAffected[0]) return notFound(res);
  const read = await (await getPool()).request().input('id', sql.UniqueIdentifier, module_instance_id)
    .query(`SELECT module_instance_id, module_id, module_version_id, client_id, is_enabled, created_at FROM modules.module_instance WHERE module_instance_id=@id`);
  ok(res, read.recordset[0]);
}));

router.delete('/instances/:module_instance_id', asyncHandler(async (req, res) => {
  const { module_instance_id } = req.params; if (!isUuid(module_instance_id)) return badRequest(res, 'UUID required');
  const pool = await getPool();
  const del = await pool.request().input('id', sql.UniqueIdentifier, module_instance_id)
    .query('DELETE FROM modules.module_instance WHERE module_instance_id=@id');
  if (!del.rowsAffected[0]) return notFound(res);
  ok(res, { deleted: del.rowsAffected[0] });
}));

// module_config
router.get('/instances/:module_instance_id/config', asyncHandler(async (req, res) => {
  const { module_instance_id } = req.params; if (!isUuid(module_instance_id)) return badRequest(res, 'UUID required');
  const pool = await getPool();
  const rs = await pool.request().input('id', sql.UniqueIdentifier, module_instance_id)
    .query(`SELECT module_config_id, module_instance_id, cfg_json, secrets_ref, is_active, created_at
            FROM modules.module_config WHERE module_instance_id=@id ORDER BY created_at DESC`);
  listOk(res, rs.recordset, { page: 1, limit: rs.recordset.length });
}));

router.post('/instances/:module_instance_id/config', asyncHandler(async (req, res) => {
  const { module_instance_id } = req.params; if (!isUuid(module_instance_id)) return badRequest(res, 'UUID required');
  const { cfg_json, secrets_ref = null, is_active = true } = req.body || {};
  if (cfg_json === undefined) return badRequest(res, 'cfg_json required');
  const pool = await getPool();
  const rs = await pool.request()
    .input('module_instance_id', sql.UniqueIdentifier, module_instance_id)
    .input('cfg_json', sql.NVarChar(sql.MAX), typeof cfg_json === 'string' ? cfg_json : JSON.stringify(cfg_json))
    .input('secrets_ref', sql.NVarChar(200), secrets_ref)
    .input('is_active', sql.Bit, is_active ? 1 : 0)
    .query(`INSERT INTO modules.module_config (module_instance_id, cfg_json, secrets_ref, is_active)
            OUTPUT INSERTED.module_config_id, INSERTED.module_instance_id, INSERTED.cfg_json, INSERTED.secrets_ref, INSERTED.is_active, INSERTED.created_at
            VALUES (@module_instance_id, @cfg_json, @secrets_ref, @is_active)`);
  ok(res, rs.recordset[0], 201);
}));

export default router;
