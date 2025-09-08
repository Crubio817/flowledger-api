import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, ok, badRequest, notFound } from '../utils/http';
import {
  assertAutomationRuleTx,
  checkThrottle,
  validateActionPermissions,
  evaluateCondition,
  generateIdempotencyKey,
  isEventDuplicate
} from '../state/automation-guards';
import { logActivity } from '../utils/activity';

const router = Router();

// GET /api/automation/rules - List automation rules
router.get('/rules', asyncHandler(async (req, res) => {
  const { org_id } = req.query;
  if (!org_id) return badRequest(res, 'org_id is required');

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, org_id)
    .query(`
      SELECT rule_id, name, is_enabled, trigger_json, conditions_json,
             throttle_per, throttle_limit, actions_json, created_by, updated_at
      FROM app.automation_rule
      WHERE tenant_id = @orgId
      ORDER BY updated_at DESC
    `);

  ok(res, result.recordset);
}));

// POST /api/automation/rules - Create automation rule
router.post('/rules', asyncHandler(async (req, res) => {
  const { org_id, name, trigger, conditions, throttle, actions } = req.body;
  if (!org_id || !name || !trigger || !actions) {
    return badRequest(res, 'org_id, name, trigger, and actions are required');
  }

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, org_id)
    .input('name', sql.NVarChar, name)
    .input('trigger', sql.NVarChar, JSON.stringify(trigger))
    .input('conditions', sql.NVarChar, conditions ? JSON.stringify(conditions) : null)
    .input('throttlePer', sql.VarChar, throttle?.per || null)
    .input('throttleLimit', sql.Int, throttle?.limit || null)
    .input('actions', sql.NVarChar, JSON.stringify(actions))
    .input('createdBy', sql.BigInt, (req as any).user?.id || null)
    .query(`
      INSERT INTO app.automation_rule (
        tenant_id, name, trigger_json, conditions_json,
        throttle_per, throttle_limit, actions_json, created_by
      )
      OUTPUT INSERTED.rule_id, INSERTED.name, INSERTED.is_enabled,
             INSERTED.trigger_json, INSERTED.conditions_json,
             INSERTED.throttle_per, INSERTED.throttle_limit,
             INSERTED.actions_json, INSERTED.created_at
      VALUES (
        @orgId, @name, @trigger, @conditions,
        @throttlePer, @throttleLimit, @actions, @createdBy
      )
    `);

  await logActivity({
    type: 'AutomationRuleCreated',
    title: `Rule created: ${name}`,
    rule_id: result.recordset[0].rule_id
  });

  ok(res, result.recordset[0], 201);
}));

// PATCH /api/automation/rules/:id - Update automation rule
router.patch('/rules/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { org_id, name, is_enabled, trigger, conditions, throttle, actions } = req.body;

  if (!org_id) return badRequest(res, 'org_id is required');

  const pool = await getPool();

  // Get current rule for state transition validation
  const current = await pool.request()
    .input('ruleId', sql.BigInt, id)
    .input('orgId', sql.Int, org_id)
    .query(`
      SELECT is_enabled FROM app.automation_rule
      WHERE rule_id = @ruleId AND tenant_id = @orgId
    `);

  if (current.recordset.length === 0) return notFound(res, 'Rule not found');

  // Validate state transition if is_enabled is being changed
  if (is_enabled !== undefined) {
    const currentState = current.recordset[0].is_enabled ? 'active' : 'disabled';
    const newState = is_enabled ? 'active' : 'disabled';
    assertAutomationRuleTx(currentState, newState, parseInt(id));
  }

  const result = await pool.request()
    .input('ruleId', sql.BigInt, id)
    .input('orgId', sql.Int, org_id)
    .input('name', sql.NVarChar, name)
    .input('isEnabled', sql.Bit, is_enabled)
    .input('trigger', sql.NVarChar, trigger ? JSON.stringify(trigger) : null)
    .input('conditions', sql.NVarChar, conditions ? JSON.stringify(conditions) : null)
    .input('throttlePer', sql.VarChar, throttle?.per || null)
    .input('throttleLimit', sql.Int, throttle?.limit || null)
    .input('actions', sql.NVarChar, actions ? JSON.stringify(actions) : null)
    .query(`
      UPDATE app.automation_rule
      SET name = ISNULL(@name, name),
          is_enabled = ISNULL(@isEnabled, is_enabled),
          trigger_json = ISNULL(@trigger, trigger_json),
          conditions_json = ISNULL(@conditions, conditions_json),
          throttle_per = ISNULL(@throttlePer, throttle_per),
          throttle_limit = ISNULL(@throttleLimit, throttle_limit),
          actions_json = ISNULL(@actions, actions_json),
          updated_at = SYSUTCDATETIME()
      OUTPUT INSERTED.rule_id, INSERTED.name, INSERTED.is_enabled,
             INSERTED.trigger_json, INSERTED.conditions_json,
             INSERTED.throttle_per, INSERTED.throttle_limit,
             INSERTED.actions_json, INSERTED.updated_at
      WHERE rule_id = @ruleId AND tenant_id = @orgId
    `);

  if (result.recordset.length === 0) return notFound(res, 'Rule not found');

  await logActivity({
    type: 'AutomationRuleUpdated',
    title: `Rule updated: ${result.recordset[0].name}`,
    rule_id: parseInt(id)
  });

  ok(res, result.recordset[0]);
}));

// DELETE /api/automation/rules/:id - Delete automation rule
router.delete('/rules/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { org_id } = req.body;

  if (!org_id) return badRequest(res, 'org_id is required');

  const pool = await getPool();
  const result = await pool.request()
    .input('ruleId', sql.BigInt, id)
    .input('orgId', sql.Int, org_id)
    .query(`
      DELETE FROM app.automation_rule
      OUTPUT DELETED.rule_id, DELETED.name
      WHERE rule_id = @ruleId AND tenant_id = @orgId
    `);

  if (result.recordset.length === 0) return notFound(res, 'Rule not found');

  await logActivity({
    type: 'AutomationRuleDeleted',
    title: `Rule deleted: ${result.recordset[0].name}`,
    rule_id: parseInt(id)
  });

  ok(res, { deleted: true });
}));

// POST /api/automation/test - Test rule against sample event
router.post('/test', asyncHandler(async (req, res) => {
  const { org_id, rule, sample_event } = req.body;

  if (!org_id || !rule || !sample_event) {
    return badRequest(res, 'org_id, rule, and sample_event are required');
  }

  try {
    // Parse rule components
    const trigger = typeof rule.trigger === 'string' ? JSON.parse(rule.trigger) : rule.trigger;
    const conditions = rule.conditions ? (typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions) : null;
    const actions = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions;

    // Check if event matches trigger
    const eventMatches = trigger.event_types?.includes(sample_event.type) ||
                        trigger.event_types?.includes('*') ||
                        sample_event.type?.match(new RegExp(trigger.event_types?.join('|').replace(/\*/g, '.*') || ''));

    if (!eventMatches) {
      return ok(res, { matches: false, reason: 'Event type does not match trigger' });
    }

    // Evaluate conditions
    const conditionsPass = !conditions || evaluateCondition(conditions, sample_event);

    if (!conditionsPass) {
      return ok(res, { matches: false, reason: 'Conditions not satisfied' });
    }

    // Check throttle (mock)
    const throttleOk = !rule.throttle || await checkThrottle(0, org_id, rule.throttle.per, rule.throttle.limit);

    if (!throttleOk) {
      return ok(res, { matches: false, reason: 'Throttle limit exceeded' });
    }

    ok(res, {
      matches: true,
      actions: actions,
      evaluation: {
        trigger_matched: true,
        conditions_passed: true,
        throttle_ok: true
      }
    });

  } catch (error) {
    badRequest(res, `Test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}));

// GET /api/automation/logs - Get automation execution logs
router.get('/logs', asyncHandler(async (req, res) => {
  const { org_id, rule_id, event_id, status, limit = 50, offset = 0 } = req.query;

  if (!org_id) return badRequest(res, 'org_id is required');

  const pool = await getPool();
  let query = `
    SELECT l.log_id, l.event_id, l.rule_id, l.outcome, l.started_at,
           l.finished_at, l.metrics_json, l.error_message, l.created_at,
           r.name as rule_name
    FROM app.automation_log l
    LEFT JOIN app.automation_rule r ON l.rule_id = r.rule_id
    WHERE r.tenant_id = @orgId
  `;

  const params: any[] = [];
  params.push({ name: 'orgId', type: sql.Int, value: org_id });

  if (rule_id) {
    query += ' AND l.rule_id = @ruleId';
    params.push({ name: 'ruleId', type: sql.BigInt, value: rule_id });
  }

  if (event_id) {
    query += ' AND l.event_id = @eventId';
    params.push({ name: 'eventId', type: sql.VarChar, value: event_id });
  }

  if (status) {
    query += ' AND l.outcome = @status';
    params.push({ name: 'status', type: sql.VarChar, value: status });
  }

  query += ' ORDER BY l.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';

  params.push({ name: 'offset', type: sql.Int, value: offset });
  params.push({ name: 'limit', type: sql.Int, value: limit });

  const request = pool.request();
  params.forEach(param => request.input(param.name, param.type, param.value));

  const result = await request.query(query);
  ok(res, result.recordset);
}));

// POST /api/automation/events - Ingest event (internal)
router.post('/events', asyncHandler(async (req, res) => {
  const { type, tenant_id, aggregate_type, aggregate_id, payload, source, correlation_id, dedupe_key } = req.body;

  if (!type || !tenant_id || !source) {
    return badRequest(res, 'type, tenant_id, and source are required');
  }

  // Check for duplicates
  if (dedupe_key && await isEventDuplicate(tenant_id, dedupe_key)) {
    return ok(res, { event_id: null, duplicate: true });
  }

  const pool = await getPool();
  const result = await pool.request()
    .input('type', sql.VarChar, type)
    .input('tenantId', sql.Int, tenant_id)
    .input('aggregateType', sql.VarChar, aggregate_type)
    .input('aggregateId', sql.BigInt, aggregate_id)
    .input('payload', sql.NVarChar, payload ? JSON.stringify(payload) : null)
    .input('source', sql.VarChar, source)
    .input('correlationId', sql.VarChar, correlation_id)
    .input('dedupeKey', sql.VarChar, dedupe_key)
    .query(`
      INSERT INTO app.automation_event (
        type, tenant_id, aggregate_type, aggregate_id,
        payload_json, source, correlation_id, dedupe_key
      )
      OUTPUT INSERTED.event_id
      VALUES (
        @type, @tenantId, @aggregateType, @aggregateId,
        @payload, @source, @correlationId, @dedupeKey
      )
    `);

  ok(res, { event_id: result.recordset[0].event_id, ingested: true });
}));

export default router;
