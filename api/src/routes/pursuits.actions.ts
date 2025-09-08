import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok } from '../utils/http';
import { logActivity } from '../utils/activity';
import { assertTx, PURSUIT_TX, ensureSubmitChecklistPasses } from '../state/guards';

const router = Router();

// Helper function to check if checklist is complete
async function checkChecklistComplete(orgId: number, pursuitId: number, checklistType: 'pink' | 'red'): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('pursuitId', sql.BigInt, pursuitId)
    .input('checklistType', sql.VarChar(8), checklistType)
    .query(`
      SELECT COUNT(*) as total, SUM(CASE WHEN is_complete = 1 THEN 1 ELSE 0 END) as complete
      FROM app.pursuit_checklist
      WHERE org_id = @orgId AND pursuit_id = @pursuitId AND checklist_type = @checklistType
    `);

  const { total, complete } = result.recordset[0];
  return total > 0 && total === complete;
}

/**
 * @openapi
 * /api/pursuits/{id}/stage:
 *   post:
 *     summary: Change pursuit stage
 *     tags: [Pursuits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: false
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to]
 *             properties:
 *               to: { type: string, enum: [qual, pink, red, submit, won, lost] }
 *     responses:
 *       200:
 *         description: Stage changed
 */
// POST /pursuits/:id/stage
router.post('/:id/stage', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;
  const userId = null; // TODO: Add JWT middleware
  const id = Number(req.params.id);
  const to = req.body?.to;
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
  if (!to) return badRequest(res, 'to stage required');

  const pool = await getPool();
  const pResult = await pool.request().input('id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
    `SELECT pursuit_stage FROM app.pursuit WHERE pursuit_id = @id AND org_id = @orgId`
  );
  const p = pResult.recordset[0];
  if (!p) return badRequest(res, 'Pursuit not found');
  assertTx(PURSUIT_TX as any, p.pursuit_stage, to, 'pursuit transition');

  // Gate: entering submit requires checklist pass
  if (to === 'submit') {
    await ensureSubmitChecklistPasses(orgId, id, pool);
  }

  // Gate: entering won/lost requires checklist pass
  if (to === 'won' || to === 'lost') {
    const checklistComplete = await checkChecklistComplete(orgId, id, 'red');
    if (!checklistComplete) return badRequest(res, 'Red checklist must be complete before closing');
  }

  const tx = pool.transaction();
  await tx.begin();

  try {
    await tx.request().input('id', sql.BigInt, id).input('orgId', sql.Int, orgId).input('stage', sql.VarChar(8), to).query(
      `UPDATE app.pursuit SET pursuit_stage = @stage WHERE pursuit_id = @id AND org_id = @orgId`
    );

    await tx.request()
      .input('orgId', sql.Int, orgId)
      .input('item_type', sql.VarChar(12), 'pursuit')
      .input('item_id', sql.BigInt, id)
      .input('event_name', sql.VarChar(40), `pursuit.stage.${to}`)
      .input('actor_user_id', sql.Int, userId)
      .query(`
        INSERT INTO app.work_event (org_id, item_type, item_id, event_name, actor_user_id)
        VALUES (@orgId, @item_type, @item_id, @event_name, @actor_user_id)
      `);

    await tx.commit();
    await logActivity({ type: 'PursuitUpdated', title: `Pursuit ${id} staged to ${to}`, signal_id: id });
    ok(res, { ok: true, stage: to });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}));

/**
 * @openapi
 * /api/pursuits/{id}/submit:
 *   post:
 *     summary: Submit pursuit (send proposal)
 *     tags: [Pursuits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: false
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Submitted
 */
// POST /pursuits/:id/submit
router.post('/:id/submit', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;
  const userId = null;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');

  const pool = await getPool();
  const pResult = await pool.request().input('id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
    `SELECT pursuit_stage FROM app.pursuit WHERE pursuit_id = @id AND org_id = @orgId`
  );
  const p = pResult.recordset[0];
  if (!p) return badRequest(res, 'Pursuit not found');
  assertTx(PURSUIT_TX as any, p.pursuit_stage, 'submit', 'pursuit transition');

  // Ensure at least one proposal exists; create v1 if not.
  let vResult = await pool.request().input('pursuit_id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
    `SELECT TOP 1 proposal_id, version FROM app.proposal WHERE pursuit_id = @pursuit_id AND org_id = @orgId ORDER BY version DESC`
  );
  let v = vResult.recordset[0];
  if (!v) {
    const newVResult = await pool.request().input('pursuit_id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(`
      INSERT INTO app.proposal (org_id, pursuit_id, version, status)
      OUTPUT INSERTED.proposal_id, INSERTED.version
      VALUES (@orgId, @pursuit_id, 1, 'draft')
    `);
    v = newVResult.recordset[0];
  }

  const tx = pool.transaction();
  await tx.begin();

  try {
    await tx.request().input('proposal_id', sql.BigInt, v.proposal_id).input('orgId', sql.Int, orgId).query(
      `UPDATE app.proposal SET status = 'sent', sent_at = SYSUTCDATETIME() WHERE proposal_id = @proposal_id AND org_id = @orgId`
    );

    await tx.request().input('id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
      `UPDATE app.pursuit SET pursuit_stage = 'submit' WHERE pursuit_id = @id AND org_id = @orgId`
    );

    await tx.request()
      .input('orgId', sql.Int, orgId)
      .input('item_type', sql.VarChar(12), 'pursuit')
      .input('item_id', sql.BigInt, id)
      .input('event_name', sql.VarChar(40), 'pursuit.submit')
      .input('payload_json', sql.NVarChar(sql.MAX), JSON.stringify({ proposal_id: v.proposal_id }))
      .input('actor_user_id', sql.Int, userId)
      .query(`
        INSERT INTO app.work_event (org_id, item_type, item_id, event_name, payload_json, actor_user_id)
        VALUES (@orgId, @item_type, @item_id, @event_name, @payload_json, @actor_user_id)
      `);

    await tx.commit();
    await logActivity({ type: 'PursuitUpdated', title: `Pursuit ${id} submitted`, signal_id: id });
    ok(res, { ok: true, proposal_id: v.proposal_id });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}));

/**
 * @openapi
 * /api/pursuits/{id}/won:
 *   post:
 *     summary: Mark pursuit as won
 *     tags: [Pursuits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: false
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Marked as won
 */
// POST /pursuits/:id/won
router.post('/:id/won', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;
  const userId = null;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');

  const pool = await getPool();
  const sentResult = await pool.request().input('pursuit_id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
    `SELECT TOP 1 proposal_id FROM app.proposal WHERE pursuit_id = @pursuit_id AND org_id = @orgId AND status = 'sent' ORDER BY version DESC`
  );
  const sent = sentResult.recordset[0];
  if (!sent) return badRequest(res, 'Cannot mark won without a sent proposal');

  const tx = pool.transaction();
  await tx.begin();

  try {
    await tx.request().input('id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
      `UPDATE app.pursuit SET pursuit_stage = 'won' WHERE pursuit_id = @id AND org_id = @orgId`
    );

    await tx.request()
      .input('orgId', sql.Int, orgId)
      .input('item_type', sql.VarChar(12), 'pursuit')
      .input('item_id', sql.BigInt, id)
      .input('event_name', sql.VarChar(40), 'pursuit.won')
      .input('payload_json', sql.NVarChar(sql.MAX), JSON.stringify({ proposal_id: sent.proposal_id }))
      .input('actor_user_id', sql.Int, userId)
      .query(`
        INSERT INTO app.work_event (org_id, item_type, item_id, event_name, payload_json, actor_user_id)
        VALUES (@orgId, @item_type, @item_id, @event_name, @payload_json, @actor_user_id)
      `);

    await tx.commit();
    await logActivity({ type: 'PursuitUpdated', title: `Pursuit ${id} won`, signal_id: id });
    ok(res, { ok: true });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}));

/**
 * @openapi
 * /api/pursuits/{id}/lost:
 *   post:
 *     summary: Mark pursuit as lost
 *     tags: [Pursuits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: false
 *         schema: { type: integer }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Marked as lost
 */
// POST /pursuits/:id/lost
router.post('/:id/lost', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;
  const userId = null;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');

  const pool = await getPool();
  const tx = pool.transaction();
  await tx.begin();

  try {
    await tx.request().input('id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
      `UPDATE app.pursuit SET pursuit_stage = 'lost' WHERE pursuit_id = @id AND org_id = @orgId`
    );

    await tx.request()
      .input('orgId', sql.Int, orgId)
      .input('item_type', sql.VarChar(12), 'pursuit')
      .input('item_id', sql.BigInt, id)
      .input('event_name', sql.VarChar(40), 'pursuit.lost')
      .input('payload_json', sql.NVarChar(sql.MAX), JSON.stringify({ reason: req.body?.reason }))
      .input('actor_user_id', sql.Int, userId)
      .query(`
        INSERT INTO app.work_event (org_id, item_type, item_id, event_name, payload_json, actor_user_id)
        VALUES (@orgId, @item_type, @item_id, @event_name, @payload_json, @actor_user_id)
      `);

    await tx.commit();
    await logActivity({ type: 'PursuitUpdated', title: `Pursuit ${id} lost`, signal_id: id });
    ok(res, { ok: true });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}));

/**
 * @openapi
 * /api/pursuits/{id}/proposals:
 *   post:
 *     summary: Create new proposal version
 *     tags: [Pursuits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: false
 *         schema: { type: integer }
 *     responses:
 *       201:
 *         description: Proposal created
 */
// POST /pursuits/:id/proposals
router.post('/:id/proposals', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');

  const pool = await getPool();
  const latestResult = await pool.request().input('pursuit_id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
    `SELECT TOP 1 version FROM app.proposal WHERE pursuit_id = @pursuit_id AND org_id = @orgId ORDER BY version DESC`
  );
  const latest = latestResult.recordset[0];
  const version = (latest?.version ?? 0) + 1;

  try {
    const pResult = await pool.request().input('pursuit_id', sql.BigInt, id).input('orgId', sql.Int, orgId).input('version', sql.Int, version).query(`
      INSERT INTO app.proposal (org_id, pursuit_id, version, status)
      OUTPUT INSERTED.proposal_id, INSERTED.org_id, INSERTED.pursuit_id, INSERTED.version, INSERTED.status
      VALUES (@orgId, @pursuit_id, @version, 'draft')
    `);
    const p = pResult.recordset[0];
    await logActivity({ type: 'PursuitUpdated', title: `Proposal v${version} created for pursuit ${id}`, signal_id: id });
    ok(res, p, 201);
  } catch (err: any) {
    // Handle unique constraint violation for v1 as success
    if (err.number === 2627 && version === 1) {
      // Try to find existing v1 proposal
      try {
        const existing = await pool.request().input('pursuit_id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
          `SELECT proposal_id, org_id, pursuit_id, version, status FROM app.proposal WHERE pursuit_id = @pursuit_id AND org_id = @orgId AND version = 1`
        );
        if (existing.recordset.length > 0) {
          ok(res, existing.recordset[0], 200);
          return;
        }
      } catch (e) {
        // Ignore
      }
    }
    throw err;
  }
}));

/**
 * @openapi
 * /api/pursuits/proposals/{id}/send:
 *   post:
 *     summary: Send proposal
 *     tags: [Pursuits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: false
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Sent
 */
// POST /proposals/:id/send
router.post('/proposals/:id/send', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;
  const userId = null;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');

  const pool = await getPool();
  await pool.request().input('id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
    `UPDATE app.proposal SET status = 'sent', sent_at = SYSUTCDATETIME() WHERE proposal_id = @id AND org_id = @orgId`
  );

  const pursuitIdResult = await pool.request().input('id', sql.BigInt, id).input('orgId', sql.Int, orgId).query(
    `SELECT pursuit_id FROM app.proposal WHERE proposal_id = @id AND org_id = @orgId`
  );
  const pursuitId = pursuitIdResult.recordset[0]?.pursuit_id;

  if (pursuitId) {
    await pool.request()
      .input('orgId', sql.Int, orgId)
      .input('item_type', sql.VarChar(12), 'pursuit')
      .input('item_id', sql.BigInt, pursuitId)
      .input('event_name', sql.VarChar(40), 'proposal.sent')
      .input('payload_json', sql.NVarChar(sql.MAX), JSON.stringify({ proposal_id: id }))
      .input('actor_user_id', sql.Int, userId)
      .query(`
        INSERT INTO app.work_event (org_id, item_type, item_id, event_name, payload_json, actor_user_id)
        VALUES (@orgId, @item_type, @item_id, @event_name, @payload_json, @actor_user_id)
      `);
  }

  await logActivity({ type: 'PursuitUpdated', title: `Proposal ${id} sent`, signal_id: pursuitId });
  ok(res, { ok: true });
}));

export default router;
