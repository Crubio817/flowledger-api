import { getPool, sql } from '../db/pool';

// Automation state machines and business rules
export const AUTOMATION_JOB_TX = {
  queued: ['running'],
  running: ['succeeded', 'failed'],
  failed: ['queued', 'dead'], // Allow retry or dead letter
  succeeded: [], // Terminal state
  dead: [] // Terminal state
};

export const AUTOMATION_RULE_TX = {
  draft: ['active', 'disabled'],
  active: ['disabled'],
  disabled: ['active', 'draft']
};

export function assertAutomationJobTx(from: string, to: string, jobId: number) {
  const allowed = (AUTOMATION_JOB_TX as any)[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid automation job transition: ${from} → ${to} for job ${jobId}`);
  }
}

export function assertAutomationRuleTx(from: string, to: string, ruleId: number) {
  const allowed = (AUTOMATION_RULE_TX as any)[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid automation rule transition: ${from} → ${to} for rule ${ruleId}`);
  }
}

// Action permission validation
export const ACTION_PERMISSIONS = {
  'comms.draft_reply': ['comms.write'],
  'comms.send_email': ['comms.send'],
  'comms.set_status': ['comms.write'],
  'comms.escalate': ['comms.escalate'],
  'workstream.create_candidate': ['workstream.write'],
  'workstream.promote_to_pursuit': ['workstream.write'],
  'engagements.create_task': ['engagements.write'],
  'engagements.update_state': ['engagements.write'],
  'engagements.generate_report_doc': ['engagements.write', 'docs.write'],
  'docs.render_template': ['docs.write'],
  'docs.approve_version': ['docs.approve'],
  'docs.share_link': ['docs.share'],
  'billing.create_invoice': ['billing.write'],
  'billing.add_milestone_line': ['billing.write'],
  'billing.post_invoice': ['billing.post'],
  'billing.send_dunning': ['billing.send'],
  'people.create_staffing_request': ['people.write'],
  'people.rank_candidates': ['people.write'],
  'people.create_assignment': ['people.write'],
  'automation.schedule_followup': ['automation.write'],
  'automation.emit_event': ['automation.write'],
  'automation.call_webhook': ['automation.call']
};

export function validateActionPermissions(actionType: string, userPermissions: string[]): boolean {
  const required = (ACTION_PERMISSIONS as any)[actionType] || [];
  return required.every((perm: string) => userPermissions.includes(perm));
}

// Throttle checking
export async function checkThrottle(ruleId: number, tenantId: number, throttlePer: string, throttleLimit: number): Promise<boolean> {
  const pool = await getPool();

  let timeWindow: string;
  switch (throttlePer) {
    case 'minute': timeWindow = 'DATEADD(minute, -1, SYSUTCDATETIME())'; break;
    case 'hour': timeWindow = 'DATEADD(hour, -1, SYSUTCDATETIME())'; break;
    case 'day': timeWindow = 'DATEADD(day, -1, SYSUTCDATETIME())'; break;
    default: return true; // No throttle
  }

  const result = await pool.request()
    .input('ruleId', sql.BigInt, ruleId)
    .input('tenantId', sql.Int, tenantId)
    .query(`
      SELECT COUNT(*) as count
      FROM app.automation_log
      WHERE rule_id = @ruleId
        AND created_at >= ${timeWindow}
        AND outcome = 'triggered'
    `);

  return (result.recordset[0]?.count || 0) < throttleLimit;
}

// Idempotency key generation
export function generateIdempotencyKey(ruleId: number, eventId: string, actionSignature: string): string {
  return `${ruleId}:${eventId}:${actionSignature}`;
}

// Event deduplication
export async function isEventDuplicate(tenantId: number, dedupeKey: string): Promise<boolean> {
  if (!dedupeKey) return false;

  const pool = await getPool();
  const result = await pool.request()
    .input('tenantId', sql.Int, tenantId)
    .input('dedupeKey', sql.VarChar, dedupeKey)
    .query(`
      SELECT COUNT(*) as count
      FROM app.automation_event
      WHERE tenant_id = @tenantId
        AND dedupe_key = @dedupeKey
        AND occurred_at >= DATEADD(hour, -24, SYSUTCDATETIME())
    `);

  return (result.recordset[0]?.count || 0) > 0;
}

// JSON-logic evaluation (simplified)
export function evaluateCondition(condition: any, context: any): boolean {
  if (!condition) return true;

  // Simple implementation - in production, use a proper JSON-logic library
  if (condition.var) {
    const value = getNestedValue(context, condition.var);
    if (condition['==']) return value == condition['=='];
    if (condition['!=']) return value != condition['!='];
    if (condition['>']) return value > condition['>'];
    if (condition['<']) return value < condition['<'];
    if (condition.regex) return new RegExp(condition.regex).test(value);
  }

  if (condition.and) {
    return condition.and.every((c: any) => evaluateCondition(c, context));
  }

  if (condition.or) {
    return condition.or.some((c: any) => evaluateCondition(c, context));
  }

  return true;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}
