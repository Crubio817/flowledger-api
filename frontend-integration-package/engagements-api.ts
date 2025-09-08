import { z } from 'zod';

// Zod schemas for type validation
export const EngagementSchema = z.object({
  id: z.number(),
  client_id: z.number(),
  type: z.enum(['project', 'audit', 'job']),
  name: z.string(),
  owner_id: z.number(),
  status: z.enum(['active', 'on_hold', 'completed', 'cancelled']),
  health: z.enum(['green', 'yellow', 'red']),
  start_at: z.string().datetime(),
  due_at: z.string().datetime().optional(),
  contract_id: z.number().optional(),
  created_at: z.string().datetime(),
  client_name: z.string(),
  progress_pct: z.number().optional()
});

export const FeatureSchema = z.object({
  feature_id: z.number(),
  engagement_id: z.number(),
  title: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  state: z.enum(['todo', 'in_progress', 'done']),
  due_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional()
});

export const MilestoneSchema = z.object({
  milestone_id: z.number(),
  engagement_id: z.number(),
  name: z.string(),
  type: z.string(),
  status: z.enum(['planned', 'active', 'completed']),
  due_at: z.string().datetime(),
  created_at: z.string().datetime()
});

export const ChangeRequestSchema = z.object({
  change_request_id: z.number(),
  engagement_id: z.number(),
  origin: z.string(),
  scope_delta: z.string().optional(),
  hours_delta: z.number().optional(),
  value_delta: z.number().optional(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected']),
  created_by: z.number(),
  created_at: z.string().datetime(),
  decided_at: z.string().datetime().optional()
});

// API client functions
export class EngagementsApi {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  // Engagements
  async getEngagements(params?: {
    org_id: number;
    type?: 'project' | 'audit' | 'job';
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

    const response = await fetch(`${this.baseUrl}/engagements?${query}`);
    if (!response.ok) throw new Error('Failed to fetch engagements');
    return response.json();
  }

  async createEngagement(data: {
    org_id: number;
    client_id: number;
    type: 'project' | 'audit' | 'job';
    name: string;
    owner_id: number;
    start_at: string;
    due_at?: string;
    contract_id?: number;
  }) {
    const response = await fetch(`${this.baseUrl}/engagements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create engagement');
    return response.json();
  }

  async updateEngagementStatus(id: number, status: string, org_id: number) {
    const response = await fetch(`${this.baseUrl}/engagements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, org_id })
    });
    if (!response.ok) throw new Error('Failed to update engagement');
    return response.json();
  }

  // Features
  async createFeature(engagementId: number, data: {
    title: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    due_at?: string;
    org_id: number;
  }) {
    const response = await fetch(`${this.baseUrl}/engagements/${engagementId}/features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create feature');
    return response.json();
  }

  async updateFeatureState(engagementId: number, featureId: number, state: string, org_id: number) {
    const response = await fetch(`${this.baseUrl}/engagements/${engagementId}/features/${featureId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, org_id })
    });
    if (!response.ok) throw new Error('Failed to update feature');
    return response.json();
  }

  // Milestones
  async createMilestone(engagementId: number, data: {
    name: string;
    type: string;
    due_at: string;
    org_id: number;
  }) {
    const response = await fetch(`${this.baseUrl}/engagements/${engagementId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create milestone');
    return response.json();
  }

  // Dependencies
  async createDependency(engagementId: number, data: {
    from_type: string;
    from_id: number;
    to_type: string;
    to_id: number;
    dep_type: 'FS' | 'SS' | 'FF' | 'SF';
    lag_days?: number;
    org_id: number;
  }) {
    const response = await fetch(`${this.baseUrl}/engagements/${engagementId}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create dependency');
    return response.json();
  }

  // Change Requests
  async createChangeRequest(engagementId: number, data: {
    origin: string;
    scope_delta?: string;
    hours_delta?: number;
    value_delta?: number;
    org_id: number;
  }) {
    const response = await fetch(`${this.baseUrl}/engagements/${engagementId}/change-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create change request');
    return response.json();
  }

  async updateChangeRequest(engagementId: number, crId: number, data: {
    status?: string;
    scope_delta?: string;
    hours_delta?: number;
    value_delta?: number;
    org_id: number;
  }) {
    const response = await fetch(`${this.baseUrl}/engagements/${engagementId}/change-requests/${crId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update change request');
    return response.json();
  }
}

// React hooks for engagements
export function useEngagementsApi() {
  return new EngagementsApi();
}

// Type exports
export type Engagement = z.infer<typeof EngagementSchema>;
export type Feature = z.infer<typeof FeatureSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type ChangeRequest = z.infer<typeof ChangeRequestSchema>;
