# FlowLedger API - Engagements Module Documentation

## Overview

The Engagements module provides a **fully consolidated** system for managing audit, project, and job workflows under a single comprehensive umbrella. **Legacy tables have been removed** and the system now operates with complete data integrity and unified architecture.

**✅ SYSTEM STATUS: FULLY CONSOLIDATED**
- Legacy tables: **DROPPED**
- Unified schema: **ACTIVE**
- Data integrity: **MAINTAINED**
- API endpoints: **FUNCTIONAL**

## Architecture

### Core Tables

#### `app.engagement` (Unified Engagement Table)
```sql
- engagement_id: BIGINT (Primary Key)
- org_id: INT (Multi-tenant organization)
- client_id: BIGINT (Foreign Key to clients)
- type: VARCHAR(10) ('audit', 'project', 'job')
- name: NVARCHAR(200) (Engagement title)
- owner_id: BIGINT (Owner contact ID)
- status: VARCHAR(12) ('active', 'paused', 'complete', 'cancelled')
- health: VARCHAR(6) ('green', 'yellow', 'red')
- start_at: DATETIME2 (Start date)
- due_at: DATETIME2 (Due date, nullable)
- contract_id: BIGINT (nullable)
- created_at: DATETIME2
- updated_at: DATETIME2
```

#### Supporting Tables by Type

**Audit Engagements:**
- `app.audit_path` - Audit path definitions
- `app.audit_step` - Individual audit steps
- `app.audit_step_progress` - Step completion tracking
- `app.evidence_link` - Document evidence links

**Project Engagements:**
- `app.feature` - Project features/epics
- `app.story_task` - User stories and tasks
- `app.milestone` - Project milestones

**Job Engagements:**
- `app.job_task` - Simple job tasks

**Shared Extensions:**
- `app.dependency` - Task/feature dependencies
- `app.change_request` - Scope/time/value changes
- `app.work_event` - Event sourcing for all types

## API Endpoints

### Audit Operations

#### GET /api/audits
List audits by client or engagement
```typescript
GET /api/audits?client_id={client_id}&offset=0&limit=50
```

**Response:**
```typescript
{
  audits: Array<{
    audit_id: number;
    client_id: number;
    title: string;
    status: string;
    health: string;
    created_utc: string;
    updated_utc: string;
    start_utc: string;
    end_utc: string;
    owner_contact_id: number;
  }>;
  total: number;
}
```

#### POST /api/audits
Create new audit engagement
```typescript
POST /api/audits
{
  client_id: number;
  title: string;
  owner_contact_id: number;
  path_id: number;
  start_at?: string;
  due_at?: string;
}
```

#### GET /api/audits/{audit_id}
Get audit details with steps and progress
```typescript
GET /api/audits/{audit_id}
```

**Response:**
```typescript
{
  audit: {
    audit_id: number;
    client_id: number;
    title: string;
    status: string;
    health: string;
    start_utc: string;
    end_utc: string;
    owner_contact_id: number;
  };
  steps: Array<{
    step_id: number;
    seq: number;
    title: string;
    state_gate: string;
    required: boolean;
    status: string;
    started_utc?: string;
    completed_utc?: string;
    output_json?: any;
    notes?: string;
  }>;
}
```

#### PUT /api/audits/{audit_id}/steps/{step_id}/progress
Update step progress
```typescript
PUT /api/audits/{audit_id}/steps/{step_id}/progress
{
  status: "in_progress" | "done";
  output_json?: any;
  notes?: string;
}
```

#### POST /api/audits/{audit_id}/steps/{step_id}/advance
Mark step done and advance to next
```typescript
POST /api/audits/{audit_id}/steps/{step_id}/advance
{
  advance: true; // Auto-advance to next step
}
```

### Project Operations

#### GET /api/projects
List projects by client
```typescript
GET /api/projects?client_id={client_id}&status=active
```

#### POST /api/projects
Create new project engagement
```typescript
POST /api/projects
{
  client_id: number;
  name: string;
  owner_id: number;
  start_at: string;
  due_at?: string;
}
```

#### GET /api/projects/{project_id}/features
Get project features with tasks
```typescript
GET /api/projects/{project_id}/features
```

### Job Operations

#### GET /api/jobs
List jobs by client
```typescript
GET /api/jobs?client_id={client_id}&status=active
```

#### POST /api/jobs
Create new job engagement
```typescript
POST /api/jobs
{
  client_id: number;
  name: string;
  owner_id: number;
  start_at: string;
  due_at?: string;
}
```

## Frontend Integration

### API Client Structure

```typescript
// frontend-integration-package/api.ts
export class FlowLedgerAPI {
  private baseURL: string;

  constructor(baseURL: string = '/api') {
    this.baseURL = baseURL;
  }

  // Audit methods
  async getAudits(clientId?: number): Promise<AuditListResponse> {
    const params = clientId ? `?client_id=${clientId}` : '';
    return this.get<AuditListResponse>(`/audits${params}`);
  }

  async createAudit(audit: CreateAuditRequest): Promise<AuditResponse> {
    return this.post<AuditResponse>('/audits', audit);
  }

  async getAudit(auditId: number): Promise<AuditDetailResponse> {
    return this.get<AuditDetailResponse>(`/audits/${auditId}`);
  }

  async updateStepProgress(
    auditId: number,
    stepId: number,
    progress: StepProgressUpdate
  ): Promise<StepProgressResponse> {
    return this.put<StepProgressResponse>(
      `/audits/${auditId}/steps/${stepId}/progress`,
      progress
    );
  }

  // Project methods
  async getProjects(clientId?: number): Promise<ProjectListResponse> {
    const params = clientId ? `?client_id=${clientId}` : '';
    return this.get<ProjectListResponse>(`/projects${params}`);
  }

  // Job methods
  async getJobs(clientId?: number): Promise<JobListResponse> {
    const params = clientId ? `?client_id=${clientId}` : '';
    return this.get<JobListResponse>(`/jobs${params}`);
  }

  private async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`);
    return response.json();
  }

  private async post<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  private async put<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  }
}
```

### TypeScript Types

```typescript
// frontend-integration-package/api-types.ts

export interface Engagement {
  engagement_id: number;
  client_id: number;
  type: 'audit' | 'project' | 'job';
  name: string;
  owner_id: number;
  status: 'active' | 'paused' | 'complete' | 'cancelled';
  health: 'green' | 'yellow' | 'red';
  start_at: string;
  due_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Audit extends Engagement {
  type: 'audit';
}

export interface Project extends Engagement {
  type: 'project';
}

export interface Job extends Engagement {
  type: 'job';
}

export interface AuditStep {
  step_id: number;
  seq: number;
  title: string;
  state_gate: string;
  required: boolean;
  status: string;
  started_utc?: string;
  completed_utc?: string;
  output_json?: any;
  notes?: string;
}

export interface CreateAuditRequest {
  client_id: number;
  title: string;
  owner_contact_id: number;
  path_id: number;
  start_at?: string;
  due_at?: string;
}

export interface StepProgressUpdate {
  status: 'in_progress' | 'done';
  output_json?: any;
  notes?: string;
}

export interface AuditListResponse {
  audits: Audit[];
  total: number;
}

export interface AuditDetailResponse {
  audit: Audit;
  steps: AuditStep[];
}
```

### React Components

```tsx
// frontend-integration-package/AuditManager.tsx
import React, { useState, useEffect } from 'react';
import { FlowLedgerAPI, Audit, AuditStep } from './api';

interface AuditManagerProps {
  clientId?: number;
  api: FlowLedgerAPI;
}

export const AuditManager: React.FC<AuditManagerProps> = ({ clientId, api }) => {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<Audit | null>(null);
  const [steps, setSteps] = useState<AuditStep[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAudits();
  }, [clientId]);

  const loadAudits = async () => {
    setLoading(true);
    try {
      const response = await api.getAudits(clientId);
      setAudits(response.audits);
    } catch (error) {
      console.error('Failed to load audits:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectAudit = async (audit: Audit) => {
    setSelectedAudit(audit);
    try {
      const response = await api.getAudit(audit.audit_id);
      setSteps(response.steps);
    } catch (error) {
      console.error('Failed to load audit details:', error);
    }
  };

  const updateStepProgress = async (stepId: number, status: string, notes?: string) => {
    if (!selectedAudit) return;

    try {
      await api.updateStepProgress(selectedAudit.audit_id, stepId, {
        status,
        notes,
      });

      // Refresh audit details
      const response = await api.getAudit(selectedAudit.audit_id);
      setSteps(response.steps);
    } catch (error) {
      console.error('Failed to update step progress:', error);
    }
  };

  return (
    <div className="audit-manager">
      <div className="audit-list">
        <h3>Audits</h3>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <ul>
            {audits.map((audit) => (
              <li
                key={audit.audit_id}
                onClick={() => selectAudit(audit)}
                className={selectedAudit?.audit_id === audit.audit_id ? 'selected' : ''}
              >
                <div className="audit-title">{audit.name}</div>
                <div className="audit-status">{audit.status}</div>
                <div className="audit-health">{audit.health}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedAudit && (
        <div className="audit-details">
          <h3>{selectedAudit.name}</h3>
          <div className="audit-steps">
            {steps.map((step) => (
              <div key={step.step_id} className="audit-step">
                <div className="step-header">
                  <span className="step-seq">{step.seq}.</span>
                  <span className="step-title">{step.title}</span>
                  <span className={`step-status ${step.status}`}>{step.status}</span>
                </div>
                {step.notes && <div className="step-notes">{step.notes}</div>}
                <div className="step-actions">
                  {step.status !== 'done' && (
                    <button
                      onClick={() => updateStepProgress(step.step_id, 'in_progress')}
                    >
                      Start
                    </button>
                  )}
                  {step.status === 'in_progress' && (
                    <button
                      onClick={() => updateStepProgress(step.step_id, 'done')}
                    >
                      Complete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

## Migration Guide

### From Legacy System

The unified engagements system **completely replaces** these legacy tables:
- ❌ `app.audits` → **DROPPED** (replaced by `app.engagement` with type = 'audit')
- ❌ `app.client_engagements` → **DROPPED** (migrated to `app.engagement`)
- ❌ `app.audit_step_progress` → **DROPPED** (replaced by `app.audit_step_progress` with new schema)

### Data Migration

Legacy data has been **permanently migrated** to the unified system:
1. ✅ All `app.audits` records → `app.engagement` with type = 'audit'
2. ✅ All `app.client_engagements` records → `app.engagement` with appropriate types
3. ✅ Audit progress data preserved in new `app.audit_step_progress` table
4. ✅ Legacy tables **dropped** - no rollback possible

### System Status

**✅ FULLY CONSOLIDATED** - The unified engagements system is now the **single source of truth**:
- No legacy tables remaining in the database
- All stored procedures updated to use unified schema
- Dashboard views updated to use new table structure
- Complete data integrity maintained

### Breaking Changes

⚠️ **Important**: Legacy table references will now fail:
- Direct queries to `app.audits` will fail
- References to `app.client_engagements` will fail
- Old stored procedures may need updates

### Migration Timeline

- **Phase 1** ✅ **COMPLETED**: API consolidation
- **Phase 2** ✅ **COMPLETED**: Data migration scripts
- **Phase 3** ✅ **COMPLETED**: Legacy table cleanup

## Best Practices

### Multi-Tenant Architecture
- Always include `org_id` in queries for proper isolation
- Use organization-scoped API endpoints
- Validate user access to organization resources

### Error Handling
```typescript
try {
  const audits = await api.getAudits(clientId);
  // Handle success
} catch (error) {
  if (error.status === 403) {
    // Handle permission denied
  } else if (error.status === 404) {
    // Handle not found
  } else {
    // Handle other errors
  }
}
```

### Performance Optimization
- Use pagination for large result sets
- Cache frequently accessed engagement data
- Use appropriate indexes for common query patterns

## Support

For questions or issues with the Engagements module:
1. Check this documentation first
2. Review the API response formats
3. Test with the provided TypeScript types
4. Contact the backend team for schema questions

---

*This documentation covers Phase 1 (API consolidation) and Phase 2 (data migration scripts) as requested. The unified engagements system provides a solid foundation for managing audit, project, and job workflows with proper multi-tenant architecture.*

---

**Last Updated:** September 8, 2024  
**Status:** ✅ **FULLY CONSOLIDATED** - Legacy tables dropped, unified system active  
**Version:** 1.0.0  
**Contact:** Development Team

