import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { ContactSocialProfileCreate, ContactSocialProfileUpdate } from '../validation/schemas';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT id, contact_id, provider, profile_url, is_primary, created_utc, updated_utc FROM app.contact_social_profiles ORDER BY id DESC`);
  listOk(res, r.recordset, { page: 1, limit: r.recordset.length, total: r.recordset.length });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = ContactSocialProfileCreate.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const { contact_id, provider, profile_url, is_primary } = parsed.data;
  const pool = await getPool();
  const result = await pool.request()
    .input('contact_id', sql.BigInt, contact_id)
    .input('provider', sql.NVarChar(50), provider)
    .input('profile_url', sql.NVarChar(512), profile_url)
    .input('is_primary', sql.Bit, is_primary ?? false)
    .query(`INSERT INTO app.contact_social_profiles (contact_id, provider, profile_url, is_primary)
            OUTPUT INSERTED.id, INSERTED.contact_id, INSERTED.provider, INSERTED.profile_url, INSERTED.is_primary, INSERTED.created_utc, INSERTED.updated_utc
            VALUES (@contact_id, @provider, @profile_url, @is_primary)`);
  ok(res, result.recordset[0], 201);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
  const pool = await getPool();
  const r = await pool.request().input('id', sql.BigInt, id).query(`SELECT id, contact_id, provider, profile_url, is_primary, created_utc, updated_utc FROM app.contact_social_profiles WHERE id=@id`);
  const row = r.recordset[0]; if (!row) return notFound(res); ok(res, row);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
  const parsed = ContactSocialProfileUpdate.safeParse(req.body); if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
  const data = parsed.data; const sets: string[] = []; const pool = await getPool(); const request = pool.request().input('id', sql.BigInt, id);
  if (data.contact_id !== undefined) { sets.push('contact_id=@contact_id'); request.input('contact_id', sql.BigInt, data.contact_id); }
  if (data.provider !== undefined) { sets.push('provider=@provider'); request.input('provider', sql.NVarChar(50), data.provider); }
  if (data.profile_url !== undefined) { sets.push('profile_url=@profile_url'); request.input('profile_url', sql.NVarChar(512), data.profile_url); }
  if (data.is_primary !== undefined) { sets.push('is_primary=@is_primary'); request.input('is_primary', sql.Bit, data.is_primary); }
  if (!sets.length) return badRequest(res, 'No fields to update');
  const result = await request.query(`UPDATE app.contact_social_profiles SET ${sets.join(', ')} WHERE id=@id`);
  if (result.rowsAffected[0]===0) return notFound(res);
  const read = await pool.request().input('id', sql.BigInt, id).query(`SELECT id, contact_id, provider, profile_url, is_primary, created_utc, updated_utc FROM app.contact_social_profiles WHERE id=@id`);
  ok(res, read.recordset[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer'); const pool = await getPool(); const r = await pool.request().input('id', sql.BigInt, id).query(`DELETE FROM app.contact_social_profiles WHERE id=@id`); if (r.rowsAffected[0]===0) return notFound(res); ok(res, { deleted: r.rowsAffected[0] }); }));

export default router;
