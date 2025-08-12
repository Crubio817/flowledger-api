import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { logActivity } from '../utils/activity';

const router = Router();

async function clientExists(clientId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, clientId).query(
    `SELECT client_id FROM app.clients WHERE client_id = @id`
  );
  return r.recordset.length > 0;
}

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
        `SELECT audit_id, client_id, title, scope, status, created_utc, updated_utc
         FROM app.audits
         ORDER BY audit_id
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
  listOk(res, result.recordset, { page, limit });
  })
);

router.get(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (Number.isNaN(auditId)) return badRequest(res, 'audit_id must be int');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, auditId).query(
      `SELECT audit_id, client_id, title, scope, status, created_utc, updated_utc
       FROM app.audits WHERE audit_id = @id`
    );
  const row = result.recordset[0];
  if (!row) return notFound(res);
    ok(res, row);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { audit_id, client_id, title, scope = null, status = null } = req.body || {};
    if (typeof audit_id !== 'number' || typeof client_id !== 'number' || typeof title !== 'string')
      return badRequest(res, 'audit_id (number), client_id (number), title (string) required');
    if (!(await clientExists(client_id))) return badRequest(res, 'client_id does not exist');

    const pool = await getPool();
    await pool
      .request()
      .input('audit_id', sql.Int, audit_id)
      .input('client_id', sql.Int, client_id)
      .input('title', sql.NVarChar(200), title)
      .input('scope', sql.NVarChar(1000), scope)
      .input('status', sql.NVarChar(40), status)
      .query(
        `INSERT INTO app.audits (audit_id, client_id, title, scope, status)
         VALUES (@audit_id, @client_id, @title, @scope, COALESCE(@status, N'InProgress'))`
      );

    const read = await pool.request().input('id', sql.Int, audit_id).query(
      `SELECT audit_id, client_id, title, scope, status, created_utc, updated_utc FROM app.audits WHERE audit_id = @id`
    );
  const created = read.recordset[0];
  await logActivity({ type: 'AuditCreated', title: `Audit ${title} created`, audit_id: audit_id, client_id });
  ok(res, created, 201);
  })
);

router.put(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (Number.isNaN(auditId)) return badRequest(res, 'audit_id must be int');

    const sets: string[] = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, auditId);

    if (typeof req.body.title === 'string') {
      sets.push('title = @title');
      request.input('title', sql.NVarChar(200), req.body.title);
    }
    if (typeof req.body.scope === 'string' || req.body.scope === null) {
      sets.push('scope = @scope');
      request.input('scope', sql.NVarChar(1000), req.body.scope);
    }
    if (typeof req.body.status === 'string') {
      sets.push('status = @status');
      request.input('status', sql.NVarChar(40), req.body.status);
    }

    if (!sets.length) return badRequest(res, 'No fields to update');

    sets.push('updated_utc = SYSUTCDATETIME()');

    const result = await request.query(`UPDATE app.audits SET ${sets.join(', ')} WHERE audit_id = @id`);
  if (result.rowsAffected[0] === 0) return notFound(res);

    const read = await pool.request().input('id', sql.Int, auditId).query(
      `SELECT audit_id, client_id, title, scope, status, created_utc, updated_utc FROM app.audits WHERE audit_id = @id`
    );
  const updated = read.recordset[0];
  await logActivity({ type: 'AuditUpdated', title: `Audit ${auditId} updated`, audit_id: auditId, client_id: updated.client_id });
  ok(res, updated);
  })
);

router.delete(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (Number.isNaN(auditId)) return badRequest(res, 'audit_id must be int');
    const pool = await getPool();
    try {
      const result = await pool.request().input('id', sql.Int, auditId).query(
        `DELETE FROM app.audits WHERE audit_id = @id`
      );
  if (result.rowsAffected[0] === 0) return notFound(res);
  await logActivity({ type: 'AuditDeleted', title: `Audit ${auditId} deleted`, audit_id: auditId });
  ok(res, { deleted: result.rowsAffected[0] });
    } catch (e: any) {
      res.status(409).json({ status: 'error', data: null, error: e.message });
    }
  })
);

export default router;
