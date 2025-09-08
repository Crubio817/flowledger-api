import axios from 'axios';

// Success envelope shapes as emitted by backend
export interface ListEnvelope<T> { status: 'ok'; data: T[]; meta?: { page: number; limit: number; total?: number }; }
export interface ItemEnvelope<T> { status: 'ok'; data: T }

export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE || 'http://localhost:4001') + '/api'
});

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
