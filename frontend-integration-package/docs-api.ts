import { z } from 'zod';

// Zod schemas for type validation
export const DocumentSchema = z.object({
  id: z.number(),
  title: z.string(),
  type: z.enum(['proposal', 'sow', 'report', 'runbook', 'evidence', 'invoice_pdf', 'contract', 'note']),
  status: z.enum(['draft', 'in_review', 'approved', 'released', 'archived']),
  classification: z.enum(['internal', 'client_view', 'confidential']),
  source: z.enum(['file', 'generated', 'external_link']),
  storage_url: z.string().optional(),
  mime_type: z.string().optional(),
  size_bytes: z.number().optional(),
  created_by_user_id: z.number(),
  created_at: z.string().datetime(),
  latest_version: z.number().optional(),
  hash_sha256: z.string().optional()
});

export const DocumentVersionSchema = z.object({
  id: z.number(),
  document_id: z.number(),
  vnum: z.number(),
  author_id: z.number(),
  change_note: z.string().optional(),
  storage_ref: z.string(),
  hash_sha256: z.string(),
  approved_by_user_id: z.number().optional(),
  approved_at: z.string().datetime().optional(),
  signature_ref: z.string().optional(),
  created_at: z.string().datetime()
});

export const ShareLinkSchema = z.object({
  id: z.number(),
  document_id: z.number().optional(),
  binder_id: z.number().optional(),
  token: z.string(),
  scope: z.enum(['client', 'external_email']),
  expires_at: z.string().datetime().optional(),
  watermark: z.boolean(),
  viewed_count: z.number(),
  last_viewed_at: z.string().datetime().optional(),
  created_at: z.string().datetime()
});

// API client functions
export class DocsApi {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  // Documents
  async getDocuments(params?: {
    org_id: number;
    type?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) query.set(key, String(value));
      });
    }

    const response = await fetch(`${this.baseUrl}/docs?${query}`);
    if (!response.ok) throw new Error('Failed to fetch documents');
    return response.json();
  }

  async createDocument(data: {
    org_id: number;
    title: string;
    type: 'proposal' | 'sow' | 'report' | 'runbook' | 'evidence' | 'invoice_pdf' | 'contract' | 'note';
    source: 'file' | 'generated' | 'external_link';
    storage_url?: string;
    mime_type?: string;
    size_bytes?: number;
  }) {
    const response = await fetch(`${this.baseUrl}/docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create document');
    return response.json();
  }

  async updateDocumentStatus(id: number, status: string, org_id: number) {
    const response = await fetch(`${this.baseUrl}/docs/${id}/status?org_id=${org_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!response.ok) throw new Error('Failed to update document status');
    return response.json();
  }

  // Versions
  async addDocumentVersion(id: number, data: {
    org_id: number;
    storage_ref: string;
    hash_sha256: string;
    change_note?: string;
  }) {
    const response = await fetch(`${this.baseUrl}/docs/${id}/versions?org_id=${data.org_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storage_ref: data.storage_ref,
        hash_sha256: data.hash_sha256,
        change_note: data.change_note
      })
    });
    if (!response.ok) throw new Error('Failed to add document version');
    return response.json();
  }

  // Share Links
  async createShareLink(id: number, data: {
    org_id: number;
    scope: 'client' | 'external_email';
    expires_at?: string;
    watermark?: boolean;
  }) {
    const response = await fetch(`${this.baseUrl}/docs/${id}/share?org_id=${data.org_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: data.scope,
        expires_at: data.expires_at,
        watermark: data.watermark
      })
    });
    if (!response.ok) throw new Error('Failed to create share link');
    return response.json();
  }
}

// React hooks for docs
export function useDocsApi() {
  return new DocsApi();
}

// Type exports
export type Document = z.infer<typeof DocumentSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type ShareLink = z.infer<typeof ShareLinkSchema>;
