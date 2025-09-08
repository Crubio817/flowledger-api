import { getPool, sql } from '../db/pool';
import { evaluateCondition, checkThrottle, validateActionPermissions, generateIdempotencyKey } from '../state/automation-guards';
import { logActivity } from '../utils/activity';

export async function processAutomationEvents() {
  const pool = await getPool();
  const workerId = `automation-worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Get unprocessed automation events
  const events = await pool.request()
    .query(`
      SELECT e.event_id, e.type, e.tenant_id, e.aggregate_type, e.aggregate_id,
             e.payload_json, e.source, e.correlation_id, e.dedupe_key, e.occurred_at
      FROM app.automation_event e
      WHERE NOT EXISTS (
        SELECT 1 FROM app.automation_log l
        WHERE l.event_id = e.event_id AND l.outcome = 'processed'
      )
      ORDER BY e.occurred_at ASC
    `);

  for (const event of events.recordset) {
    try {
      await processAutomationEvent(event, workerId);
    } catch (error) {
      console.error(`Failed to process automation event ${event.event_id}:`, error);
    }
  }
}

async function processAutomationEvent(event: any, workerId: string) {
  const pool = await getPool();
  const payload = event.payload_json ? JSON.parse(event.payload_json) : {};

  // Find matching rules
  const rules = await pool.request()
    .input('tenantId', sql.Int, event.tenant_id)
    .query(`
      SELECT rule_id, name, trigger_json, conditions_json, throttle_per, throttle_limit, actions_json
      FROM app.automation_rule
      WHERE tenant_id = @tenantId AND is_enabled = 1
    `);

  for (const rule of rules.recordset) {
    try {
      const trigger = JSON.parse(rule.trigger_json);
      const conditions = rule.conditions_json ? JSON.parse(rule.conditions_json) : null;
      const actions = JSON.parse(rule.actions_json);

      // Check if event matches trigger
      if (!matchesTrigger(event, trigger)) continue;

      // Evaluate conditions
      if (conditions && !evaluateCondition(conditions, { ...event, payload })) continue;

      // Check throttle
      if (rule.throttle_per && !(await checkThrottle(rule.rule_id, event.tenant_id, rule.throttle_per, rule.throttle_limit))) {
        await logAutomationOutcome(event.event_id, rule.rule_id, 'throttled', undefined, { reason: 'throttle_limit_exceeded' });
        continue;
      }

      // Execute actions
      await executeActions(actions, event, rule, workerId);

      // Log successful trigger
      await logAutomationOutcome(event.event_id, rule.rule_id, 'triggered');

    } catch (error) {
      console.error(`Error processing rule ${rule.rule_id} for event ${event.event_id}:`, error);
      await logAutomationOutcome(event.event_id, rule.rule_id, 'error', error instanceof Error ? error.message : String(error));
    }
  }

  // Mark event as processed
  await pool.request()
    .input('eventId', sql.VarChar, event.event_id)
    .query(`
      INSERT INTO app.automation_log (event_id, outcome, started_at, finished_at)
      VALUES (@eventId, 'processed', SYSUTCDATETIME(), SYSUTCDATETIME())
    `);
}

function matchesTrigger(event: any, trigger: any): boolean {
  if (trigger.event_types) {
    const eventTypes = Array.isArray(trigger.event_types) ? trigger.event_types : [trigger.event_types];
    return eventTypes.some((type: string) =>
      type === '*' || type === event.type || (type.endsWith('*') && event.type.startsWith(type.slice(0, -1)))
    );
  }
  return false;
}

async function executeActions(actions: any[], event: any, rule: any, workerId: string) {
  const pool = await getPool();

  for (const action of actions) {
    try {
      const jobId = await queueActionJob(action, event, rule, workerId);
      await executeActionJob(jobId);
    } catch (error) {
      console.error(`Failed to execute action ${action.type}:`, error);
      await logAutomationOutcome(event.event_id, rule.rule_id, 'action_failed', error instanceof Error ? error.message : String(error), { action_type: action.type });
    }
  }
}

async function queueActionJob(action: any, event: any, rule: any, workerId: string): Promise<number> {
  const pool = await getPool();
  const idempotencyKey = generateIdempotencyKey(rule.rule_id, event.event_id, JSON.stringify(action));

  const result = await pool.request()
    .input('ruleId', sql.BigInt, rule.rule_id)
    .input('eventId', sql.VarChar, event.event_id)
    .input('actionType', sql.VarChar, action.type)
    .input('payload', sql.NVarChar, JSON.stringify(action.params || {}))
    .input('idempotencyKey', sql.VarChar, idempotencyKey)
    .query(`
      INSERT INTO app.automation_job (rule_id, event_id, action_type, payload_json, idempotency_key)
      OUTPUT INSERTED.job_id
      VALUES (@ruleId, @eventId, @actionType, @payload, @idempotencyKey)
    `);

  return result.recordset[0].job_id;
}

async function executeActionJob(jobId: number) {
  const pool = await getPool();

  // Claim job
  const claimResult = await pool.request()
    .input('jobId', sql.BigInt, jobId)
    .input('workerId', sql.VarChar, `worker-${Date.now()}`)
    .query(`
      UPDATE app.automation_job
      SET status = 'running', started_at = SYSUTCDATETIME(), attempts = attempts + 1
      OUTPUT INSERTED.*
      WHERE job_id = @jobId AND status = 'queued'
    `);

  if (claimResult.recordset.length === 0) return; // Job already claimed or completed

  const job = claimResult.recordset[0];
  const payload = job.payload_json ? JSON.parse(job.payload_json) : {};

  try {
    await executeAction(job.action_type, payload, job);

    // Mark as succeeded
    await pool.request()
      .input('jobId', sql.BigInt, jobId)
      .query(`
        UPDATE app.automation_job
        SET status = 'succeeded', finished_at = SYSUTCDATETIME()
        WHERE job_id = @jobId
      `);

  } catch (error) {
    console.error(`Action job ${jobId} failed:`, error);

    // Handle retry or dead letter
    const maxAttempts = job.max_attempts || 3;
    if (job.attempts >= maxAttempts) {
      await pool.request()
        .input('jobId', sql.BigInt, jobId)
        .input('error', sql.NVarChar, error instanceof Error ? error.message : String(error))
        .query(`
          UPDATE app.automation_job
          SET status = 'dead', finished_at = SYSUTCDATETIME(), error_message = @error
          WHERE job_id = @jobId
        `);
    } else {
      // Schedule retry with backoff
      const backoffMinutes = Math.min(2 ** job.attempts, 60);
      const nextRunAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

      await pool.request()
        .input('jobId', sql.BigInt, jobId)
        .input('nextRunAt', sql.DateTime2, nextRunAt)
        .query(`
          UPDATE app.automation_job
          SET status = 'queued', next_run_at = @nextRunAt
          WHERE job_id = @jobId
        `);
    }
  }
}

async function executeAction(actionType: string, params: any, job: any) {
  // This is where you implement the actual action execution
  // For now, we'll log the action - in production, integrate with actual services

  switch (actionType) {
    case 'comms.draft_reply':
      await executeCommsDraftReply(params);
      break;
    case 'comms.send_email':
      await executeCommsSendEmail(params);
      break;
    case 'workstream.create_candidate':
      await executeWorkstreamCreateCandidate(params);
      break;
    case 'engagements.create_task':
      await executeEngagementsCreateTask(params);
      break;
    case 'billing.create_invoice':
      await executeBillingCreateInvoice(params);
      break;
    // Add more action implementations...
    default:
      console.log(`Unknown action type: ${actionType}`, params);
  }
}

// Action implementations (stubs - integrate with actual services)
async function executeCommsDraftReply(params: any) {
  console.log('Executing comms.draft_reply:', params);
  // TODO: Integrate with comms service
}

async function executeCommsSendEmail(params: any) {
  console.log('Executing comms.send_email:', params);
  // TODO: Integrate with email service
}

async function executeWorkstreamCreateCandidate(params: any) {
  console.log('Executing workstream.create_candidate:', params);
  // TODO: Integrate with workstream service
}

async function executeEngagementsCreateTask(params: any) {
  console.log('Executing engagements.create_task:', params);
  // TODO: Integrate with engagements service
}

async function executeBillingCreateInvoice(params: any) {
  console.log('Executing billing.create_invoice:', params);
  // TODO: Integrate with billing service
}

async function logAutomationOutcome(eventId: string, ruleId: number, outcome: string, errorMessage?: string, metrics?: any) {
  const pool = await getPool();
  await pool.request()
    .input('eventId', sql.VarChar, eventId)
    .input('ruleId', sql.BigInt, ruleId)
    .input('outcome', sql.VarChar, outcome)
    .input('errorMessage', sql.NVarChar, errorMessage)
    .input('metrics', sql.NVarChar, metrics ? JSON.stringify(metrics) : null)
    .query(`
      INSERT INTO app.automation_log (
        event_id, rule_id, outcome, error_message, metrics_json,
        started_at, finished_at
      )
      VALUES (
        @eventId, @ruleId, @outcome, @errorMessage, @metrics,
        SYSUTCDATETIME(), SYSUTCDATETIME()
      )
    `);
}

// Process automation events every 30 seconds
if (require.main === module) {
  setInterval(processAutomationEvents, 30000);
  console.log('Automation worker started');
}
