import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { logActivity } from '../utils/activity';
import { engagementMemory } from '../utils/memory';
import {
  assertTx,
  ENGAGEMENT_TX,
  FEATURE_TX,
  STORY_TASK_TX,
  AUDIT_STEP_TX,
  JOB_TASK_TX,
  MILESTONE_TX,
  CHANGE_REQUEST_TX,
  ensureEngagementAccess,
  ensureFeatureAccess,
  detectDependencyCycle
} from '../state/engagements-guards';

// Simple outbox event emitter
async function emitOutboxEvent(eventName: string, payload: any) {
  const pool = await getPool();
  await pool.request()
    .input('eventName', sql.VarChar(40), eventName)
    .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .query(`
      INSERT INTO app.work_event (event_name, payload_json, item_type, item_id, org_id)
      VALUES (@eventName, @payload, 'engagement', @payload.engagement_id || 0, @payload.org_id || 0)
    `);
}

const router = Router();

/**
 * @openapi
 * /api/engagements:
 *   get:
 *     summary: List engagements
 *     tags: [Engagements]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [project, audit, job] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, on_hold, completed, cancelled] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Engagement list
 */
// GET /engagements - List engagements with filtering
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = require('../utils/http').getPagination(req);
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const type = req.query.type as string;
  const status = req.query.status as string;

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  let query = `
    SELECT
      e.engagement_id as id,
      e.client_id,
      e.type,
      e.name,
      e.owner_id,
      e.status,
      e.health,
      e.start_at,
      e.due_at,
      e.contract_id,
      e.created_at,
      c.name as client_name,
      -- Progress calculation
      CASE
        WHEN e.type = 'project' THEN (
          SELECT CAST(SUM(CASE WHEN f.state = 'done' THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0)
          FROM app.feature f WHERE f.engagement_id = e.engagement_id AND f.org_id = e.org_id
        )
        WHEN e.type = 'audit' THEN (
          SELECT CAST(SUM(CASE WHEN s.state = 'done' THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0)
          FROM app.audit_step s
          JOIN app.audit_path p ON s.audit_path_id = p.audit_path_id
          WHERE p.engagement_id = e.engagement_id AND s.org_id = e.org_id
        )
        WHEN e.type = 'job' THEN (
          SELECT CAST(SUM(CASE WHEN t.state = 'done' THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0)
          FROM app.job_task t WHERE t.engagement_id = e.engagement_id AND t.org_id = e.org_id
        )
        ELSE 0
      END as progress_pct
    FROM app.engagement e
    JOIN app.clients c ON e.client_id = c.client_id AND e.org_id = c.org_id
    WHERE e.org_id = @orgId
  `;

  const request = pool.request().input('orgId', sql.Int, orgId);
  if (type) {
    query += ' AND e.type = @type';
    request.input('type', sql.VarChar(10), type);
  }
  if (status) {
    query += ' AND e.status = @status';
    request.input('status', sql.VarChar(12), status);
  }

  query += ' ORDER BY e.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
  request.input('offset', sql.Int, offset).input('limit', sql.Int, limit);

  const result = await request.query(query);
  listOk(res, result.recordset, { page, limit });
}));

/**
 * @openapi
 * /api/engagements:
 *   post:
 *     summary: Create engagement
 *     tags: [Engagements]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [org_id, client_id, type, name, owner_id, start_at]
 *             properties:
 *               org_id: { type: integer }
 *               client_id: { type: integer }
 *               type: { type: string, enum: [project, audit, job] }
 *               name: { type: string }
 *               owner_id: { type: integer }
 *               start_at: { type: string, format: date-time }
 *               due_at: { type: string, format: date-time }
 *               contract_id: { type: integer }
 *     responses:
 *       201:
 *         description: Engagement created
 */
// POST /engagements - Create engagement
router.post('/', asyncHandler(async (req, res) => {
  const { org_id, client_id, type, name, owner_id, start_at, due_at, contract_id } = req.body;

  if (!org_id || !client_id || !type || !name || !owner_id || !start_at) {
    return badRequest(res, 'org_id, client_id, type, name, owner_id, start_at required');
  }

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, org_id)
    .input('clientId', sql.BigInt, client_id)
    .input('type', sql.VarChar(10), type)
    .input('name', sql.NVarChar(200), name)
    .input('ownerId', sql.BigInt, owner_id)
    .input('startAt', sql.DateTime2, start_at)
    .input('dueAt', sql.DateTime2, due_at)
    .input('contractId', sql.BigInt, contract_id)
    .query(`
      INSERT INTO app.engagement (org_id, client_id, type, name, owner_id, status, health, start_at, due_at, contract_id)
      OUTPUT INSERTED.*
      VALUES (@orgId, @clientId, @type, @name, @ownerId, 'active', 'green', @startAt, @dueAt, @contractId)
    `);

  const created = result.recordset[0];
  // await logActivity({
  //   type: 'EngagementCreated',
  //   title: `${type} engagement created: ${name}`,
  //   engagement_id: created.engagement_id
  // });

  // Capture memory atom for engagement creation
  await engagementMemory.created(org_id, created.engagement_id, name, type);

  ok(res, created, 201);
}));

/**
 * @openapi
 * /api/engagements/{id}:
 *   patch:
 *     summary: Update engagement status
 *     tags: [Engagements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [active, on_hold, completed, cancelled] }
 *     responses:
 *       200:
 *         description: Status updated
 */
// PATCH /engagements/:id - Update engagement status
router.patch('/:id', asyncHandler(async (req, res) => {
  const engagementId = Number(req.params.id);
  const { status } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!status) return badRequest(res, 'status required');

  const pool = await getPool();
  await ensureEngagementAccess(orgId, engagementId, pool);

  // Get current status
  const currentResult = await pool.request()
    .input('engagementId', sql.BigInt, engagementId)
    .input('orgId', sql.Int, orgId)
    .query('SELECT status FROM app.engagement WHERE engagement_id = @engagementId AND org_id = @orgId');

  const currentStatus = currentResult.recordset[0]?.status;
  if (!currentStatus) return notFound(res);

  assertTx(ENGAGEMENT_TX, currentStatus, status, 'engagement status');

  await pool.request()
    .input('engagementId', sql.BigInt, engagementId)
    .input('status', sql.VarChar(12), status)
    .query('UPDATE app.engagement SET status = @status, updated_at = SYSUTCDATETIME() WHERE engagement_id = @engagementId AND org_id = @orgId');

  ok(res, { engagement_id: engagementId, status });
}));

/**
 * @openapi
 * /api/engagements/{id}/features:
 *   post:
 *     summary: Create feature
 *     tags: [Engagements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               priority: { type: string, enum: [low, medium, high, critical] }
 *               due_at: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Feature created
 */
// POST /engagements/:id/features - Create feature
router.post('/:id/features', asyncHandler(async (req, res) => {
  const engagementId = Number(req.params.id);
  const { title, priority, due_at } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!title) return badRequest(res, 'title required');

  const pool = await getPool();
  await ensureEngagementAccess(orgId, engagementId, pool);

  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('engagementId', sql.BigInt, engagementId)
    .input('title', sql.NVarChar(200), title)
    .input('priority', sql.VarChar(12), priority || 'medium')
    .input('dueAt', sql.DateTime2, due_at)
    .query(`
      INSERT INTO app.feature (org_id, engagement_id, title, priority, state, due_at)
      OUTPUT INSERTED.*
      VALUES (@orgId, @engagementId, @title, @priority, 'todo', @dueAt)
    `);

  ok(res, result.recordset[0], 201);
}));

/**
 * @openapi
 * /api/engagements/{id}/features/{featureId}:
 *   patch:
 *     summary: Update feature state
 *     tags: [Engagements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: featureId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [state]
 *             properties:
 *               state: { type: string, enum: [todo, in_progress, done] }
 *     responses:
 *       200:
 *         description: Feature updated
 */
// PATCH /engagements/:id/features/:featureId - Update feature state
router.patch('/:id/features/:featureId', asyncHandler(async (req, res) => {
  const engagementId = Number(req.params.id);
  const featureId = Number(req.params.featureId);
  const { state } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!state) return badRequest(res, 'state required');

  const pool = await getPool();
  await ensureEngagementAccess(orgId, engagementId, pool);
  await ensureFeatureAccess(orgId, featureId, pool);

  // Get current state
  const currentResult = await pool.request()
    .input('featureId', sql.BigInt, featureId)
    .query('SELECT state FROM app.feature WHERE feature_id = @featureId');

  const currentState = currentResult.recordset[0]?.state;
  if (!currentState) return notFound(res);

  assertTx(FEATURE_TX, currentState, state, 'feature state');

  await pool.request()
    .input('featureId', sql.BigInt, featureId)
    .input('state', sql.VarChar(12), state)
    .query('UPDATE app.feature SET state = @state, updated_at = SYSUTCDATETIME() WHERE feature_id = @featureId');

  // Emit revenue event if feature completed and has billing
  if (state === 'done') {
    await emitOutboxEvent('feature.completed', { org_id: orgId, engagement_id: engagementId, feature_id: featureId });
  }

  ok(res, { feature_id: featureId, state });
}));

/**
 * @openapi
 * /api/engagements/{id}/milestones:
 *   post:
 *     summary: Create milestone
 *     tags: [Engagements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, due_at]
 *             properties:
 *               name: { type: string }
 *               type: { type: string }
 *               due_at: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Milestone created
 */
// POST /engagements/:id/milestones - Create milestone
router.post('/:id/milestones', asyncHandler(async (req, res) => {
  const engagementId = Number(req.params.id);
  const { name, type, due_at } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!name || !type || !due_at) return badRequest(res, 'name, type, due_at required');

  const pool = await getPool();
  await ensureEngagementAccess(orgId, engagementId, pool);

  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('engagementId', sql.BigInt, engagementId)
    .input('name', sql.NVarChar(200), name)
    .input('type', sql.VarChar(16), type)
    .input('dueAt', sql.DateTime2, due_at)
    .query(`
      INSERT INTO app.milestone (org_id, engagement_id, name, type, status, due_at)
      OUTPUT INSERTED.*
      VALUES (@orgId, @engagementId, @name, @type, 'planned', @dueAt)
    `);

  ok(res, result.recordset[0], 201);
}));

/**
 * @openapi
 * /api/engagements/{id}/dependencies:
 *   post:
 *     summary: Create dependency
 *     tags: [Engagements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [from_type, from_id, to_type, to_id, dep_type]
 *             properties:
 *               from_type: { type: string }
 *               from_id: { type: integer }
 *               to_type: { type: string }
 *               to_id: { type: integer }
 *               dep_type: { type: string, enum: [FS, SS, FF, SF] }
 *               lag_days: { type: integer }
 *     responses:
 *       201:
 *         description: Dependency created
 */
// POST /engagements/:id/dependencies - Create dependency
router.post('/:id/dependencies', asyncHandler(async (req, res) => {
  const engagementId = Number(req.params.id);
  const { from_type, from_id, to_type, to_id, dep_type, lag_days } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!from_type || !from_id || !to_type || !to_id || !dep_type) {
    return badRequest(res, 'from_type, from_id, to_type, to_id, dep_type required');
  }

  const pool = await getPool();
  await ensureEngagementAccess(orgId, engagementId, pool);

  // Check for cycles
  const hasCycle = await detectDependencyCycle(orgId, from_type, from_id, to_type, to_id, pool);
  if (hasCycle) {
    return badRequest(res, 'Dependency would create a cycle');
  }

  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('fromType', sql.VarChar(16), from_type)
    .input('fromId', sql.BigInt, from_id)
    .input('toType', sql.VarChar(16), to_type)
    .input('toId', sql.BigInt, to_id)
    .input('depType', sql.Char(2), dep_type)
    .input('lagDays', sql.Int, lag_days || 0)
    .query(`
      INSERT INTO app.dependency (org_id, from_type, from_id, to_type, to_id, dep_type, lag_days)
      OUTPUT INSERTED.*
      VALUES (@orgId, @fromType, @fromId, @toType, @toId, @depType, @lagDays)
    `);

  ok(res, result.recordset[0], 201);
}));

/**
 * @openapi
 * /api/engagements/{id}/change-requests:
 *   post:
 *     summary: Create change request
 *     tags: [Engagements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [origin]
 *             properties:
 *               origin: { type: string, enum: [client, internal] }
 *               scope_delta: { type: string }
 *               hours_delta: { type: number }
 *               value_delta: { type: number }
 *     responses:
 *       201:
 *         description: Change request created
 */
// POST /engagements/:id/change-requests - Create change request
router.post('/:id/change-requests', asyncHandler(async (req, res) => {
  const engagementId = Number(req.params.id);
  const { origin, scope_delta, hours_delta, value_delta } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const userId = req.query.user_id ? Number(req.query.user_id) : 1; // Default for now

  if (!orgId) return badRequest(res, 'org_id required');
  if (!origin) return badRequest(res, 'origin required');

  const pool = await getPool();
  await ensureEngagementAccess(orgId, engagementId, pool);

  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('engagementId', sql.BigInt, engagementId)
    .input('origin', sql.VarChar(10), origin)
    .input('scopeDelta', sql.NVarChar(sql.MAX), scope_delta)
    .input('hoursDelta', sql.Decimal(18,2), hours_delta)
    .input('valueDelta', sql.Decimal(18,2), value_delta)
    .input('createdBy', sql.BigInt, userId)
    .query(`
      INSERT INTO app.change_request (org_id, engagement_id, origin, scope_delta, hours_delta, value_delta, status, created_by)
      OUTPUT INSERTED.*
      VALUES (@orgId, @engagementId, @origin, @scopeDelta, @hoursDelta, @valueDelta, 'draft', @createdBy)
    `);

  ok(res, result.recordset[0], 201);
}));

/**
 * @openapi
 * /api/engagements/{id}/change-requests/{crId}:
 *   patch:
 *     summary: Update change request status
 *     tags: [Engagements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: crId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [draft, submitted, approved, rejected] }
 *     responses:
 *       200:
 *         description: Change request updated
 */
// PATCH /engagements/:id/change-requests/:crId - Update change request status
router.patch('/:id/change-requests/:crId', asyncHandler(async (req, res) => {
  const engagementId = Number(req.params.id);
  const crId = Number(req.params.crId);
  const { status } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!status) return badRequest(res, 'status required');

  const pool = await getPool();
  await ensureEngagementAccess(orgId, engagementId, pool);

  // Get current status
  const currentResult = await pool.request()
    .input('crId', sql.BigInt, crId)
    .input('orgId', sql.Int, orgId)
    .query('SELECT status FROM app.change_request WHERE change_request_id = @crId AND org_id = @orgId');

  const currentStatus = currentResult.recordset[0]?.status;
  if (!currentStatus) return notFound(res);

  assertTx(CHANGE_REQUEST_TX, currentStatus, status, 'change request status');

  await pool.request()
    .input('crId', sql.BigInt, crId)
    .input('status', sql.VarChar(12), status)
    .input('decidedAt', sql.DateTime2, status !== 'draft' ? new Date() : null)
    .query('UPDATE app.change_request SET status = @status, decided_at = @decidedAt WHERE change_request_id = @crId AND org_id = @orgId');

  await emitOutboxEvent('change_request.updated', { org_id: orgId, engagement_id: engagementId, change_request_id: crId, status });

  ok(res, { change_request_id: crId, status });
}));

export default router;
