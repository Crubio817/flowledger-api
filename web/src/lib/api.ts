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
  LogoUrl?: string | null;
}) {
  const response = await api.post('/clients/create-proc', data);
  return response.data;
}

// Fetch client data from URL
export async function fetchClientFromUrl(url: string) {
  const response = await api.post('/clients/fetch-from-url', { url });
  return response.data.data;
}
