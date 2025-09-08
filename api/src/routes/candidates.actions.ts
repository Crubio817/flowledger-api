import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok } from '../utils/http';
import { logActivity } from '../utils/activity';
import { assertTx, CANDIDATE_TX } from '../state/guards';

const router = Router();

// POST /candidates/:id/promote
router.post('/:id/promote', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1; // Default to 1 if not provided
  const userId = null; // TODO: Add JWT middleware to set req.user
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');

  const pool = await getPool();
  const candResult = await pool.request().input('id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
    `SELECT status FROM app.candidate WHERE candidate_id = @id AND org_id = @orgId`
  );
  const cand = candResult.recordset[0];
  if (!cand) return badRequest(res, 'Candidate not found');
  assertTx(CANDIDATE_TX as any, cand.status, 'promoted', 'candidate transition');

  const tx = pool.transaction();
  await tx.begin();

  try {
    // Check if pursuit already exists (idempotency)
    const existingPursuit = await tx.request().input('candidate_id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
      `SELECT pursuit_id FROM app.pursuit WHERE candidate_id = @candidate_id AND org_id = @orgId`
    );

    let pursuit;
    if (existingPursuit.recordset.length > 0) {
      // Pursuit already exists, return it
      pursuit = { pursuit_id: existingPursuit.recordset[0].pursuit_id };
    } else {
      // Create new pursuit
      const pursuitResult = await tx.request().input('candidate_id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(`
        INSERT INTO app.pursuit (org_id, candidate_id, pursuit_stage)
        OUTPUT INSERTED.pursuit_id
        VALUES (@orgId, @candidate_id, 'qual')
      `);
      pursuit = pursuitResult.recordset[0];
    }

    await tx.request().input('id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
      `UPDATE app.candidate SET status = 'promoted', last_touch_at = SYSUTCDATETIME() WHERE candidate_id = @id AND org_id = @orgId`
    );

    await tx.request()
      .input('orgId', sql.Int, orgId)
      .input('item_type', sql.VarChar(12), 'candidate')
      .input('item_id', sql.BigInt, id)
      .input('event_name', sql.VarChar(40), 'candidate.promoted')
      .input('payload_json', sql.NVarChar(sql.MAX), JSON.stringify({ pursuit_id: pursuit.pursuit_id }))
      .input('actor_user_id', sql.Int, userId || null)
      .query(`
        INSERT INTO app.work_event (org_id, item_type, item_id, event_name, payload_json, actor_user_id)
        VALUES (@orgId, @item_type, @item_id, @event_name, @payload_json, @actor_user_id)
      `);

    await tx.request()
      .input('orgId', sql.Int, orgId)
      .input('item_type', sql.VarChar(12), 'pursuit')
      .input('item_id', sql.BigInt, pursuit.pursuit_id)
      .input('event_name', sql.VarChar(40), 'pursuit.created')
      .input('actor_user_id', sql.Int, userId || null)
      .query(`
        INSERT INTO app.work_event (org_id, item_type, item_id, event_name, actor_user_id)
        VALUES (@orgId, @item_type, @item_id, @event_name, @actor_user_id)
      `);

    await tx.commit();
    await logActivity({ type: 'CandidateUpdated', title: `Candidate ${id} promoted`, client_id: null, signal_id: id });
    ok(res, { pursuit_id: pursuit.pursuit_id }, 201);
  } catch (err: any) {
    await tx.rollback();
    // Handle unique constraint violation as success
    if (err.number === 2627 || err.code === 'EREQUEST') {
      // Try to find existing pursuit
      try {
        const existing = await pool.request().input('candidate_id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
          `SELECT pursuit_id FROM app.pursuit WHERE candidate_id = @candidate_id AND org_id = @orgId`
        );
        if (existing.recordset.length > 0) {
          ok(res, { pursuit_id: existing.recordset[0].pursuit_id }, 200);
          return;
        }
      } catch (e) {
        // Ignore
      }
    }
    throw err;
  }
}));

export default router;
