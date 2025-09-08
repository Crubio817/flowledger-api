import { z } from 'zod';

// Zod schemas for type validation
export const ContractSchema = z.object({
  id: z.number(),
  client_id: z.number(),
  engagement_id: z.number().optional(),
  contract_type: z.enum(['time_materials', 'fixed_price', 'milestone', 'retainer', 'prepaid']),
  currency: z.string(),
  start_date: z.string().datetime(),
  end_date: z.string().datetime().optional(),
  status: z.enum(['draft', 'active', 'completed', 'terminated']),
  total_amount: z.number().optional(),
  billing_terms: z.any().optional(),
  retainer_amount: z.number().optional(),
  retainer_period: z.string().optional(),
  included_hours: z.number().optional(),
  prepayment_balance: z.number().optional(),
  budget_cap: z.number().optional(),
  created_at: z.string().datetime(),
  client_name: z.string(),
  engagement_name: z.string().optional(),
  current_spend: z.number().optional()
});

export const TimeEntrySchema = z.object({
  id: z.number(),
  assignment_id: z.number(),
  hours: z.number(),
  entry_date: z.string().datetime(),
  description: z.string(),
  approved_at: z.string().datetime().optional(),
  approved_by: z.number().optional(),
  bill_rate_snapshot: z.number(),
  cost_rate_snapshot: z.number(),
  currency_snapshot: z.string(),
  notes: z.string().optional(),
  created_at: z.string().datetime(),
  person_name: z.string(),
  role_name: z.string()
});

export const InvoiceSchema = z.object({
  id: z.number(),
  invoice_number: z.string(),
  contract_id: z.number().optional(),
  engagement_id: z.number().optional(),
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
  total_amount: z.number(),
  tax_amount: z.number(),
  discount_amount: z.number().optional(),
  paid_amount: z.number(),
  outstanding_amount: z.number(),
  currency: z.string(),
  status: z.enum(['draft', 'sent', 'viewed', 'paid', 'overdue', 'voided']),
  sent_at: z.string().datetime().optional(),
  due_date: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  contract_type: z.string().optional(),
  client_name: z.string(),
  engagement_name: z.string().optional()
});

export const PaymentSchema = z.object({
  id: z.number(),
  invoice_id: z.number(),
  amount: z.number(),
  currency: z.string(),
  exchange_rate: z.number(),
  amount_base: z.number(),
  payment_method: z.enum(['check', 'wire', 'credit_card', 'ach', 'cash', 'other']),
  payment_date: z.string().datetime(),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
  created_at: z.string().datetime()
});

export const ContractMilestoneSchema = z.object({
  id: z.number(),
  contract_id: z.number(),
  name: z.string(),
  description: z.string().optional(),
  amount: z.number(),
  due_date: z.string().datetime(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  completed_at: z.string().datetime().optional(),
  created_at: z.string().datetime()
});

// API client functions
export class BillingApi {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  // Contracts
  async getContracts(params?: {
    org_id: number;
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) query.set(key, String(value));
      });
    }

    const response = await fetch(`${this.baseUrl}/billing/contracts?${query}`);
    if (!response.ok) throw new Error('Failed to fetch contracts');
    return response.json();
  }

  async createContract(data: {
    org_id: number;
    client_id: number;
    engagement_id?: number;
    contract_type: 'time_materials' | 'fixed_price' | 'milestone' | 'retainer' | 'prepaid';
    currency?: string;
    start_date: string;
    end_date?: string;
    billing_terms?: any;
    retainer_amount?: number;
    retainer_period?: string;
    included_hours?: number;
    prepayment_balance?: number;
    budget_cap?: number;
  }) {
    const response = await fetch(`${this.baseUrl}/billing/contracts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create contract');
    return response.json();
  }

  async updateContractStatus(id: number, status: string, org_id: number) {
    const response = await fetch(`${this.baseUrl}/billing/contracts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, org_id })
    });
    if (!response.ok) throw new Error('Failed to update contract');
    return response.json();
  }

  // Time Entries
  async getTimeEntries(params?: {
    org_id: number;
    assignment_id?: number;
    approved?: string;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) query.set(key, String(value));
      });
    }

    const response = await fetch(`${this.baseUrl}/billing/time-entries?${query}`);
    if (!response.ok) throw new Error('Failed to fetch time entries');
    return response.json();
  }

  async createTimeEntry(data: {
    org_id: number;
    assignment_id: number;
    hours: number;
    entry_date: string;
    description: string;
    notes?: string;
  }) {
    const response = await fetch(`${this.baseUrl}/billing/time-entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create time entry');
    return response.json();
  }

  async approveTimeEntry(id: number, org_id: number, user_id?: number) {
    const response = await fetch(`${this.baseUrl}/billing/time-entries/${id}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id, user_id })
    });
    if (!response.ok) throw new Error('Failed to approve time entry');
    return response.json();
  }

  // Invoices
  async getInvoices(params?: {
    org_id: number;
    status?: string;
    contract_id?: number;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) query.set(key, String(value));
      });
    }

    const response = await fetch(`${this.baseUrl}/billing/invoices?${query}`);
    if (!response.ok) throw new Error('Failed to fetch invoices');
    return response.json();
  }

  async createInvoice(data: {
    org_id: number;
    contract_id: number;
    engagement_id?: number;
    start_date: string;
    end_date: string;
    due_date?: string;
    notes?: string;
    po_number?: string;
  }) {
    const response = await fetch(`${this.baseUrl}/billing/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create invoice');
    return response.json();
  }

  async updateInvoiceStatus(id: number, status: string, org_id: number) {
    const response = await fetch(`${this.baseUrl}/billing/invoices/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, org_id })
    });
    if (!response.ok) throw new Error('Failed to update invoice');
    return response.json();
  }

  // Payments
  async createPayment(data: {
    org_id: number;
    invoice_id: number;
    amount: number;
    currency?: string;
    payment_method: 'check' | 'wire' | 'credit_card' | 'ach' | 'cash' | 'other';
    payment_date?: string;
    reference_number?: string;
    notes?: string;
  }) {
    const response = await fetch(`${this.baseUrl}/billing/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create payment');
    return response.json();
  }

  // Contract Milestones
  async getContractMilestones(contractId: number, params?: { org_id: number }) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) query.set(key, String(value));
      });
    }

    const response = await fetch(`${this.baseUrl}/billing/contracts/${contractId}/milestones?${query}`);
    if (!response.ok) throw new Error('Failed to fetch contract milestones');
    return response.json();
  }

  async createContractMilestone(contractId: number, data: {
    org_id: number;
    name: string;
    description?: string;
    amount: number;
    due_date: string;
  }) {
    const response = await fetch(`${this.baseUrl}/billing/contracts/${contractId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create contract milestone');
    return response.json();
  }

  async updateContractMilestone(contractId: number, milestoneId: number, data: {
    status?: string;
    org_id: number;
  }) {
    const response = await fetch(`${this.baseUrl}/billing/contracts/${contractId}/milestones/${milestoneId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update contract milestone');
    return response.json();
  }
}

// React hooks for billing
export function useBillingApi() {
  return new BillingApi();
}

// Type exports
export type Contract = z.infer<typeof ContractSchema>;
export type TimeEntry = z.infer<typeof TimeEntrySchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type ContractMilestone = z.infer<typeof ContractMilestoneSchema>;
