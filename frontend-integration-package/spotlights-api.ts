import { api } from './api';

// Spotlight types
export interface Spotlight {
  spotlight_id: number;
  name: string;
  domain: string;
  description?: string;
  active: boolean;
  created_at: string;
  updated_at?: string;
  field_count?: number;
}

export interface SpotlightField {
  field_id: number;
  field_name: string;
  field_type: string;
  is_required: boolean;
  display_order: number;
  enum_values?: string[];
  domain?: string;
}

export interface SpotlightValue {
  field_id: number;
  field_name: string;
  field_type: string;
  is_required: boolean;
  display_order: number;
  enum_values?: string[];
  value?: string;
}

export interface SpotlightDetail extends Spotlight {
  fields: SpotlightValue[];
}

export interface SpotlightPerformance {
  spotlight_id: number;
  name: string;
  domain: string;
  active: boolean;
  performance: {
    completion_rate: number;
    average_match_score: number;
    total_evaluations: number;
    configured_fields: number;
    populated_fields: number;
  };
  recent_evaluations: Array<{
    match_score: number;
    evaluated_at: string;
  }>;
}

export interface ScoreComponent {
  component_id: number;
  org_id: number;
  item_type: string;
  item_id: number;
  spotlight_id: number;
  component_name: string;
  component_score: number;
  component_weight: number;
  component_reason: string;
  max_possible_score: number;
  scored_at: string;
  algorithm_version: string;
  field_type?: string;
  is_required?: boolean;
  enum_values?: string[];
}

// API methods
export async function getSpotlights(params?: {
  org_id: number;
  domain?: string;
  active?: boolean;
  page?: number;
  limit?: number;
}) {
  const response = await api.get('/spotlights', { params });
  return response.data.data;
}

export async function getSpotlight(id: number, params: { org_id: number }) {
  const response = await api.get(`/spotlights/${id}`, { params });
  return response.data.data;
}

export async function createSpotlight(data: {
  org_id: number;
  name: string;
  domain: string;
  description?: string;
}) {
  const response = await api.post('/spotlights', data);
  return response.data.data;
}

export async function updateSpotlight(id: number, data: {
  org_id: number;
  name?: string;
  domain?: string;
  description?: string;
  active?: boolean;
  field_values?: Record<string, any>;
}) {
  const response = await api.put(`/spotlights/${id}`, data);
  return response.data.data;
}

export async function getSpotlightDomains(params: { org_id: number }) {
  const response = await api.get('/spotlights/domains', { params });
  return response.data.data;
}

export async function getSpotlightFields(params: {
  org_id: number;
  domain?: string;
}) {
  const response = await api.get('/spotlights/fields', { params });
  return response.data.data;
}

export async function createSpotlightField(data: {
  org_id: number;
  domain?: string;
  field_name: string;
  field_type: string;
  is_required?: boolean;
  display_order?: number;
  enum_values?: string[];
}) {
  const response = await api.post('/spotlights/fields', data);
  return response.data.data;
}

export async function getSpotlightAnalytics(params: { org_id: number }) {
  const response = await api.get('/spotlights/analytics', { params });
  return response.data.data;
}

export async function getSpotlightPerformance(id: number, params: { org_id: number }) {
  const response = await api.get(`/spotlights/${id}/performance`, { params });
  return response.data.data;
}

export async function evaluateSpotlight(id: number, data: {
  org_id: number;
  signal_data: Record<string, any>;
}) {
  const response = await api.post(`/spotlights/${id}/evaluate`, data);
  return response.data.data;
}

export async function cloneSpotlight(id: number, data: {
  org_id: number;
  name: string;
}) {
  const response = await api.post(`/spotlights/${id}/clone`, data);
  return response.data.data;
}

export async function getSpotlightScoreComponents(id: number, params: { org_id: number }) {
  const response = await api.get(`/spotlights/${id}/score-components`, { params });
  return response.data.data;
}

export async function addSpotlightScoreComponent(id: number, data: {
  org_id: number;
  component_name: string;
  component_weight?: number;
  max_possible_score?: number;
}) {
  const response = await api.post(`/spotlights/${id}/score-components`, data);
  return response.data.data;
}
