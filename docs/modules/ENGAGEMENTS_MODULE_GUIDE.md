# Engagements Module - Complete Implementation Guide

## 📋 Overview

The Engagements module is a comprehensive project management system built for FlowLedger API that supports three types of engagements:

- **Projects**: Feature-based development with progress tracking
- **Audits**: Structured audit processes with predefined paths and steps
- **Jobs**: Task-based work with completion tracking

## 🏗️ Architecture

### Core Components
- **Database Layer**: Multi-tenant schema with state machines
- **API Layer**: REST endpoints with business rule enforcement
- **Frontend Integration**: TypeScript client and React components
- **State Management**: Hard-enforced transitions with guard functions

### Key Features
- Multi-tenant data isolation via `org_id`
- State machine transitions with validation
- Progress calculation and health monitoring
- Dependency management with cycle detection
- Change request workflow
- Real-time event emission via outbox pattern
- WebSocket integration for live updates

---

## 🗄️ Database Schema

### Core Tables

#### `app.engagement`
Main engagement table supporting Projects, Audits, and Jobs.

```sql
CREATE TABLE app.engagement (
    engagement_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    client_id BIGINT NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('project', 'audit', 'job')),
    name NVARCHAR(200) NOT NULL,
    owner_id BIGINT NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),
    health VARCHAR(6) NOT NULL DEFAULT 'green' CHECK (health IN ('green', 'yellow', 'red')),
    start_at DATETIME2 NOT NULL,
    due_at DATETIME2 NULL,
    contract_id BIGINT NULL,
    created_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (org_id, client_id) REFERENCES app.client(org_id, client_id)
);
```

#### `app.feature` (Projects)
Features within projects with state transitions.

```sql
CREATE TABLE app.feature (
    feature_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    engagement_id BIGINT NOT NULL,
    title NVARCHAR(200) NOT NULL,
    priority VARCHAR(12) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    state VARCHAR(12) NOT NULL DEFAULT 'todo' CHECK (state IN ('todo', 'in_progress', 'done')),
    due_at DATETIME2 NULL,
    created_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (org_id, engagement_id) REFERENCES app.engagement(org_id, engagement_id)
);
```

#### `app.audit_path` & `app.audit_step` (Audits)
Structured audit processes with predefined steps.

```sql
CREATE TABLE app.audit_path (
    audit_path_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    engagement_id BIGINT NOT NULL,
    name NVARCHAR(200) NOT NULL,
    description NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (org_id, engagement_id) REFERENCES app.engagement(org_id, engagement_id)
);

CREATE TABLE app.audit_step (
    audit_step_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    audit_path_id BIGINT NOT NULL,
    step_number INT NOT NULL,
    title NVARCHAR(200) NOT NULL,
    description NVARCHAR(MAX),
    state VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'in_progress', 'done')),
    created_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (org_id, audit_path_id) REFERENCES app.audit_path(org_id, audit_path_id)
);
```

#### `app.job_task` (Jobs)
Simple task management for job-type engagements.

```sql
CREATE TABLE app.job_task (
    job_task_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    engagement_id BIGINT NOT NULL,
    title NVARCHAR(200) NOT NULL,
    state VARCHAR(12) NOT NULL DEFAULT 'todo' CHECK (state IN ('todo', 'in_progress', 'done')),
    created_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (org_id, engagement_id) REFERENCES app.engagement(org_id, engagement_id)
);
```

### V2 Extensions

#### `app.milestone`
Timeline milestones with dependencies.

```sql
CREATE TABLE app.milestone (
    milestone_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    engagement_id BIGINT NOT NULL,
    name NVARCHAR(200) NOT NULL,
    type VARCHAR(16) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
    due_at DATETIME2 NOT NULL,
    created_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (org_id, engagement_id) REFERENCES app.engagement(org_id, engagement_id)
);
```

#### `app.dependency`
Task/feature dependencies with cycle detection.

```sql
CREATE TABLE app.dependency (
    dependency_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    from_type VARCHAR(16) NOT NULL,
    from_id BIGINT NOT NULL,
    to_type VARCHAR(16) NOT NULL,
    to_id BIGINT NOT NULL,
    dep_type CHAR(2) NOT NULL CHECK (dep_type IN ('FS', 'SS', 'FF', 'SF')),
    lag_days INT DEFAULT 0,
    created_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (org_id) REFERENCES app.org(org_id)
);
```

#### `app.change_request`
Change management for scope, hours, and value adjustments.

```sql
CREATE TABLE app.change_request (
    change_request_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    engagement_id BIGINT NOT NULL,
    origin VARCHAR(10) NOT NULL,
    scope_delta NVARCHAR(MAX),
    hours_delta DECIMAL(18,2),
    value_delta DECIMAL(18,2),
    status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    created_by BIGINT NOT NULL,
    created_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    decided_at DATETIME2 NULL,
    FOREIGN KEY (org_id, engagement_id) REFERENCES app.engagement(org_id, engagement_id)
);
```

---

## 🔒 State Machines

### Engagement Status Transitions
```typescript
const ENGAGEMENT_TX = {
  active: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['active', 'completed', 'cancelled'],
  completed: [], // Terminal state
  cancelled: []  // Terminal state
};
```

### Feature State Transitions
```typescript
const FEATURE_TX = {
  todo: ['in_progress'],
  in_progress: ['done', 'todo'],
  done: [] // Terminal state
};
```

### Audit Step Transitions
```typescript
const AUDIT_STEP_TX = {
  pending: ['in_progress'],
  in_progress: ['done', 'pending'],
  done: [] // Terminal state
};
```

### Change Request Status Transitions
```typescript
const CHANGE_REQUEST_TX = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected', 'draft'],
  approved: [], // Terminal state
  rejected: []  // Terminal state
};
```

---

## 🚀 API Endpoints

### Base URL: `/api/engagements`

### Engagements

#### GET `/api/engagements`
List engagements with filtering and progress calculation.

**Query Parameters:**
- `org_id` (required): Organization ID
- `type`: Filter by type (`project`, `audit`, `job`)
- `status`: Filter by status
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

**Response:**
```json
{
  "status": "ok",
  "data": [
    {
      "id": 1,
      "client_id": 123,
      "type": "project",
      "name": "Website Redesign",
      "owner_id": 456,
      "status": "active",
      "health": "green",
      "start_at": "2025-01-01T00:00:00.000Z",
      "due_at": "2025-03-01T00:00:00.000Z",
      "contract_id": 789,
      "created_at": "2025-01-01T00:00:00.000Z",
      "client_name": "ABC Corp",
      "progress_pct": 0.65
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

#### POST `/api/engagements`
Create a new engagement.

**Request Body:**
```json
{
  "org_id": 1,
  "client_id": 123,
  "type": "project",
  "name": "Website Redesign",
  "owner_id": 456,
  "start_at": "2025-01-01T00:00:00.000Z",
  "due_at": "2025-03-01T00:00:00.000Z",
  "contract_id": 789
}
```

#### PATCH `/api/engagements/:id`
Update engagement status.

**Request Body:**
```json
{
  "status": "completed",
  "org_id": 1
}
```

### Features (Projects)

#### POST `/api/engagements/:id/features`
Create a feature within a project.

**Request Body:**
```json
{
  "title": "User Authentication",
  "priority": "high",
  "due_at": "2025-02-01T00:00:00.000Z",
  "org_id": 1
}
```

#### PATCH `/api/engagements/:id/features/:featureId`
Update feature state.

**Request Body:**
```json
{
  "state": "in_progress",
  "org_id": 1
}
```

### Milestones

#### POST `/api/engagements/:id/milestones`
Create a milestone.

**Request Body:**
```json
{
  "name": "Phase 1 Complete",
  "type": "delivery",
  "due_at": "2025-02-15T00:00:00.000Z",
  "org_id": 1
}
```

### Dependencies

#### POST `/api/engagements/:id/dependencies`
Create a dependency relationship.

**Request Body:**
```json
{
  "from_type": "feature",
  "from_id": 1,
  "to_type": "feature",
  "to_id": 2,
  "dep_type": "FS",
  "lag_days": 0,
  "org_id": 1
}
```

**Dependency Types:**
- `FS`: Finish-to-Start
- `SS`: Start-to-Start
- `FF`: Finish-to-Finish
- `SF`: Start-to-Finish

### Change Requests

#### POST `/api/engagements/:id/change-requests`
Create a change request.

**Request Body:**
```json
{
  "origin": "client",
  "scope_delta": "Add mobile responsiveness",
  "hours_delta": 40,
  "value_delta": 5000,
  "org_id": 1
}
```

#### PATCH `/api/engagements/:id/change-requests/:crId`
Update change request status.

**Request Body:**
```json
{
  "status": "approved",
  "org_id": 1
}
```

---

## 🎨 Frontend Integration

### Installation

1. **Install Dependencies:**
```bash
cd frontend-integration-package
npm install zod
```

2. **Import Components:**
```typescript
import { EngagementsApi, EngagementsManager } from './engagements-api';
import EngagementsManager from './EngagementsManager';
```

### Basic Usage

#### API Client Setup
```typescript
// Create API client instance
const engagementsApi = new EngagementsApi('/api');

// Or use the hook
const api = useEngagementsApi();
```

#### Fetch Engagements
```typescript
const loadEngagements = async () => {
  try {
    const response = await api.getEngagements({
      org_id: 1,
      type: 'project',
      status: 'active'
    });

    if (response.status === 'ok') {
      setEngagements(response.data);
    }
  } catch (error) {
    console.error('Failed to load engagements:', error);
  }
};
```

#### Create New Engagement
```typescript
const createEngagement = async () => {
  try {
    const response = await api.createEngagement({
      org_id: 1,
      client_id: 123,
      type: 'project',
      name: 'New Website',
      owner_id: 456,
      start_at: '2025-01-01T00:00:00.000Z',
      due_at: '2025-03-01T00:00:00.000Z'
    });

    console.log('Created engagement:', response.data);
  } catch (error) {
    console.error('Failed to create engagement:', error);
  }
};
```

#### React Component Usage
```tsx
import React from 'react';
import { EngagementsManager } from './EngagementsManager';

function App() {
  return (
    <div className="App">
      <EngagementsManager orgId={1} />
    </div>
  );
}

export default App;
```

### Advanced Usage

#### Custom API Client
```typescript
class CustomEngagementsApi extends EngagementsApi {
  constructor(baseUrl: string, private authToken: string) {
    super(baseUrl);
  }

  private async authenticatedFetch(url: string, options: RequestInit = {}) {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      }
    });
  }
}
```

#### Real-time Updates with WebSocket
```typescript
import { useEffect, useState } from 'react';

function useRealtimeEngagements(orgId: number) {
  const [engagements, setEngagements] = useState([]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:4001');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'engagement.updated') {
        // Refresh engagements data
        loadEngagements();
      }
    };

    return () => ws.close();
  }, [orgId]);

  return engagements;
}
```

#### Form Validation with Zod
```typescript
import { z } from 'zod';

const CreateEngagementSchema = z.object({
  org_id: z.number(),
  client_id: z.number(),
  type: z.enum(['project', 'audit', 'job']),
  name: z.string().min(1, 'Name is required'),
  owner_id: z.number(),
  start_at: z.string().datetime(),
  due_at: z.string().datetime().optional()
});

function CreateEngagementForm() {
  const handleSubmit = (data: unknown) => {
    const validated = CreateEngagementSchema.parse(data);
    // Submit validated data
  };
}
```

### Component Customization

#### Custom Engagement Card
```tsx
interface EngagementCardProps {
  engagement: Engagement;
  onStatusChange: (id: number, status: string) => void;
}

function CustomEngagementCard({ engagement, onStatusChange }: EngagementCardProps) {
  return (
    <div className="engagement-card">
      <h3>{engagement.name}</h3>
      <p>Client: {engagement.client_name}</p>
      <p>Progress: {Math.round((engagement.progress_pct || 0) * 100)}%</p>
      <select
        value={engagement.status}
        onChange={(e) => onStatusChange(engagement.id, e.target.value)}
      >
        <option value="active">Active</option>
        <option value="on_hold">On Hold</option>
        <option value="completed">Completed</option>
      </select>
    </div>
  );
}
```

#### Custom Progress Indicator
```tsx
function ProgressIndicator({ percentage }: { percentage: number }) {
  const getColor = (pct: number) => {
    if (pct < 0.3) return 'bg-red-500';
    if (pct < 0.7) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5">
      <div
        className={`h-2.5 rounded-full ${getColor(percentage)}`}
        style={{ width: `${percentage * 100}%` }}
      />
    </div>
  );
}
```

---

## 🔧 Setup Instructions

### Database Setup

1. **Run Migration:**
```bash
cd /workspaces/flowledger-api/api
npm run db:migrate:core-modules
```

2. **Verify Tables:**
```sql
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'app' AND TABLE_NAME LIKE '%engagement%';
```

### Backend Setup

1. **Routes are already registered** in `src/server.ts`:
```typescript
app.use('/api/engagements', engagements);
```

2. **Start Development Server:**
```bash
npm run dev
```

3. **Test Endpoints:**
```bash
curl "http://localhost:4001/api/engagements?org_id=1"
```

### Frontend Setup

1. **Install Dependencies:**
```bash
cd frontend-integration-package
npm install
```

2. **Build Components:**
```bash
npm run build
```

3. **Integration Example:**
```tsx
import { EngagementsManager } from './dist/EngagementsManager';

function MyApp() {
  return (
    <div>
      <h1>Project Management</h1>
      <EngagementsManager orgId={1} />
    </div>
  );
}
```

---

## 📊 Progress Calculation

### Project Progress
Calculated as the percentage of completed features:
```sql
SELECT CAST(SUM(CASE WHEN f.state = 'done' THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0)
FROM app.feature f WHERE f.engagement_id = @engagementId AND f.org_id = @orgId
```

### Audit Progress
Calculated as the percentage of completed audit steps:
```sql
SELECT CAST(SUM(CASE WHEN s.state = 'done' THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0)
FROM app.audit_step s
JOIN app.audit_path p ON s.audit_path_id = p.audit_path_id
WHERE p.engagement_id = @engagementId AND s.org_id = @orgId
```

### Job Progress
Calculated as the percentage of completed tasks:
```sql
SELECT CAST(SUM(CASE WHEN t.state = 'done' THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0)
FROM app.job_task t WHERE t.engagement_id = @engagementId AND t.org_id = @orgId
```

---

## 🔄 Event-Driven Architecture

### Outbox Events
The system emits events for background processing:

- `feature.completed` - When a feature is marked as done
- `change_request.updated` - When change request status changes
- `engagement.updated` - When engagement data changes

### WebSocket Integration
Real-time updates for live dashboards:

```javascript
const ws = new WebSocket('ws://localhost:4001');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'engagement.updated':
      refreshEngagement(data.engagement_id);
      break;
    case 'feature.completed':
      updateProgress(data.engagement_id);
      break;
  }
};
```

---

## 🧪 Testing

### API Testing
```bash
# Create test engagement
curl -X POST http://localhost:4001/api/engagements \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": 1,
    "client_id": 1,
    "type": "project",
    "name": "Test Project",
    "owner_id": 1,
    "start_at": "2025-01-01T00:00:00.000Z"
  }'

# List engagements
curl "http://localhost:4001/api/engagements?org_id=1"
```

### Frontend Testing
```tsx
import { render, screen } from '@testing-library/react';
import { EngagementsManager } from './EngagementsManager';

test('renders engagement manager', () => {
  render(<EngagementsManager orgId={1} />);
  expect(screen.getByText('Engagements')).toBeInTheDocument();
});
```

---

## 🚨 Common Issues & Solutions

### Database Connection Issues
```bash
# Check database connectivity
npm run db:ping

# Verify migration
npm run db:migrate:core-modules
```

### Authentication Issues
- Ensure `org_id` is passed in query parameters
- Check user permissions for engagement access
- Verify client ownership

### State Transition Errors
- Check state machine guards in `engagements-guards.ts`
- Ensure valid transitions are attempted
- Review error messages for specific validation failures

### Frontend Integration Issues
- Verify API base URL configuration
- Check CORS settings for cross-origin requests
- Ensure proper error handling in components

---

## 📈 Performance Considerations

### Database Indexes
- `org_id` as leading column in all indexes
- Composite indexes for common query patterns
- Filtered indexes for active engagements

### API Optimization
- Pagination for large result sets
- Efficient progress calculations
- Background processing for heavy operations

### Frontend Optimization
- Lazy loading of engagement details
- Virtual scrolling for large lists
- Optimistic updates for better UX

---

## 🔐 Security

### Multi-tenancy
- All queries filtered by `org_id`
- Row-level security via database constraints
- Access control validation in guards

### Input Validation
- Zod schemas for type safety
- SQL injection prevention via parameterized queries
- XSS protection via proper escaping

### Audit Trail
- All changes logged via activity system
- Change request workflow for scope changes
- Event emission for compliance tracking

---

This comprehensive implementation provides a production-ready engagements management system with full CRUD operations, state management, progress tracking, and real-time updates. The modular architecture allows for easy extension and customization based on specific business requirements.
