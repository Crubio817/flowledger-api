import axios from 'axios';
import type { paths, components } from './api-types';

// Success envelope shapes as emitted by backend
export interface ListEnvelope<T> { status: 'ok'; data: T[]; meta?: components['schemas']['PageMeta']; }
export interface ItemEnvelope<T> { status: 'ok'; data: T }

export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE || 'http://localhost:4000') + '/api'
});

// Helper to extract typed response bodies
type SuccessResponse<R> = R extends { responses: { 200: { content: { 'application/json': infer B } } } } ? B : never;

// Typed GET wrapper using path key of generated paths
export async function getPath<P extends keyof paths, M extends keyof paths[P] & 'get'>(path: P, params?: any): Promise<SuccessResponse<paths[P][M]>> {
  const res = await api.get(path as string, { params });
  return res.data;
}

// Specific convenience functions
export async function getDashboardStats() {
  const r = await getPath('/api/dashboard-stats');
  return (r as ItemEnvelope<components['schemas']['DashboardStats']>).data;
}

export async function getRecentAudits(limit = 5) {
  const r = await getPath('/api/audit-recent-touch', { limit });
  return (r as ListEnvelope<components['schemas']['RecentAudit']>).data;
}

export async function getClients(limit = 20) {
  const r = await getPath('/api/clients', { limit });
  return (r as ListEnvelope<{ client_id: number; name: string; is_active: boolean; created_utc: string }>).data;
}

export async function getClientsOverview(limit = 20) {
  const r = await getPath('/api/clients-overview', { limit });
  return (r as ListEnvelope<components['schemas']['ClientsOverviewItem']>).data;
}
