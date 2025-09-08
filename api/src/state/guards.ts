// state/guards.ts
import { sql } from '../db/pool';
export const CANDIDATE_TX = {
  new: ['triaged'],
  triaged: ['nurture','on_hold','promoted','archived'],
  nurture: ['triaged','on_hold','archived'],
  on_hold: ['triaged','archived'],
  promoted: [], archived: []
} as const;

export const PURSUIT_TX = {
  qual: ['pink'],
  pink: ['red','qual'],
  red: ['submit','pink'],
  submit: ['won','lost'],
  won: [], lost: []
} as const;

export const COMMS_THREAD_TX = {
  active: ['pending', 'resolved', 'escalated', 'on_hold'],
  pending: ['active', 'resolved', 'escalated'],
  escalated: ['active', 'resolved', 'on_hold'],
  on_hold: ['active', 'escalated', 'resolved'],
  resolved: ['reopened'],
  reopened: ['active', 'resolved', 'escalated', 'on_hold']
} as const;

export function assertTx<T extends string>(
  map: Record<string, readonly T[]>, from: T, to: T, label: string
) {
  const allowed = map[from] ?? [];
  if (!allowed.includes(to)) throw Object.assign(new Error(`Invalid ${label} ${from}→${to}`), { status: 422 });
}

// Checklist validation guard
export async function ensureSubmitChecklistPasses(orgId: number, pursuitId: number, pool: any) {
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('pursuitId', sql.BigInt, pursuitId)
    .query(`
      SELECT ready FROM app.v_pursuit_checklist_ready
      WHERE org_id = @orgId AND pursuit_id = @pursuitId
    `);

  const row = result.recordset[0];
  if (!row || row.ready !== 1) {
    // Get list of incomplete items for better error message
    const incompleteResult = await pool.request()
      .input('orgId', sql.Int, orgId)
      .input('pursuitId', sql.BigInt, pursuitId)
      .query(`
        SELECT name FROM app.pursuit_checklist
        WHERE org_id = @orgId AND pursuit_id = @pursuitId AND is_required = 1 AND is_done = 0
      `);

    const missing = incompleteResult.recordset.map((r: any) => r.name);
    const e: any = new Error(`Submit blocked; incomplete checklist: ${missing.join(', ')}`);
    e.status = 409;
    throw e;
  }
}

// Comms thread state transition guard
export async function ensureCommsThreadTransition(orgId: number, threadId: number, newStatus: string, pool: any) {
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('threadId', sql.BigInt, threadId)
    .query(`
      SELECT status FROM app.comms_thread
      WHERE org_id = @orgId AND thread_id = @threadId
    `);

  const row = result.recordset[0];
  if (!row) {
    const e: any = new Error(`Comms thread ${threadId} not found`);
    e.status = 404;
    throw e;
  }

  // Use the assertTx function to validate the transition
  assertTx(COMMS_THREAD_TX, row.status, newStatus, 'comms thread status');
}
