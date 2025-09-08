// src/state/billing-guards.ts
import { sql } from '../db/pool';

export const CONTRACT_TX = {
  draft: ['active', 'cancelled'],
  active: ['completed', 'terminated', 'suspended'],
  suspended: ['active', 'terminated'],
  completed: [], // Terminal state
  terminated: [], // Terminal state
  cancelled: []  // Terminal state
} as const;

export const INVOICE_TX = {
  draft: ['sent', 'voided'],
  sent: ['viewed', 'overdue', 'paid', 'credited'],
  viewed: ['overdue', 'paid', 'credited'],
  overdue: ['paid', 'credited', 'collections'],
  paid: [], // Terminal state
  credited: [], // Terminal state
  voided: [], // Terminal state
  collections: ['paid', 'written_off']
} as const;

export const TIME_ENTRY_TX = {
  submitted: ['approved', 'rejected'],
  approved: [], // Terminal state
  rejected: ['submitted'] // Can resubmit
} as const;

export const CONTRACT_MILESTONE_TX = {
  pending: ['ready', 'cancelled'],
  ready: ['billed', 'cancelled'],
  billed: ['paid'],
  paid: [], // Terminal state
  cancelled: [] // Terminal state
} as const;

export const CREDIT_NOTE_TX = {
  draft: ['issued'],
  issued: ['applied', 'expired'],
  applied: [], // Terminal state
  expired: [] // Terminal state
} as const;

export function assertTx<T extends string>(
  map: Record<string, readonly T[]>,
  from: T,
  to: T,
  label: string
) {
  const allowed = map[from] ?? [];
  if (!allowed.includes(to)) throw Object.assign(new Error(`Invalid ${label} ${from}→${to}`), { status: 422 });
}

// Business rule guards
export async function ensureContractAccess(orgId: number, contractId: number, pool: any) {
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('contractId', sql.BigInt, contractId)
    .query('SELECT contract_id FROM app.contract WHERE org_id = @orgId AND contract_id = @contractId');

  if (result.recordset.length === 0) {
    const e: any = new Error('Contract not found or access denied');
    e.status = 404;
    throw e;
  }
}

export async function ensureInvoiceAccess(orgId: number, invoiceId: number, pool: any) {
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('invoiceId', sql.BigInt, invoiceId)
    .query('SELECT invoice_id FROM app.invoice WHERE org_id = @orgId AND invoice_id = @invoiceId');

  if (result.recordset.length === 0) {
    const e: any = new Error('Invoice not found or access denied');
    e.status = 404;
    throw e;
  }
}

export async function ensureTimeEntryAccess(orgId: number, timeEntryId: number, pool: any) {
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('timeEntryId', sql.BigInt, timeEntryId)
    .query('SELECT time_entry_id FROM app.time_entry WHERE org_id = @orgId AND time_entry_id = @timeEntryId');

  if (result.recordset.length === 0) {
    const e: any = new Error('Time entry not found or access denied');
    e.status = 404;
    throw e;
  }
}

// Rate resolution with precedence
export async function resolveBillRate(
  orgId: number,
  personId: number,
  roleTemplateId: number,
  engagementId?: number,
  clientId?: number,
  skillIds?: number[],
  pool?: any
): Promise<{
  billRate: number;
  costRate: number;
  currency: string;
  source: string;
  premiumAmount: number;
}> {
  if (!pool) {
    const { getPool } = await import('../db/pool');
    pool = await getPool();
  }

  // 1. Check engagement-specific rates
  if (engagementId) {
    const engagementRate = await pool.request()
      .input('orgId', sql.Int, orgId)
      .input('engagementId', sql.BigInt, engagementId)
      .input('roleTemplateId', sql.BigInt, roleTemplateId)
      .query(`
        SELECT base_rate, currency, 'engagement' as source
        FROM app.rate_card
        WHERE org_id = @orgId AND scope = 'engagement' AND scope_id = @engagementId
          AND (role_template_id = @roleTemplateId OR role_template_id IS NULL)
          AND effective_from <= GETUTCDATE()
          AND (effective_to IS NULL OR effective_to >= GETUTCDATE())
        ORDER BY role_template_id DESC, effective_from DESC
      `);

    if (engagementRate.recordset.length > 0) {
      const rate = engagementRate.recordset[0];
      return {
        billRate: rate.base_rate,
        costRate: 0, // Would need to resolve separately
        currency: rate.currency,
        source: rate.source,
        premiumAmount: 0
      };
    }
  }

  // 2. Check client-specific rates
  if (clientId) {
    const clientRate = await pool.request()
      .input('orgId', sql.Int, orgId)
      .input('clientId', sql.BigInt, clientId)
      .input('roleTemplateId', sql.BigInt, roleTemplateId)
      .query(`
        SELECT base_rate, currency, 'client' as source
        FROM app.rate_card
        WHERE org_id = @orgId AND scope = 'client' AND scope_id = @clientId
          AND (role_template_id = @roleTemplateId OR role_template_id IS NULL)
          AND effective_from <= GETUTCDATE()
          AND (effective_to IS NULL OR effective_to >= GETUTCDATE())
        ORDER BY role_template_id DESC, effective_from DESC
      `);

    if (clientRate.recordset.length > 0) {
      const rate = clientRate.recordset[0];
      return {
        billRate: rate.base_rate,
        costRate: 0,
        currency: rate.currency,
        source: rate.source,
        premiumAmount: 0
      };
    }
  }

  // 3. Check person-specific rates
  const personRate = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('personId', sql.BigInt, personId)
    .input('roleTemplateId', sql.BigInt, roleTemplateId)
    .query(`
      SELECT base_rate, currency, 'person' as source
      FROM app.rate_card
      WHERE org_id = @orgId AND scope = 'person' AND scope_id = @personId
        AND (role_template_id = @roleTemplateId OR role_template_id IS NULL)
        AND effective_from <= GETUTCDATE()
        AND (effective_to IS NULL OR effective_to >= GETUTCDATE())
      ORDER BY role_template_id DESC, effective_from DESC
    `);

  if (personRate.recordset.length > 0) {
    const rate = personRate.recordset[0];
    return {
      billRate: rate.base_rate,
      costRate: 0,
      currency: rate.currency,
      source: rate.source,
      premiumAmount: 0
    };
  }

  // 4. Check role-specific rates
  const roleRate = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('roleTemplateId', sql.BigInt, roleTemplateId)
    .query(`
      SELECT base_rate, currency, 'role' as source
      FROM app.rate_card
      WHERE org_id = @orgId AND scope = 'role' AND scope_id = @roleTemplateId
        AND effective_from <= GETUTCDATE()
        AND (effective_to IS NULL OR effective_to >= GETUTCDATE())
      ORDER BY effective_from DESC
    `);

  if (roleRate.recordset.length > 0) {
    const rate = roleRate.recordset[0];
    return {
      billRate: rate.base_rate,
      costRate: 0,
      currency: rate.currency,
      source: rate.source,
      premiumAmount: 0
    };
  }

  // 5. Fall back to org rates
  const orgRate = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('roleTemplateId', sql.BigInt, roleTemplateId)
    .query(`
      SELECT base_rate, currency, 'org' as source
      FROM app.rate_card
      WHERE org_id = @orgId AND scope = 'org'
        AND (role_template_id = @roleTemplateId OR role_template_id IS NULL)
        AND effective_from <= GETUTCDATE()
        AND (effective_to IS NULL OR effective_to >= GETUTCDATE())
      ORDER BY role_template_id DESC, effective_from DESC
    `);

  if (orgRate.recordset.length > 0) {
    const rate = orgRate.recordset[0];
    return {
      billRate: rate.base_rate,
      costRate: 0,
      currency: rate.currency,
      source: rate.source,
      premiumAmount: 0
    };
  }

  // No rate found - this should be an error in production
  throw new Error(`No bill rate found for person ${personId}, role ${roleTemplateId}`);
}

// Budget validation
export async function validateContractBudget(
  orgId: number,
  contractId: number,
  newAmount: number,
  pool: any
): Promise<{ isValid: boolean; currentSpend: number; budgetCap: number }> {
  const budgetCheck = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('contractId', sql.BigInt, contractId)
    .query(`
      SELECT
        ISNULL(cb.cap_amount, 0) as budget_cap,
        ISNULL((
          SELECT SUM(ili.line_total)
          FROM app.invoice i
          JOIN app.invoice_line_item ili ON i.invoice_id = ili.invoice_id
          WHERE i.contract_id = @contractId AND i.status IN ('sent', 'paid')
        ), 0) as current_spend
      FROM app.contract c
      LEFT JOIN app.contract_budget cb ON c.contract_id = cb.contract_id
      WHERE c.contract_id = @contractId
    `);

  const { budget_cap, current_spend } = budgetCheck.recordset[0];
  const isValid = budget_cap === 0 || (current_spend + newAmount) <= budget_cap;

  return {
    isValid,
    currentSpend: current_spend,
    budgetCap: budget_cap
  };
}

// Revenue recognition rules
export const REVENUE_RULES = {
  time: 'immediate', // Recognize when time is approved
  milestone: 'completion', // Recognize when milestone is completed
  pct_complete: 'periodic', // Recognize based on project progress
  retainer: 'accrual' // Recognize monthly
} as const;

export function getRevenueRecognitionRule(contractType: string, billingType: string): string {
  if (billingType === 'milestone') return REVENUE_RULES.milestone;
  if (billingType === 'pct_complete') return REVENUE_RULES.pct_complete;
  if (contractType === 'Retainer') return REVENUE_RULES.retainer;
  return REVENUE_RULES.time; // Default for T&M
}
