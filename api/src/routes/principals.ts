import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';

const router = Router();

// GET /api/principals - List principals for assignment pickers
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { search, type } = req.query;

  if (!orgId) return badRequest(res, 'org_id required');

  let query = `
    SELECT principal_id, display_name, primary_email, principal_type, is_active
    FROM app.principal
    WHERE org_id = @orgId AND is_active = 1
  `;
  const pool = await getPool();
  const request = pool.request().input('orgId', sql.Int, orgId);

  if (search) {
    query += ' AND (display_name LIKE @search OR primary_email LIKE @search)';
    request.input('search', `%${search}%`);
  }

  if (type) {
    query += ' AND principal_type = @type';
    request.input('type', type as string);
  }

  query += ' ORDER BY display_name OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
  request.input('offset', sql.Int, offset).input('limit', sql.Int, limit);

  const result = await request.query(query);
  listOk(res, result.recordset, { page, limit });
}));

// GET /api/principals/:id - Get principal details
router.get('/:id', asyncHandler(async (req, res) => {
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { id } = req.params;

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.BigInt, parseInt(id))
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT p.*, pi.provider, pi.subject
      FROM app.principal p
      LEFT JOIN app.principal_identity pi ON p.principal_id = pi.principal_id
      WHERE p.principal_id = @id AND p.org_id = @orgId
    `);

  if (result.recordset.length === 0) {
    return notFound(res);
  }

  const principal = result.recordset[0];
  const identities = result.recordset.map((r: any) => ({ provider: r.provider, subject: r.subject }));

  ok(res, {
    ...principal,
    identities
  });
}));

export default router;
