import axios from 'axios';

// Success envelope shapes as emitted by backend
export interface ListEnvelope<T> { status: 'ok'; data: T[]; meta?: { page: number; limit: number; total?: number }; }
export interface ItemEnvelope<T> { status: 'ok'; data: T }

const api = axios.create({
  baseURL: 'http://localhost:4001/api'
});

// Export the api instance for use in other modules
export { api };

// Specific convenience functions
export async function getDashboardStats() {
  const response = await api.get('/dashboard-stats');
  return response.data.data;
}

export async function getRecentAudits(limit = 5) {
  const response = await api.get('/audit-recent-touch', { params: { limit } });
  return response.data.data;
}

export async function getClients(limit = 20) {
  const response = await api.get('/clients', { params: { limit } });
  return response.data.data;
}

export async function getClientsOverview(limit = 20) {
  const response = await api.get('/clients-overview', { params: { limit } });
  return response.data.data;
}

// Industries API
export async function getIndustries(params?: { q?: string; include_inactive?: boolean; page?: number; limit?: number }) {
  const response = await api.get('/industries', { params });
  return response.data.data;
}

export async function createIndustry(data: { name: string; description?: string; is_active?: boolean }) {
  const response = await api.post('/industries', data);
  return response.data.data;
}

export async function updateIndustry(industryId: number, data: Partial<{ name: string; description?: string; is_active?: boolean }>) {
  const response = await api.put(`/industries/${industryId}`, data);
  return response.data.data;
}

export async function deleteIndustry(industryId: number) {
  const response = await api.delete(`/industries/${industryId}`);
  return response.data;
}

// Client Industries API
export async function getClientIndustries(clientId: number) {
  const response = await api.get(`/clients/${clientId}/industries`);
  return response.data.data;
}

export async function addIndustryToClient(clientId: number, data: { industry_id: number; is_primary?: boolean }) {
  const response = await api.post(`/clients/${clientId}/industries`, data);
  return response.data.data;
}

// Client Notes API
export async function getClientNotes(clientId: number, params?: { note_type?: string; page?: number; limit?: number }) {
  const response = await api.get(`/clients/${clientId}/notes`, { params });
  return response.data.data;
}

export async function createClientNote(clientId: number, data: {
  title: string;
  content?: string;
  note_type?: string;
  is_important?: boolean;
  is_active?: boolean;
  created_by?: string;
}) {
  const response = await api.post(`/clients/${clientId}/notes`, data);
  return response.data.data;
}

export async function updateClientNote(clientId: number, noteId: number, data: Partial<{
  title?: string;
  content?: string;
  note_type?: string;
  is_important?: boolean;
  is_active?: boolean;
  updated_by?: string;
}>) {
  const response = await api.put(`/clients/${clientId}/notes/${noteId}`, data);
  return response.data.data;
}

export async function deleteClientNote(clientId: number, noteId: number) {
  const response = await api.delete(`/clients/${clientId}/notes/${noteId}`);
  return response.data;
}

// Client Tags API
export async function getClientTags(params?: { page?: number; limit?: number }) {
  const response = await api.get('/client-tags', { params });
  return response.data.data;
}

export async function createClientTag(data: { tag_name: string }) {
  const response = await api.post('/client-tags', data);
  return response.data.data;
}

// Client Contacts API
export async function getClientContacts(params?: { page?: number; limit?: number }) {
  const response = await api.get('/client-contacts', { params });
  return response.data.data;
}

export async function createClientContact(data: {
  client_id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  title?: string;
  is_primary?: boolean;
  is_active?: boolean;
}) {
  const response = await api.post('/client-contacts', data);
  return response.data.data;
}

// Contact Social Profiles API
export async function getContactSocialProfiles(params?: { page?: number; limit?: number }) {
  const response = await api.get('/contact-social-profiles', { params });
  return response.data.data;
}

export async function createContactSocialProfile(data: {
  contact_id: number;
  provider: string;
  profile_url: string;
  is_primary?: boolean;
}) {
  const response = await api.post('/contact-social-profiles', data);
  return response.data.data;
}

// Client Creation via Stored Procedure
export async function createClientViaProcedure(data: {
  Name: string;
  IsActive?: boolean;
  PackCode?: string | null;
  PrimaryContactId?: number | null;
  OwnerUserId?: number | null;
}) {
  const response = await api.post('/clients/create-proc', data);
  return response.data;
}

// ==========================================
// IDENTITY & COMMS HUB API METHODS
// ==========================================

// Principals API
export async function getPrincipals(params?: {
  org_id?: number;
  page?: number;
  limit?: number;
  principal_type?: string;
  is_active?: boolean;
}) {
  const response = await api.get('/principals', { params });
  return response.data.data;
}

export async function getPrincipal(principalId: number, params?: { org_id?: number }) {
  const response = await api.get(`/principals/${principalId}`, { params });
  return response.data.data;
}

export async function createPrincipal(data: {
  org_id: number;
  principal_type: 'person' | 'service' | 'team';
  display_name?: string;
  primary_email?: string;
  is_internal?: boolean;
}) {
  const response = await api.post('/principals', data);
  return response.data.data;
}

export async function updatePrincipal(principalId: number, data: {
  display_name?: string;
  primary_email?: string;
  is_active?: boolean;
}) {
  const response = await api.patch(`/principals/${principalId}`, data);
  return response.data.data;
}

export async function deletePrincipal(principalId: number) {
  const response = await api.delete(`/principals/${principalId}`);
  return response.data;
}

// Communications API
export async function getCommsThreads(params?: {
  org_id?: number;
  page?: number;
  limit?: number;
  mailbox_id?: number;
  client_id?: number;
  status?: string;
  process_state?: string;
  assigned_principal_id?: number;
  tag?: string;
}) {
  const response = await api.get('/comms/threads', { params });
  return response.data.data;
}

export async function getCommsThread(threadId: number, params?: {
  org_id?: number;
  page?: number;
  limit?: number;
}) {
  const response = await api.get(`/comms/threads/${threadId}`, { params });
  return response.data.data;
}

export async function updateCommsThread(threadId: number, data: {
  status?: 'active' | 'pending' | 'resolved' | 'escalated' | 'on_hold' | 'reopened';
  process_state?: 'triage' | 'in_processing' | 'queued' | 'done' | 'archived';
  assigned_principal_id?: number;
  tags?: string[];
}) {
  const response = await api.patch(`/comms/threads/${threadId}`, data);
  return response.data.data;
}

export async function replyToCommsThread(threadId: number, data: {
  org_id: number;
  body: string;
  attachments?: {
    name: string;
    mime_type: string;
    size_bytes: number;
    blob_url: string;
  }[];
}) {
  const response = await api.post(`/comms/threads/${threadId}/reply`, data);
  return response.data.data;
}

export async function linkCommsThread(threadId: number, data: {
  org_id: number;
  item_type: string;
  item_id: number;
}) {
  const response = await api.post(`/comms/threads/${threadId}/link`, data);
  return response.data.data;
}

export async function saveAttachmentAsDoc(attachmentId: number, data: {
  org_id: number;
}) {
  const response = await api.post(`/comms/attachments/${attachmentId}/save-as-doc`, data);
  return response.data.data;
}

// ==========================================
// BILLING & CONTRACTS API METHODS
// ==========================================

// Type definitions for billing entities
export interface Contract {
  id: number;
  client_id: number;
  engagement_id?: number;
  contract_type: 'time_materials' | 'fixed_price' | 'milestone' | 'retainer' | 'prepaid';
  currency: string;
  start_date: string;
  end_date?: string;
  status: 'draft' | 'active' | 'completed' | 'terminated';
  total_amount?: number;
  billing_terms?: any;
  retainer_amount?: number;
  retainer_period?: string;
  included_hours?: number;
  prepayment_balance?: number;
  budget_cap?: number;
  created_at: string;
  client_name: string;
  engagement_name?: string;
  current_spend?: number;
}

export interface TimeEntry {
  id: number;
  assignment_id: number;
  hours: number;
  entry_date: string;
  description: string;
  approved_at?: string;
  approved_by?: number;
  bill_rate_snapshot: number;
  cost_rate_snapshot: number;
  currency_snapshot: string;
  notes?: string;
  created_at: string;
  person_name: string;
  role_name: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  contract_id?: number;
  engagement_id?: number;
  start_date: string;
  end_date: string;
  total_amount: number;
  tax_amount: number;
  discount_amount?: number;
  paid_amount: number;
  outstanding_amount: number;
  currency: string;
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'voided';
  sent_at?: string;
  due_date?: string;
  created_at: string;
  contract_type?: string;
  client_name: string;
  engagement_name?: string;
}

export interface Payment {
  id: number;
  invoice_id: number;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_base: number;
  payment_method: 'check' | 'wire' | 'credit_card' | 'ach' | 'cash' | 'other';
  payment_date: string;
  reference_number?: string;
  notes?: string;
  created_at: string;
}

export interface ContractMilestone {
  id: number;
  contract_id: number;
  name: string;
  description?: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  completed_at?: string;
  created_at: string;
}

// Contracts API
export async function getContracts(params?: {
  org_id: number;
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}) {
  const response = await api.get('/billing/contracts', { params });
  return response.data.data;
}

export async function getContract(id: number, params?: { org_id: number }) {
  const response = await api.get(`/billing/contracts/${id}`, { params });
  return response.data.data;
}

export async function createContract(data: {
  org_id: number;
  client_id: number;
  engagement_id?: number;
  contract_type: 'time_materials' | 'fixed_price' | 'milestone' | 'retainer' | 'prepaid';
  title?: string;
  description?: string;
  currency?: string;
  total_value?: number;
  start_date: string;
  end_date?: string;
  billing_cycle?: 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'one_time';
  payment_terms?: string;
  billing_terms?: any;
  retainer_amount?: number;
  retainer_period?: string;
  included_hours?: number;
  prepayment_balance?: number;
  budget_cap?: number;
}) {
  const response = await api.post('/billing/contracts', data);
  return response.data.data;
}

export async function updateContract(id: number, data: Partial<{
  title?: string;
  description?: string;
  status?: string;
  end_date?: string;
  actual_end_date?: string;
  total_value?: number;
  currency?: string;
  billing_cycle?: string;
  payment_terms?: string;
  org_id: number;
}>) {
  const response = await api.patch(`/billing/contracts/${id}`, data);
  return response.data.data;
}

export async function updateContractStatus(id: number, status: string, org_id: number) {
  const response = await api.patch(`/billing/contracts/${id}`, { status, org_id });
  return response.data.data;
}

// Time Entries API
export async function getTimeEntries(params?: {
  org_id: number;
  assignment_id?: number;
  contract_id?: number;
  status?: string;
  approved?: string;
  page?: number;
  limit?: number;
}) {
  const response = await api.get('/billing/time-entries', { params });
  return response.data.data;
}

export async function getTimeEntry(id: number, params?: { org_id: number }) {
  const response = await api.get(`/billing/time-entries/${id}`, { params });
  return response.data.data;
}

export async function createTimeEntry(data: {
  org_id: number;
  contract_id: number;
  assignment_id: number;
  date: string;
  hours: number;
  description: string;
  billable_rate?: number;
  is_billable?: boolean;
  notes?: string;
}) {
  const response = await api.post('/billing/time-entries', data);
  return response.data.data;
}

export async function updateTimeEntry(id: number, data: Partial<{
  date?: string;
  hours?: number;
  description?: string;
  billable_rate?: number;
  is_billable?: boolean;
  status?: string;
  notes?: string;
  org_id: number;
}>) {
  const response = await api.patch(`/billing/time-entries/${id}`, data);
  return response.data.data;
}

export async function approveTimeEntry(id: number, org_id: number, user_id?: number) {
  const response = await api.patch(`/billing/time-entries/${id}/approve`, { org_id, user_id });
  return response.data.data;
}

export async function approveTimeEntries(data: {
  org_id: number;
  time_entry_ids: number[];
  approved_by?: number;
}) {
  const response = await api.post('/billing/time-entries/approve-batch', data);
  return response.data.data;
}

// Invoices API
export async function getInvoices(params?: {
  org_id: number;
  status?: string;
  contract_id?: number;
  page?: number;
  limit?: number;
}) {
  const response = await api.get('/billing/invoices', { params });
  return response.data.data;
}

export async function getInvoice(id: number, params?: { org_id: number }) {
  const response = await api.get(`/billing/invoices/${id}`, { params });
  return response.data.data;
}

export async function createInvoice(data: {
  org_id: number;
  contract_id: number;
  time_entry_ids?: number[];
  invoice_date?: string;
  due_date?: string;
  notes?: string;
  po_number?: string;
}) {
  const response = await api.post('/billing/invoices', data);
  return response.data.data;
}

export async function updateInvoice(id: number, data: Partial<{
  status?: string;
  due_date?: string;
  notes?: string;
  po_number?: string;
  org_id: number;
}>) {
  const response = await api.patch(`/billing/invoices/${id}`, data);
  return response.data.data;
}

export async function updateInvoiceStatus(id: number, status: string, org_id: number) {
  const response = await api.patch(`/billing/invoices/${id}/status`, { status, org_id });
  return response.data.data;
}

export async function sendInvoice(id: number, data: {
  org_id: number;
  email_recipients?: string[];
  email_subject?: string;
  email_body?: string;
}) {
  const response = await api.post(`/billing/invoices/${id}/send`, data);
  return response.data.data;
}

export async function generateInvoice(data: {
  org_id: number;
  contract_id: number;
  time_entry_ids: number[];
  invoice_date?: string;
  due_date?: string;
  notes?: string;
}) {
  const response = await api.post('/billing/invoices/generate', data);
  return response.data.data;
}

// Payments API
export async function getPayments(params?: {
  org_id: number;
  invoice_id?: number;
  page?: number;
  limit?: number;
}) {
  const response = await api.get('/billing/payments', { params });
  return response.data.data;
}

export async function createPayment(data: {
  org_id: number;
  invoice_id: number;
  amount: number;
  currency?: string;
  payment_method: 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'wire_transfer' | 'other';
  payment_date?: string;
  reference_number?: string;
  notes?: string;
}) {
  const response = await api.post('/billing/payments', data);
  return response.data.data;
}

// Contract Milestones API
export async function getContractMilestones(contractId: number, params?: { org_id: number }) {
  const response = await api.get(`/billing/contracts/${contractId}/milestones`, { params });
  return response.data.data;
}

export async function createContractMilestone(contractId: number, data: {
  org_id: number;
  name: string;
  description?: string;
  amount: number;
  due_date: string;
}) {
  const response = await api.post(`/billing/contracts/${contractId}/milestones`, data);
  return response.data.data;
}

export async function updateContractMilestone(contractId: number, milestoneId: number, data: {
  status?: string;
  completed_at?: string;
  org_id: number;
}) {
  const response = await api.patch(`/billing/contracts/${contractId}/milestones/${milestoneId}`, data);
  return response.data.data;
}

// Revenue Recognition API
export async function getRevenueRecognition(params?: {
  org_id: number;
  contract_id?: number;
  period_start?: string;
  period_end?: string;
  page?: number;
  limit?: number;
}) {
  const response = await api.get('/billing/revenue-recognition', { params });
  return response.data.data;
}

export async function calculateRevenueRecognition(data: {
  org_id: number;
  contract_id: number;
  period_start: string;
  period_end: string;
}) {
  const response = await api.post('/billing/revenue-recognition/calculate', data);
  return response.data.data;
}

// Billing Reports API
export async function getBillingReports(params?: {
  org_id: number;
  report_type: 'outstanding' | 'revenue' | 'utilization' | 'aging';
  period_start?: string;
  period_end?: string;
  page?: number;
  limit?: number;
}) {
  const response = await api.get('/billing/reports', { params });
  return response.data.data;
}

// Exchange Rates API
export async function getExchangeRates(params?: {
  base_currency?: string;
  date?: string;
}) {
  const response = await api.get('/billing/exchange-rates', { params });
  return response.data.data;
}

// Automation API
export async function getAutomationRules(params: { org_id: number }) {
  const response = await api.get('/automation/rules', { params });
  return response.data.data;
}

export async function createAutomationRule(data: {
  org_id: number;
  name: string;
  is_enabled?: boolean;
  trigger: any;
  conditions?: any;
  throttle?: any;
  actions: any[];
}) {
  const response = await api.post('/automation/rules', data);
  return response.data.data;
}

export async function updateAutomationRule(ruleId: number, data: {
  org_id: number;
  name?: string;
  is_enabled?: boolean;
  trigger?: any;
  conditions?: any;
  throttle?: any;
  actions?: any[];
}) {
  const response = await api.patch(`/automation/rules/${ruleId}`, data);
  return response.data.data;
}

export async function deleteAutomationRule(ruleId: number, data: { org_id: number }) {
  const response = await api.delete(`/automation/rules/${ruleId}`, { data });
  return response.data;
}

export async function testAutomationRule(data: {
  org_id: number;
  rule: any;
  sample_event: any;
}) {
  const response = await api.post('/automation/test', data);
  return response.data.data;
}

export async function getAutomationLogs(params: {
  org_id: number;
  rule_id?: number;
  event_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const response = await api.get('/automation/logs', { params });
  return response.data.data;
}

export async function ingestAutomationEvent(data: {
  type: string;
  tenant_id: number;
  aggregate_type?: string;
  aggregate_id?: number;
  payload?: any;
  source: string;
  correlation_id?: string;
  dedupe_key?: string;
}) {
  const response = await api.post('/automation/events', data);
  return response.data.data;
}
