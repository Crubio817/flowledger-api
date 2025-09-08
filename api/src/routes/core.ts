import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';

const router = Router();
const isUuid = (v: string) => /^[0-9a-fA-F-]{36}$/.test(v);

// Organizations
router.get('/organizations', asyncHandler(async (_req, res) => {
  const rs = await (await getPool()).request().query('SELECT org_id, name, created_at FROM core.organizations ORDER BY created_at DESC');
  listOk(res, rs.recordset, { page: 1, limit: rs.recordset.length });
}));

router.post('/organizations', asyncHandler(async (req, res) => {
  const { name } = req.body || {};
  if (!name) return badRequest(res, 'name required');
  const rs = await (await getPool()).request().input('name', sql.NVarChar(200), name)
    .query('INSERT INTO core.organizations(name) OUTPUT INSERTED.org_id, INSERTED.name, INSERTED.created_at VALUES (@name)');
  ok(res, rs.recordset[0], 201);
}));

// Clients (UUID)
router.get('/clients', asyncHandler(async (req, res) => {
  const org_id = String(req.query.org_id || '');
  const r = (await getPool()).request();
  let where = '';
  if (org_id) {
    if (!isUuid(org_id)) return badRequest(res, 'org_id must be UUID');
    r.input('org', sql.UniqueIdentifier, org_id);
    where = 'WHERE org_id=@org';
  }
  const rs = await r.query(`SELECT client_id, org_id, name, status, created_at FROM core.clients ${where} ORDER BY created_at DESC`);
  listOk(res, rs.recordset, { page: 1, limit: rs.recordset.length });
}));

router.post('/clients', asyncHandler(async (req, res) => {
  const { org_id, name, status = 'active' } = req.body || {};
  if (!org_id || !isUuid(org_id)) return badRequest(res, 'org_id (UUID) required');
  if (!name) return badRequest(res, 'name required');
  const rs = await (await getPool()).request()
    .input('org', sql.UniqueIdentifier, org_id)
    .input('name', sql.NVarChar(200), name)
    .input('status', sql.VarChar(30), status)
    .query('INSERT INTO core.clients(org_id, name, status) OUTPUT INSERTED.client_id, INSERTED.org_id, INSERTED.name, INSERTED.status, INSERTED.created_at VALUES (@org, @name, @status)');
  ok(res, rs.recordset[0], 201);
}));

export default router;
