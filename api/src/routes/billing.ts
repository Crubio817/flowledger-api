import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { logActivity } from '../utils/activity';
import {
  assertTx,
  CONTRACT_TX,
  INVOICE_TX,
  TIME_ENTRY_TX,
  ensureContractAccess,
  ensureInvoiceAccess,
  ensureTimeEntryAccess,
  resolveBillRate
} from '../state/billing-guards';

// Simple outbox event emitter
async function emitOutboxEvent(eventName: string, payload: any) {
  const pool = await getPool();
  await pool.request()
    .input('eventName', sql.VarChar(40), eventName)
    .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .query(`
      INSERT INTO app.work_event (event_name, payload_json, item_type, item_id, org_id)
      VALUES (@eventName, @payload, 'billing', @payload.id || 0, @payload.org_id || 0)
    `);
}

const router = Router();

// =============================================================================
// CONTRACTS
// =============================================================================

/**
 * @openapi
 * /api/billing/contracts:
 *   get:
 *     summary: List contracts
 *     tags: [Billing]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, active, on_hold, completed, cancelled] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [time_materials, fixed_price, milestone, retainer, prepaid] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Contracts list
 *   post:
 *     summary: Create contract
 *     tags: [Billing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [org_id, client_id, engagement_id, contract_type, start_date]
 *             properties:
 *               org_id: { type: integer }
 *               client_id: { type: integer }
 *               engagement_id: { type: integer }
 *               contract_type: { type: string }
 *               currency: { type: string }
 *               start_date: { type: string, format: date }
 *               end_date: { type: string, format: date }
 *               billing_terms: { type: object }
 *     responses:
 *       201:
 *         description: Contract created
 */
// GET /api/billing/contracts - List contracts
router.get('/contracts', asyncHandler(async (req, res) => {
  const { page, limit, offset } = require('../utils/http').getPagination(req);
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const status = req.query.status as string;
  const type = req.query.type as string;

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  let query = `
    SELECT
      c.contract_id as id,
      c.client_id,
      c.engagement_id,
      c.contract_type,
      c.currency,
      c.start_date,
      c.end_date,
      c.status,
      c.total_amount,
      c.billing_terms,
      c.created_at,
      cl.name as client_name,
      e.name as engagement_name,
      -- Current spend calculation
      ISNULL((
        SELECT SUM(ili.line_total)
        FROM app.invoice i
        JOIN app.invoice_line_item ili ON i.invoice_id = ili.invoice_id
        WHERE i.contract_id = c.contract_id AND i.status IN ('sent', 'paid')
      ), 0) as current_spend
    FROM app.contract c
    JOIN app.clients cl ON c.client_id = cl.client_id AND c.org_id = cl.org_id
    LEFT JOIN app.engagement e ON c.engagement_id = e.engagement_id AND c.org_id = e.org_id
    WHERE c.org_id = @orgId
  `;

  const request = pool.request().input('orgId', sql.Int, orgId);
  if (status) {
    query += ' AND c.status = @status';
    request.input('status', sql.VarChar(20), status);
  }
  if (type) {
    query += ' AND c.contract_type = @type';
    request.input('type', sql.VarChar(20), type);
  }

  query += ' ORDER BY c.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
  request.input('offset', sql.Int, offset).input('limit', sql.Int, limit);

  const result = await request.query(query);
  listOk(res, result.recordset, { page, limit });
}));

// POST /api/billing/contracts - Create contract
router.post('/contracts', asyncHandler(async (req, res) => {
  const {
    org_id,
    client_id,
    engagement_id,
    contract_type,
    currency,
    start_date,
    end_date,
    billing_terms,
    retainer_amount,
    retainer_period,
    included_hours,
    prepayment_balance,
    budget_cap
  } = req.body;

  if (!org_id || !client_id || !engagement_id || !contract_type || !start_date) {
    return badRequest(res, 'org_id, client_id, engagement_id, contract_type, start_date required');
  }

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, org_id)
    .input('clientId', sql.BigInt, client_id)
    .input('engagementId', sql.BigInt, engagement_id)
    .input('contractType', sql.VarChar(20), contract_type)
    .input('currency', sql.VarChar(3), currency || 'USD')
    .input('startDate', sql.Date, start_date)
    .input('endDate', sql.Date, end_date)
    .input('billingTerms', sql.NVarChar(sql.MAX), billing_terms ? JSON.stringify(billing_terms) : null)
    .input('retainerAmount', sql.Decimal(12,2), retainer_amount)
    .input('retainerPeriod', sql.VarChar(20), retainer_period)
    .input('includedHours', sql.Decimal(8,2), included_hours)
    .input('prepaymentBalance', sql.Decimal(12,2), prepayment_balance)
    .input('budgetCap', sql.Decimal(12,2), budget_cap)
    .query(`
      INSERT INTO app.contract (
        org_id, client_id, engagement_id, contract_type, currency, start_date, end_date,
        billing_terms, retainer_amount, retainer_period, included_hours, prepayment_balance,
        status, created_at
      )
      OUTPUT INSERTED.*
      VALUES (
        @orgId, @clientId, @engagementId, @contractType, @currency, @startDate, @endDate,
        @billingTerms, @retainerAmount, @retainerPeriod, @includedHours, @prepaymentBalance,
        'draft', SYSUTCDATETIME()
      )
    `);

  const created = result.recordset[0];
  await logActivity({
    type: 'ContractCreated',
    title: `${contract_type} contract created for engagement ${engagement_id}`,
    client_id: client_id
  });

  ok(res, created, 201);
}));

/**
 * @openapi
 * /api/billing/contracts/{id}:
 *   patch:
 *     summary: Update contract status
 *     tags: [Billing]
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
 *               status: { type: string, enum: [draft, active, on_hold, completed, cancelled] }
 *     responses:
 *       200:
 *         description: Status updated
 */
// PATCH /api/billing/contracts/:id - Update contract status
router.patch('/contracts/:id', asyncHandler(async (req, res) => {
  const contractId = Number(req.params.id);
  const { status } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!status) return badRequest(res, 'status required');

  const pool = await getPool();
  await ensureContractAccess(orgId, contractId, pool);

  // Get current status
  const currentResult = await pool.request()
    .input('contractId', sql.BigInt, contractId)
    .query('SELECT status FROM app.contract WHERE contract_id = @contractId');

  const currentStatus = currentResult.recordset[0]?.status;
  if (!currentStatus) return notFound(res);

  assertTx(CONTRACT_TX, currentStatus, status, 'contract status');

  await pool.request()
    .input('contractId', sql.BigInt, contractId)
    .input('status', sql.VarChar(20), status)
    .query('UPDATE app.contract SET status = @status, updated_at = SYSUTCDATETIME() WHERE contract_id = @contractId');

  ok(res, { contract_id: contractId, status });
}));

// =============================================================================
// TIME ENTRIES
// =============================================================================

/**
 * @openapi
 * /api/billing/time-entries:
 *   get:
 *     summary: List time entries
 *     tags: [Billing]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: assignment_id
 *         schema: { type: integer }
 *       - in: query
 *         name: approved
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Time entries list
 *   post:
 *     summary: Create time entry
 *     tags: [Billing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [org_id, assignment_id, hours, entry_date]
 *             properties:
 *               org_id: { type: integer }
 *               assignment_id: { type: integer }
 *               hours: { type: number }
 *               entry_date: { type: string, format: date }
 *               description: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Time entry created
 */
// GET /api/billing/time-entries - List time entries
router.get('/time-entries', asyncHandler(async (req, res) => {
  const { page, limit, offset } = require('../utils/http').getPagination(req);
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const assignmentId = req.query.assignment_id ? Number(req.query.assignment_id) : null;
  const approved = req.query.approved as string;

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  let query = `
    SELECT
      te.time_entry_id as id,
      te.assignment_id,
      te.hours,
      te.entry_date,
      te.description,
      te.approved_at,
      te.approved_by,
      te.bill_rate_snapshot,
      te.cost_rate_snapshot,
      te.currency_snapshot,
      te.notes,
      te.created_at,
      a.person_id,
      a.role_template_id,
      p.name as person_name,
      rt.name as role_name
    FROM app.time_entry te
    JOIN app.assignment a ON te.assignment_id = a.assignment_id
    JOIN app.person p ON a.person_id = p.person_id
    JOIN app.role_template rt ON a.role_template_id = rt.role_template_id
    WHERE te.org_id = @orgId
  `;

  const request = pool.request().input('orgId', sql.Int, orgId);
  if (assignmentId) {
    query += ' AND te.assignment_id = @assignmentId';
    request.input('assignmentId', sql.BigInt, assignmentId);
  }
  if (approved === 'true') {
    query += ' AND te.approved_at IS NOT NULL';
  } else if (approved === 'false') {
    query += ' AND te.approved_at IS NULL';
  }

  query += ' ORDER BY te.entry_date DESC, te.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
  request.input('offset', sql.Int, offset).input('limit', sql.Int, limit);

  const result = await request.query(query);
  listOk(res, result.recordset, { page, limit });
}));

// POST /api/billing/time-entries - Create time entry
router.post('/time-entries', asyncHandler(async (req, res) => {
  const { org_id, assignment_id, hours, entry_date, description, notes } = req.body;

  if (!org_id || !assignment_id || !hours || !entry_date) {
    return badRequest(res, 'org_id, assignment_id, hours, entry_date required');
  }

  const pool = await getPool();

  // Get assignment details for rate resolution
  const assignment = await pool.request()
    .input('assignmentId', sql.BigInt, assignment_id)
    .query(`
      SELECT a.person_id, a.role_template_id, a.engagement_id, a.bill_rate_snapshot, a.cost_rate_snapshot, a.currency,
             e.client_id
      FROM app.assignment a
      JOIN app.engagement e ON a.engagement_id = e.engagement_id
      WHERE a.assignment_id = @assignmentId
    `);

  if (assignment.recordset.length === 0) {
    return badRequest(res, 'Invalid assignment_id');
  }

  const { person_id, role_template_id, engagement_id, client_id } = assignment.recordset[0];

  // Resolve current rates (snapshot them)
  const rateResolution = await resolveBillRate(org_id, person_id, role_template_id, engagement_id, client_id);

  const result = await pool.request()
    .input('orgId', sql.Int, org_id)
    .input('assignmentId', sql.BigInt, assignment_id)
    .input('hours', sql.Decimal(5,2), hours)
    .input('entryDate', sql.Date, entry_date)
    .input('description', sql.NVarChar(500), description)
    .input('notes', sql.NVarChar(500), notes)
    .input('billRateSnapshot', sql.Decimal(10,2), rateResolution.billRate)
    .input('costRateSnapshot', sql.Decimal(10,2), rateResolution.costRate)
    .input('currencySnapshot', sql.VarChar(3), rateResolution.currency)
    .query(`
      INSERT INTO app.time_entry (
        org_id, assignment_id, hours, entry_date, description, notes,
        bill_rate_snapshot, cost_rate_snapshot, currency_snapshot, created_at
      )
      OUTPUT INSERTED.*
      VALUES (
        @orgId, @assignmentId, @hours, @entryDate, @description, @notes,
        @billRateSnapshot, @costRateSnapshot, @currencySnapshot, SYSUTCDATETIME()
      )
    `);

  ok(res, result.recordset[0], 201);
}));

/**
 * @openapi
 * /api/billing/time-entries/{id}/approve:
 *   patch:
 *     summary: Approve time entry
 *     tags: [Billing]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: user_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Time entry approved
 */
// PATCH /api/billing/time-entries/:id/approve - Approve time entry
router.patch('/time-entries/:id/approve', asyncHandler(async (req, res) => {
  const timeEntryId = Number(req.params.id);
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const userId = req.query.user_id ? Number(req.query.user_id) : 1; // Default for now

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  await ensureTimeEntryAccess(orgId, timeEntryId, pool);

  // Get current status
  const currentResult = await pool.request()
    .input('timeEntryId', sql.BigInt, timeEntryId)
    .query('SELECT approved_at FROM app.time_entry WHERE time_entry_id = @timeEntryId');

  const current = currentResult.recordset[0];
  if (!current) return notFound(res);

  const fromStatus = current.approved_at ? 'approved' : 'submitted';
  assertTx(TIME_ENTRY_TX, fromStatus, 'approved', 'time entry status');

  await pool.request()
    .input('timeEntryId', sql.BigInt, timeEntryId)
    .input('approvedBy', sql.BigInt, userId)
    .query(`
      UPDATE app.time_entry
      SET approved_at = SYSUTCDATETIME(), approved_by = @approvedBy
      WHERE time_entry_id = @timeEntryId
    `);

  // Emit revenue event for approved time
  await emitOutboxEvent('time_entry.approved', {
    org_id: orgId,
    time_entry_id: timeEntryId,
    approved_by: userId
  });

  ok(res, { time_entry_id: timeEntryId, status: 'approved' });
}));

// =============================================================================
// INVOICES
// =============================================================================

/**
 * @openapi
 * /api/billing/invoices:
 *   get:
 *     summary: List invoices
 *     tags: [Billing]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, sent, viewed, paid, overdue, cancelled] }
 *       - in: query
 *         name: contract_id
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Invoices list
 *   post:
 *     summary: Create invoice from approved time/milestones
 *     tags: [Billing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [org_id, contract_id, start_date, end_date]
 *             properties:
 *               org_id: { type: integer }
 *               contract_id: { type: integer }
 *               engagement_id: { type: integer }
 *               start_date: { type: string, format: date }
 *               end_date: { type: string, format: date }
 *               due_date: { type: string, format: date }
 *               notes: { type: string }
 *               po_number: { type: string }
 *     responses:
 *       201:
 *         description: Invoice created
 */
// GET /api/billing/invoices - List invoices
router.get('/invoices', asyncHandler(async (req, res) => {
  const { page, limit, offset } = require('../utils/http').getPagination(req);
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const status = req.query.status as string;
  const contractId = req.query.contract_id ? Number(req.query.contract_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  let query = `
    SELECT
      i.invoice_id as id,
      i.invoice_number,
      i.contract_id,
      i.engagement_id,
      i.start_date,
      i.end_date,
      i.total_amount,
      i.tax_amount,
      i.discount_amount,
      i.paid_amount,
      i.outstanding_amount,
      i.currency,
      i.status,
      i.sent_at,
      i.due_date,
      i.created_at,
      c.contract_type,
      cl.name as client_name,
      e.name as engagement_name
    FROM app.invoice i
    LEFT JOIN app.contract c ON i.contract_id = c.contract_id
    LEFT JOIN app.clients cl ON c.client_id = cl.client_id
    LEFT JOIN app.engagement e ON i.engagement_id = e.engagement_id
    WHERE i.org_id = @orgId
  `;

  const request = pool.request().input('orgId', sql.Int, orgId);
  if (status) {
    query += ' AND i.status = @status';
    request.input('status', sql.VarChar(20), status);
  }
  if (contractId) {
    query += ' AND i.contract_id = @contractId';
    request.input('contractId', sql.BigInt, contractId);
  }

  query += ' ORDER BY i.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
  request.input('offset', sql.Int, offset).input('limit', sql.Int, limit);

  const result = await request.query(query);
  listOk(res, result.recordset, { page, limit });
}));

// POST /api/billing/invoices - Create invoice
router.post('/invoices', asyncHandler(async (req, res) => {
  const {
    org_id,
    contract_id,
    engagement_id,
    start_date,
    end_date,
    due_date,
    notes,
    po_number
  } = req.body;

  if (!org_id || !contract_id || !start_date || !end_date) {
    return badRequest(res, 'org_id, contract_id, start_date, end_date required');
  }

  const pool = await getPool();
  await ensureContractAccess(org_id, contract_id, pool);

  // Generate invoice number
  const invoiceNumber = `INV-${Date.now()}`;

  // Calculate invoice amounts from time entries and milestones
  const amounts = await calculateInvoiceAmounts(org_id, contract_id, start_date, end_date, pool);

  const result = await pool.request()
    .input('orgId', sql.Int, org_id)
    .input('contractId', sql.BigInt, contract_id)
    .input('engagementId', sql.BigInt, engagement_id)
    .input('invoiceNumber', sql.VarChar(50), invoiceNumber)
    .input('startDate', sql.Date, start_date)
    .input('endDate', sql.Date, end_date)
    .input('totalAmount', sql.Decimal(12,2), amounts.subtotal)
    .input('taxAmount', sql.Decimal(12,2), amounts.tax)
    .input('dueDate', sql.Date, due_date)
    .input('notes', sql.NVarChar(1000), notes)
    .input('poNumber', sql.NVarChar(50), po_number)
    .query(`
      INSERT INTO app.invoice (
        org_id, contract_id, engagement_id, invoice_number, start_date, end_date,
        total_amount, tax_amount, status, due_date, notes, po_number, created_at
      )
      OUTPUT INSERTED.*
      VALUES (
        @orgId, @contractId, @engagementId, @invoiceNumber, @startDate, @endDate,
        @totalAmount, @taxAmount, 'draft', @dueDate, @notes, @poNumber, SYSUTCDATETIME()
      )
    `);

  const invoice = result.recordset[0];

  // Create invoice line items
  await createInvoiceLineItems(org_id, invoice.invoice_id, contract_id, start_date, end_date, pool);

  ok(res, invoice, 201);
}));

/**
 * @openapi
 * /api/billing/invoices/{id}/status:
 *   patch:
 *     summary: Update invoice status
 *     tags: [Billing]
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
 *               status: { type: string, enum: [draft, sent, viewed, paid, overdue, cancelled] }
 *     responses:
 *       200:
 *         description: Status updated
 */
// PATCH /api/billing/invoices/:id/status - Update invoice status
router.patch('/invoices/:id/status', asyncHandler(async (req, res) => {
  const invoiceId = Number(req.params.id);
  const { status } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!status) return badRequest(res, 'status required');

  const pool = await getPool();
  await ensureInvoiceAccess(orgId, invoiceId, pool);

  // Get current status
  const currentResult = await pool.request()
    .input('invoiceId', sql.BigInt, invoiceId)
    .query('SELECT status FROM app.invoice WHERE invoice_id = @invoiceId');

  const currentStatus = currentResult.recordset[0]?.status;
  if (!currentStatus) return notFound(res);

  assertTx(INVOICE_TX, currentStatus, status, 'invoice status');

  const updateFields: any = { status };
  if (status === 'sent') updateFields.sent_at = new Date();
  if (status === 'viewed') updateFields.viewed_at = new Date();

  await pool.request()
    .input('invoiceId', sql.BigInt, invoiceId)
    .input('status', sql.VarChar(20), status)
    .query(`
      UPDATE app.invoice
      SET status = @status,
          sent_at = CASE WHEN @status = 'sent' THEN SYSUTCDATETIME() ELSE sent_at END,
          viewed_at = CASE WHEN @status = 'viewed' THEN SYSUTCDATETIME() ELSE viewed_at END,
          updated_at = SYSUTCDATETIME()
      WHERE invoice_id = @invoiceId
    `);

  ok(res, { invoice_id: invoiceId, status });
}));

// =============================================================================
// PAYMENTS
// =============================================================================

/**
 * @openapi
 * /api/billing/payments:
 *   post:
 *     summary: Record payment
 *     tags: [Billing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [org_id, invoice_id, amount, payment_method]
 *             properties:
 *               org_id: { type: integer }
 *               invoice_id: { type: integer }
 *               amount: { type: number }
 *               currency: { type: string }
 *               payment_method: { type: string }
 *               payment_date: { type: string, format: date-time }
 *               reference_number: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Payment recorded
 */
// POST /api/billing/payments - Record payment
router.post('/payments', asyncHandler(async (req, res) => {
  const {
    org_id,
    invoice_id,
    amount,
    currency,
    payment_method,
    payment_date,
    reference_number,
    notes
  } = req.body;

  if (!org_id || !invoice_id || !amount || !payment_method) {
    return badRequest(res, 'org_id, invoice_id, amount, payment_method required');
  }

  const pool = await getPool();
  await ensureInvoiceAccess(org_id, invoice_id, pool);

  // Get invoice currency for exchange rate calculation
  const invoice = await pool.request()
    .input('invoiceId', sql.BigInt, invoice_id)
    .query('SELECT currency, outstanding_amount FROM app.invoice WHERE invoice_id = @invoiceId');

  const invoiceCurrency = invoice.recordset[0]?.currency || 'USD';
  const exchangeRate = currency !== invoiceCurrency ? await getExchangeRate(currency, invoiceCurrency, payment_date) : 1.0;
  const amountBase = amount * exchangeRate;

  const result = await pool.request()
    .input('orgId', sql.Int, org_id)
    .input('invoiceId', sql.BigInt, invoice_id)
    .input('amount', sql.Decimal(12,2), amount)
    .input('currency', sql.VarChar(3), currency || 'USD')
    .input('exchangeRate', sql.Decimal(10,6), exchangeRate)
    .input('amountBase', sql.Decimal(12,2), amountBase)
    .input('paymentMethod', sql.VarChar(20), payment_method)
    .input('paymentDate', sql.DateTime2, payment_date || new Date())
    .input('referenceNumber', sql.NVarChar(100), reference_number)
    .input('notes', sql.NVarChar(500), notes)
    .query(`
      INSERT INTO app.payment (
        org_id, invoice_id, amount, currency, exchange_rate, amount_base,
        payment_method, payment_date, reference_number, notes, created_at
      )
      OUTPUT INSERTED.*
      VALUES (
        @orgId, @invoiceId, @amount, @currency, @exchangeRate, @amountBase,
        @paymentMethod, @paymentDate, @referenceNumber, @notes, SYSUTCDATETIME()
      )
    `);

  // Update invoice paid amount
  await pool.request()
    .input('invoiceId', sql.BigInt, invoice_id)
    .input('amountBase', sql.Decimal(12,2), amountBase)
    .query(`
      UPDATE app.invoice
      SET paid_amount = ISNULL(paid_amount, 0) + @amountBase,
          status = CASE
            WHEN outstanding_amount - @amountBase <= 0 THEN 'paid'
            ELSE status
          END
      WHERE invoice_id = @invoiceId
    `);

  ok(res, result.recordset[0], 201);
}));

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

async function calculateInvoiceAmounts(orgId: number, contractId: number, startDate: string, endDate: string, pool: any) {
  // Calculate from approved time entries
  const timeTotal = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('contractId', sql.BigInt, contractId)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      SELECT ISNULL(SUM(te.hours * te.bill_rate_snapshot), 0) as time_total
      FROM app.time_entry te
      JOIN app.assignment a ON te.assignment_id = a.assignment_id
      JOIN app.contract c ON a.engagement_id = c.engagement_id
      WHERE te.org_id = @orgId AND c.contract_id = @contractId
        AND te.approved_at IS NOT NULL
        AND te.entry_date BETWEEN @startDate AND @endDate
        AND te.invoice_line_id IS NULL
    `);

  // Calculate from completed milestones
  const milestoneTotal = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('contractId', sql.BigInt, contractId)
    .query(`
      SELECT ISNULL(SUM(cm.amount), 0) as milestone_total
      FROM app.contract_milestone cm
      WHERE cm.org_id = @orgId AND cm.contract_id = @contractId
        AND cm.status = 'completed'
        AND cm.completed_at BETWEEN @startDate AND @endDate
    `);

  const subtotal = timeTotal.recordset[0].time_total + milestoneTotal.recordset[0].milestone_total;
  const tax = 0; // Would implement tax calculation logic here

  return { subtotal, tax, total: subtotal + tax };
}

async function createInvoiceLineItems(orgId: number, invoiceId: number, contractId: number, startDate: string, endDate: string, pool: any) {
  // Create time entry line items
  await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('invoiceId', sql.BigInt, invoiceId)
    .input('contractId', sql.BigInt, contractId)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query(`
      INSERT INTO app.invoice_line_item (
        org_id, invoice_id, line_type, description, quantity, unit_price, line_total,
        time_entry_id, assignment_id, period_start, period_end, created_at
      )
      SELECT
        @orgId, @invoiceId, 'time',
        CONCAT(p.name, ' - ', rt.name, ' (', CONVERT(varchar, te.entry_date, 101), ')'),
        te.hours, te.bill_rate_snapshot, te.hours * te.bill_rate_snapshot,
        te.time_entry_id, te.assignment_id, @startDate, @endDate, SYSUTCDATETIME()
      FROM app.time_entry te
      JOIN app.assignment a ON te.assignment_id = a.assignment_id
      JOIN app.person p ON a.person_id = p.person_id
      JOIN app.role_template rt ON a.role_template_id = rt.role_template_id
      JOIN app.contract c ON a.engagement_id = c.engagement_id
      WHERE te.org_id = @orgId AND c.contract_id = @contractId
        AND te.approved_at IS NOT NULL
        AND te.entry_date BETWEEN @startDate AND @endDate
        AND te.invoice_line_id IS NULL
    `);

  // Mark time entries as invoiced
  await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('invoiceId', sql.BigInt, invoiceId)
    .query(`
      UPDATE app.time_entry
      SET invoice_line_id = (
        SELECT ili.invoice_line_item_id
        FROM app.invoice_line_item ili
        WHERE ili.time_entry_id = app.time_entry.time_entry_id
      )
      WHERE org_id = @orgId
        AND time_entry_id IN (
          SELECT time_entry_id FROM app.invoice_line_item WHERE invoice_id = @invoiceId
        )
    `);
}

async function getExchangeRate(_fromCurrency: string, _toCurrency: string, _date: string): Promise<number> {
  // Simplified - would integrate with currency API
  return 1.0;
}

export default router;
