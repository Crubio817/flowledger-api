# Development Guide

## 🛠️ Development Workflow

This guide covers the essential development patterns, conventions, and workflows for FlowLedger API.

## 📋 Project Structure

```
flowledger-api/
├── api/                          # Backend API
│   ├── src/
│   │   ├── routes/              # API route handlers
│   │   │   ├── clients.ts       # Client management endpoints
│   │   │   ├── workstream.ts    # Sales pipeline endpoints
│   │   │   ├── people.ts        # Staffing and resource endpoints
│   │   │   └── ...
│   │   ├── workers/             # Background processing
│   │   │   ├── outbox.ts        # Event processing worker
│   │   │   ├── sla.ts           # SLA monitoring worker
│   │   │   └── rate-calc.ts     # Financial calculations
│   │   ├── middleware/          # Express middleware
│   │   │   ├── auth.ts          # JWT authentication
│   │   │   ├── org-scope.ts     # Organization scoping
│   │   │   └── error.ts         # Error handling
│   │   ├── db/                  # Database utilities
│   │   │   ├── pool.ts          # Connection management
│   │   │   └── migrations/      # Schema evolution
│   │   ├── validation/          # Input validation
│   │   │   └── schemas.ts       # Zod validation schemas
│   │   ├── utils/               # Shared utilities
│   │   │   ├── http.ts          # Response helpers
│   │   │   └── audit.ts         # Activity logging
│   │   ├── state/               # Business rules
│   │   │   └── guards.ts        # State transition validation
│   │   └── mcp/                 # AI integrations
│   │       └── tools.ts         # MCP tool implementations
│   ├── scripts/                 # Database and utility scripts
│   └── test/                    # Test suites
├── frontend-integration-package/ # TypeScript SDK
├── docs/                        # Documentation
└── web/                         # React frontend (planned)
```

## 🔧 Development Setup

### Prerequisites
- Node.js 18+
- Azure SQL Server instance (or SQL Server with Docker)
- Git
- VS Code (recommended)

### Initial Setup
```bash
# Clone and setup
git clone <repository-url>
cd flowledger-api/api
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials
```

### Database Setup
```bash
# Initialize core modules
npm run db:migrate:core-modules

# Fix module instance references
npm run db:migrate:fix-int-client

# Verify connectivity
npm run db:ping
```

### Development Server
```bash
# Start with hot reload
npm run dev

# Production build
npm run build && npm start
```

## 📝 Coding Conventions

### Route Handler Pattern
```typescript
import { Router } from 'express';
import { asyncHandler } from '../utils/http';
import { ok, badRequest } from '../utils/http';
import { getPool } from '../db/pool';
import * as sql from 'mssql';

export const router = Router();

// Standard CRUD pattern
router.get('/', asyncHandler(async (req, res) => {
    const { org_id, limit = 20, offset = 0 } = req.query;
    
    const pool = await getPool();
    const result = await pool.request()
        .input('orgId', sql.Int, org_id)
        .input('limit', sql.Int, limit)
        .input('offset', sql.Int, offset)
        .query(`
            SELECT entity_id, name, created_at, updated_at
            FROM app.entity 
            WHERE org_id = @orgId
            ORDER BY created_at DESC
            OFFSET @offset ROWS 
            FETCH NEXT @limit ROWS ONLY
        `);
    
    ok(res, result.recordset);
}));

router.post('/', asyncHandler(async (req, res) => {
    const parsed = CreateEntitySchema.safeParse(req.body);
    if (!parsed.success) {
        return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    }
    
    const pool = await getPool();
    const result = await pool.request()
        .input('orgId', sql.Int, parsed.data.org_id)
        .input('name', sql.NVarChar(200), parsed.data.name)
        .query(`
            INSERT INTO app.entity (org_id, name)
            OUTPUT INSERTED.entity_id, INSERTED.name, INSERTED.created_at
            VALUES (@orgId, @name)
        `);
    
    await logActivity({
        type: 'EntityCreated',
        title: `Entity "${parsed.data.name}" created`,
        entity_id: result.recordset[0].entity_id
    });
    
    ok(res, result.recordset[0], 201);
}));
```

### Validation with Zod
```typescript
import { z } from 'zod';

// Define schemas
export const CreateEntitySchema = z.object({
    org_id: z.number().int().positive(),
    name: z.string().min(1).max(200),
    description: z.string().optional(),
    tags: z.array(z.string()).optional()
});

export const UpdateEntitySchema = CreateEntitySchema.partial().omit(['org_id']);

// Usage in routes
const parsed = CreateEntitySchema.safeParse(req.body);
if (!parsed.success) {
    return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
}
```

### Database Query Patterns
```typescript
// Always include org_id filtering
const result = await pool.request()
    .input('orgId', sql.Int, req.query.org_id)
    .input('entityId', sql.BigInt, req.params.id)
    .query(`
        SELECT * FROM app.entity 
        WHERE org_id = @orgId AND entity_id = @entityId
    `);

// Use OUTPUT for creates
const created = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('name', sql.NVarChar(200), name)
    .query(`
        INSERT INTO app.entity (org_id, name)
        OUTPUT INSERTED.entity_id, INSERTED.name, INSERTED.created_at
        VALUES (@orgId, @name)
    `);

// Pagination pattern
const paged = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('limit', sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query(`
        SELECT COUNT(*) OVER() as total_count, *
        FROM app.entity 
        WHERE org_id = @orgId
        ORDER BY created_at DESC
        OFFSET @offset ROWS 
        FETCH NEXT @limit ROWS ONLY
    `);
```

### State Machine Implementation
```typescript
// Define transitions in src/state/guards.ts
export const ENTITY_TX = {
    'draft': ['active', 'cancelled'],
    'active': ['completed', 'paused', 'cancelled'],
    'paused': ['active', 'cancelled'],
    'completed': [],
    'cancelled': []
};

export function assertTx(map, from, to, label) {
    const allowed = map[from] ?? [];
    if (!allowed.includes(to)) {
        throw new Error(`Invalid ${label} transition: ${from} → ${to}`);
    }
}

// Usage in routes
router.patch('/:id/status', asyncHandler(async (req, res) => {
    const { newStatus } = req.body;
    const { currentStatus } = await getCurrentEntity(req.params.id);
    
    // Validate transition
    assertTx(ENTITY_TX, currentStatus, newStatus, 'entity status');
    
    // Update with audit trail
    await updateEntityStatus(req.params.id, newStatus);
    await logActivity({
        type: 'EntityStatusChanged',
        title: `Status changed: ${currentStatus} → ${newStatus}`,
        entity_id: req.params.id
    });
    
    ok(res, { entity_id: req.params.id, status: newStatus });
}));
```

## 🧪 Testing Patterns

### Unit Tests
```typescript
// test/routes/entities.test.ts
import request from 'supertest';
import { app } from '../../src/server';

describe('Entities API', () => {
    test('GET /api/entities returns paginated results', async () => {
        const response = await request(app)
            .get('/api/entities?org_id=1&limit=10')
            .set('Authorization', `Bearer ${validJWT}`)
            .expect(200);
            
        expect(response.body.status).toBe('ok');
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeLessThanOrEqual(10);
    });
    
    test('POST /api/entities creates new entity', async () => {
        const newEntity = {
            org_id: 1,
            name: 'Test Entity',
            description: 'Test description'
        };
        
        const response = await request(app)
            .post('/api/entities')
            .set('Authorization', `Bearer ${validJWT}`)
            .send(newEntity)
            .expect(201);
            
        expect(response.body.status).toBe('ok');
        expect(response.body.data.name).toBe(newEntity.name);
        expect(response.body.data.entity_id).toBeDefined();
    });
});
```

### Integration Tests
```typescript
// test/integration/full-workflow.test.ts
describe('Complete Entity Workflow', () => {
    test('Create → Update → State Change → Delete', async () => {
        // Create entity
        const created = await createTestEntity();
        
        // Update properties
        await updateEntity(created.entity_id, { name: 'Updated Name' });
        
        // Change state
        await changeEntityStatus(created.entity_id, 'active');
        
        // Verify audit trail
        const activities = await getEntityActivities(created.entity_id);
        expect(activities).toHaveLength(3); // Create + Update + Status change
        
        // Cleanup
        await deleteEntity(created.entity_id);
    });
});
```

## 🔄 Background Workers

### Outbox Pattern Implementation
```typescript
// src/workers/outbox.ts
export async function processOutboxEvents() {
    const pool = await getPool();
    
    // Claim events atomically
    const claimed = await pool.request()
        .input('maxRetry', sql.Int, 5)
        .input('claimTimeout', sql.Int, 300) // 5 minutes
        .query(`
            UPDATE TOP (10) app.work_event 
            SET claimed_at = SYSUTCDATETIME()
            OUTPUT INSERTED.*
            WHERE claimed_at IS NULL 
               OR (claimed_at < DATEADD(second, -@claimTimeout, SYSUTCDATETIME()))
            AND retry_count < @maxRetry
            AND (next_retry_at IS NULL OR next_retry_at <= SYSUTCDATETIME())
        `);
    
    // Process each event
    for (const event of claimed.recordset) {
        try {
            await processEvent(event);
            await markEventProcessed(event.event_id);
        } catch (error) {
            await markEventFailed(event.event_id, error.message);
        }
    }
}

// Run every 30 seconds
setInterval(processOutboxEvents, 30000);
```

## 📊 Module Development

### Adding a New Module

1. **Create module structure**:
```bash
mkdir -p src/routes/newmodule
mkdir -p src/validation/newmodule
```

2. **Define database schema**:
```sql
-- scripts/migrations/add-newmodule.sql
CREATE TABLE app.newmodule_entity (
    entity_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL REFERENCES app.organization(org_id),
    name NVARCHAR(200) NOT NULL,
    status VARCHAR(20) DEFAULT 'draft',
    created_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_newmodule_entity_org_id ON app.newmodule_entity(org_id);
```

3. **Create route handlers**:
```typescript
// src/routes/newmodule/entities.ts
import { Router } from 'express';
import { NewModuleEntitySchema } from '../../validation/newmodule/schemas';

export const router = Router();

router.get('/', asyncHandler(async (req, res) => {
    // Implementation
}));

router.post('/', asyncHandler(async (req, res) => {
    // Implementation
}));
```

4. **Add validation schemas**:
```typescript
// src/validation/newmodule/schemas.ts
export const NewModuleEntitySchema = z.object({
    org_id: z.number().int().positive(),
    name: z.string().min(1).max(200),
    status: z.enum(['draft', 'active', 'completed'])
});
```

5. **Register routes**:
```typescript
// src/server.ts
import { router as newModuleRouter } from './routes/newmodule/entities';
app.use('/api/newmodule', newModuleRouter);
```

## 🚀 Deployment & Operations

### Environment Configuration
```bash
# Database connection
SQL_SERVER=your-server.database.windows.net
SQL_DATABASE=flowledger
SQL_AUTH=aad-msi  # or 'sql', 'aad-default', 'aad-access-token'

# For SQL auth mode
SQL_USERNAME=your-username
SQL_PASSWORD=your-password

# Connection pooling
SQL_POOL_MAX=10
SQL_POOL_MIN=2

# Application settings
PORT=4001
NODE_ENV=production
JWT_SECRET=your-jwt-secret

# AI integrations
FULLENRICH_API_KEY=your-fullenrich-key
CLAY_API_KEY=your-clay-key
OPENAI_API_KEY=your-openai-key
```

### Health Monitoring
```typescript
// Health check endpoints
app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', asyncHandler(async (req, res) => {
    try {
        await getPool(); // Test DB connection
        res.status(200).json({ 
            status: 'ok', 
            database: 'connected',
            timestamp: new Date().toISOString() 
        });
    } catch (error) {
        res.status(503).json({ 
            status: 'error', 
            database: 'disconnected',
            error: error.message 
        });
    }
}));
```

## 📈 Performance Guidelines

### Database Optimization
- Always include `org_id` in WHERE clauses
- Use proper indexing on frequently queried columns
- Implement pagination for large result sets
- Use `OUTPUT` clauses for insert operations
- Batch operations when possible

### Memory Management
- Use connection pooling
- Clean up resources in finally blocks
- Avoid memory leaks in long-running workers
- Monitor heap usage in production

### API Performance
- Implement response caching for read-heavy endpoints
- Use appropriate HTTP status codes
- Compress responses for large payloads
- Implement rate limiting for public endpoints

---

This development guide provides the foundation for consistent, scalable development within the FlowLedger API ecosystem.
