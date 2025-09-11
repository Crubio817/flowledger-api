// state/guards.ts
import { sql } from '../db/pool';

// Default state machines (can be overridden by config registry)
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

export const DOCUMENT_TX = {
  draft: ['in_review', 'archived'],
  in_review: ['approved', 'draft'],
  approved: ['released'],
  released: ['archived'],
  archived: []
} as const;

export function assertTx<T extends string>(
  map: Record<string, readonly T[]>, from: T, to: T, label: string
) {
  const allowed = map[from] ?? [];
  if (!allowed.includes(to)) throw Object.assign(new Error(`Invalid ${label} ${from}→${to}`), { status: 422 });
}

// Config-aware transition validation
export async function assertTxWithConfig(
  pool: any, orgId: number, entityType: string, from: string, to: string, label: string
) {
  // Try to get transition rules from config registry first
  const configResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('configKey', sql.VarChar(64), `${entityType}_transitions`)
    .query(`
      SELECT config_value FROM app.v_active_config
      WHERE org_id = @orgId AND config_type = 'state_machine' AND config_key = @configKey
    `);

  let transitionMap: Record<string, readonly string[]>;
  
  if (configResult.recordset.length > 0) {
    // Use configured transitions
    try {
      transitionMap = JSON.parse(configResult.recordset[0].config_value);
    } catch (e) {
      console.warn(`Invalid transition config for ${entityType}, falling back to defaults`);
      transitionMap = getDefaultTransitionMap(entityType);
    }
  } else {
    // Use default transitions
    transitionMap = getDefaultTransitionMap(entityType);
  }

  assertTx(transitionMap as any, from as any, to as any, label);
}

// Helper to get default transition maps
function getDefaultTransitionMap(entityType: string): Record<string, readonly string[]> {
  switch (entityType) {
    case 'candidate': return CANDIDATE_TX as any;
    case 'pursuit': return PURSUIT_TX as any;
    case 'comms_thread': return COMMS_THREAD_TX as any;
    case 'document': return DOCUMENT_TX as any;
    default: return {};
  }
}

// Enhanced checklist validation with config-driven requirements
export async function ensureSubmitChecklistPasses(orgId: number, pursuitId: number, pool: any) {
  // Get configured requirements for submit gate
  const configResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('configKey', sql.VarChar(64), 'submit_requirements')
    .query(`
      SELECT config_value FROM app.v_active_config
      WHERE org_id = @orgId AND config_type = 'gate_rule' AND config_key = @configKey
    `);

  let requiredItems: string[] = [];
  if (configResult.recordset.length > 0) {
    try {
      requiredItems = JSON.parse(configResult.recordset[0].config_value);
    } catch (e) {
      console.warn('Invalid submit requirements config, using defaults');
      requiredItems = ['proposal_reviewed', 'pricing_approved', 'legal_terms_agreed'];
    }
  } else {
    requiredItems = ['proposal_reviewed', 'pricing_approved', 'legal_terms_agreed'];
  }

  // Check if all required items are complete
  const checklistResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('pursuitId', sql.BigInt, pursuitId)
    .query(`
      SELECT name, is_done FROM app.pursuit_checklist
      WHERE org_id = @orgId AND pursuit_id = @pursuitId AND is_required = 1
    `);

  const checklist = checklistResult.recordset;
  const completedItems = checklist.filter((item: any) => item.is_done).map((item: any) => item.name);
  const missingItems = requiredItems.filter(req => !completedItems.includes(req));

  if (missingItems.length > 0) {
    const e: any = new Error(`Submit blocked; incomplete checklist: ${missingItems.join(', ')}`);
    e.status = 409;
    e.missingItems = missingItems;
    e.requiredItems = requiredItems;
    throw e;
  }
}

// Config-driven quality gate validation
export async function ensureQualityGatePasses(orgId: number, entityType: string, entityId: number, gateType: string, pool: any) {
  // Get gate requirements from config
  const configResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('configKey', sql.VarChar(64), `${gateType}_requirements`)
    .query(`
      SELECT config_value FROM app.v_active_config
      WHERE org_id = @orgId AND config_type = 'gate_rule' AND config_key = @configKey
    `);

  if (configResult.recordset.length === 0) {
    // No gate configured, allow transition
    return;
  }

  let requirements: string[];
  try {
    requirements = JSON.parse(configResult.recordset[0].config_value);
  } catch (e) {
    console.warn(`Invalid gate config for ${gateType}, skipping validation`);
    return;
  }

  // Check requirements against checklist
  const checklistTable = entityType === 'pursuit' ? 'pursuit_checklist' : `${entityType}_checklist`;
  const entityIdColumn = entityType === 'pursuit' ? 'pursuit_id' : `${entityType}_id`;
  
  const checklistResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('entityId', sql.BigInt, entityId)
    .query(`
      SELECT name, is_done FROM app.${checklistTable}
      WHERE org_id = @orgId AND ${entityIdColumn} = @entityId
    `);

  const checklist = checklistResult.recordset;
  const completedItems = checklist.filter((item: any) => item.is_done).map((item: any) => item.name);
  const missingItems = requirements.filter(req => !completedItems.includes(req));

  if (missingItems.length > 0) {
    const e: any = new Error(`${gateType} gate blocked; missing requirements: ${missingItems.join(', ')}`);
    e.status = 409;
    e.gateType = gateType;
    e.missingItems = missingItems;
    e.requiredItems = requirements;
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

// Document state transition guard
export async function assertDocumentCanTransition(orgId: number, documentId: number, newStatus: string, pool: any) {
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('documentId', sql.Int, documentId)
    .query(`
      SELECT status FROM app.document
      WHERE org_id = @orgId AND id = @documentId
    `);

  const row = result.recordset[0];
  if (!row) {
    const e: any = new Error(`Document ${documentId} not found`);
    e.status = 404;
    throw e;
  }

  assertTx(DOCUMENT_TX, row.status, newStatus, 'document status');
}
