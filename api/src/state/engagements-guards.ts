// src/state/engagements-guards.ts
import { sql } from '../db/pool';

export const ENGAGEMENT_TX = {
  active: ['paused', 'complete', 'cancelled'],
  paused: ['active', 'cancelled'],
  complete: [],
  cancelled: []
} as const;

export const FEATURE_TX = {
  todo: ['in_progress', 'blocked'],
  in_progress: ['blocked', 'review', 'done'],
  blocked: ['in_progress'],
  review: ['in_progress', 'done'],
  done: []
} as const;

export const STORY_TASK_TX = {
  todo: ['in_progress', 'blocked'],
  in_progress: ['review', 'blocked', 'done'],
  review: ['in_progress', 'done'],
  blocked: ['in_progress'],
  done: []
} as const;

export const AUDIT_STEP_TX = {
  todo: ['in_progress', 'blocked'],
  in_progress: ['done', 'blocked'],
  blocked: ['in_progress'],
  done: []
} as const;

export const JOB_TASK_TX = {
  todo: ['in_progress', 'blocked'],
  in_progress: ['done', 'blocked'],
  blocked: ['in_progress'],
  done: []
} as const;

export const MILESTONE_TX = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: [],
  cancelled: []
} as const;

export const CHANGE_REQUEST_TX = {
  draft: ['review'],
  review: ['approved', 'rejected'],
  approved: [],
  rejected: []
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
export async function ensureEngagementAccess(orgId: number, engagementId: number, pool: any) {
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('engagementId', sql.BigInt, engagementId)
    .query('SELECT engagement_id FROM app.engagement WHERE org_id = @orgId AND engagement_id = @engagementId');

  if (result.recordset.length === 0) {
    const e: any = new Error('Engagement not found or access denied');
    e.status = 404;
    throw e;
  }
}

export async function ensureFeatureAccess(orgId: number, featureId: number, pool: any) {
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('featureId', sql.BigInt, featureId)
    .query(`
      SELECT f.feature_id FROM app.feature f
      JOIN app.engagement e ON f.engagement_id = e.engagement_id
      WHERE f.org_id = @orgId AND f.feature_id = @featureId AND e.org_id = @orgId
    `);

  if (result.recordset.length === 0) {
    const e: any = new Error('Feature not found or access denied');
    e.status = 404;
    throw e;
  }
}

// Cycle detection for dependencies
export async function detectDependencyCycle(orgId: number, fromType: string, fromId: number, toType: string, toId: number, pool: any): Promise<boolean> {
  // Simple cycle detection using BFS
  const visited = new Set<string>();
  const queue: Array<{type: string, id: number}> = [{type: toType, id: toId}];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.type}-${current.id}`;

    if (visited.has(key)) continue;
    visited.add(key);

    // Check if we've reached the starting point
    if (current.type === fromType && current.id === fromId) {
      return true; // Cycle detected
    }

    // Find all dependencies from current item
    const deps = await pool.request()
      .input('orgId', sql.Int, orgId)
      .input('fromType', sql.VarChar(16), current.type)
      .input('fromId', sql.BigInt, current.id)
      .query('SELECT to_type, to_id FROM app.dependency WHERE org_id = @orgId AND from_type = @fromType AND from_id = @fromId');

    for (const dep of deps.recordset) {
      queue.push({type: dep.to_type, id: dep.to_id});
    }
  }

  return false; // No cycle
}
