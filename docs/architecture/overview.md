# FlowLedger API Architecture Overview

## 🏗️ System Architecture

FlowLedger API is built as a **multi-tenant, event-driven** enterprise platform designed for high-scale customer relationship management, sales workflows, and operational intelligence.

### Core Design Principles

1. **Multi-Tenancy**: Complete data isolation per organization
2. **Event-Driven**: Asynchronous processing with outbox pattern
3. **State Machines**: Enforced business rules and workflow transitions
4. **API-First**: OpenAPI-driven development with type safety
5. **Microservice Ready**: Modular design with clear boundaries

## 🔧 Technology Stack

### Backend Infrastructure
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js with middleware composition
- **Database**: Azure SQL Server with connection pooling
- **Validation**: Zod schemas with runtime type checking
- **Authentication**: JWT-based with organization scoping

### AI & Integration Layer
- **MCP (Model Context Protocol)**: AI tool orchestration
- **FullEnrich**: Contact and company data enrichment
- **Clay**: Automation workflow integration
- **OpenAI**: Content generation and analysis

### Development & Operations
- **Testing**: Jest with integration test suites
- **Linting**: ESLint with TypeScript rules
- **Build**: TypeScript compilation with source maps
- **Deployment**: Docker-ready with production optimizations

## 📊 Data Architecture

### Multi-Tenant Database Design

All tables include `org_id` for organization-scoped data isolation:

```sql
-- Core pattern for all entities
CREATE TABLE app.entity (
    entity_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL REFERENCES app.organization(org_id),
    -- entity-specific columns
    created_at DATETIME2 DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- Row-level security enforcement
CREATE POLICY entity_org_policy ON app.entity
FOR ALL TO app_user
USING (org_id = CAST(SESSION_CONTEXT(N'org_id') AS INT));
```

### Event-Driven Processing

The outbox pattern ensures atomic event processing:

```sql
-- Event outbox for async processing
CREATE TABLE app.work_event (
    event_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    aggregate_id BIGINT,
    payload NVARCHAR(MAX), -- JSON
    claimed_at DATETIME2,
    processed_at DATETIME2,
    retry_count INT DEFAULT 0,
    next_retry_at DATETIME2,
    created_at DATETIME2 DEFAULT SYSUTCDATETIME()
);
```

## 🔄 Core Modules

### 1. Workstream (Sales Pipeline)
- **Purpose**: Lead management and sales process automation
- **Key Entities**: `pursuit`, `pursuit_stage`, `pursuit_activity`
- **State Machine**: Enforced stage transitions with guard functions
- **Integration**: CRM data sync, email automation

### 2. People & Staffing
- **Purpose**: Resource allocation and skill management
- **Key Entities**: `person`, `skill`, `assignment`, `rate_card`
- **Features**: AI-powered candidate matching, availability tracking
- **Business Logic**: Immutable rate snapshots, utilization monitoring

### 3. Engagements (Projects)
- **Purpose**: Project lifecycle management
- **Key Entities**: `engagement`, `task`, `deliverable`, `milestone`
- **Workflow**: Stage-based progression with approval gates
- **Reporting**: Progress tracking, resource utilization

### 4. Billing & Contracts
- **Purpose**: Financial management and invoicing
- **Key Entities**: `contract`, `invoice`, `payment`, `rate_structure`
- **Features**: Automated billing cycles, multi-currency support
- **Compliance**: Audit trails, tax calculations

### 5. Automation & Rules
- **Purpose**: Workflow automation and business rules
- **Key Entities**: `automation_rule`, `trigger`, `action`, `condition`
- **Engine**: Event-driven rule evaluation
- **Integration**: Email, notifications, data updates

### 6. MCP (AI Integration)
- **Purpose**: AI-powered insights and automation
- **Key Entities**: `mcp_session`, `ai_tool`, `enrichment_result`
- **Capabilities**: Data enrichment, content generation, analysis
- **Providers**: FullEnrich, Clay, OpenAI, custom tools

## 🛡️ Security Architecture

### Authentication Flow
```typescript
// JWT middleware with organization scoping
app.use('/api', jwtMiddleware); // Validates JWT and extracts user
app.use('/api', orgScopeMiddleware); // Sets SESSION_CONTEXT org_id

// Route-level authorization
router.get('/clients', requireOrg, asyncHandler(async (req, res) => {
    // org_id automatically scoped in queries
    const clients = await getClientsForOrg(req.orgId);
    ok(res, clients);
}));
```

### Data Isolation Patterns
1. **Query Filtering**: Every query includes `org_id` filter
2. **Session Context**: Database-level organization scoping
3. **API Validation**: Input validation with organization checks
4. **Audit Logging**: Complete access trail with user attribution

## ⚡ Performance Architecture

### Connection Pooling
```typescript
// Azure SQL connection with multiple auth modes
const pool = new sql.ConnectionPool({
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    authentication: {
        type: process.env.SQL_AUTH, // 'sql' | 'aad-msi' | 'aad-default'
        options: {
            userName: process.env.SQL_USERNAME,
            password: process.env.SQL_PASSWORD
        }
    },
    pool: {
        max: parseInt(process.env.SQL_POOL_MAX || '10'),
        min: parseInt(process.env.SQL_POOL_MIN || '2'),
        idleTimeoutMillis: 30000
    }
});
```

### Async Processing
- **Outbox Workers**: Background event processing with exponential backoff
- **SLA Monitoring**: Automated threshold checking and alerting
- **Rate Calculation**: Periodic financial metric updates
- **WebSocket Broadcasting**: Real-time UI updates

### Caching Strategy
- **Database**: Connection pooling and prepared statements
- **API**: Response caching for read-heavy endpoints
- **Static Assets**: CDN integration for OpenAPI specs
- **Session Data**: Redis-backed session storage (planned)

## 🔧 Development Architecture

### Modular Design Pattern
```typescript
// Standard route module structure
export const router = Router();

// Input validation with Zod
const CreateEntitySchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().optional()
});

// Async handler with error boundary
router.post('/', asyncHandler(async (req, res) => {
    const parsed = CreateEntitySchema.safeParse(req.body);
    if (!parsed.success) {
        return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    }
    
    const result = await createEntity(req.orgId, parsed.data);
    ok(res, result, 201);
}));
```

### State Machine Implementation
```typescript
// Business rule enforcement
export const PURSUIT_TX = {
    'lead': ['qualified', 'disqualified'],
    'qualified': ['proposal', 'lost'],
    'proposal': ['won', 'lost'],
    'won': ['delivered'],
    'lost': [],
    'delivered': []
};

export function assertTx(map, from, to, label) {
    const allowed = map[from] ?? [];
    if (!allowed.includes(to)) {
        throw new Error(`Invalid ${label} transition: ${from} → ${to}`);
    }
}
```

## 📈 Scalability Considerations

### Horizontal Scaling
- **Stateless API**: No server-side session storage
- **Database**: Read replicas for analytics queries
- **Workers**: Multi-instance with Redis coordination
- **WebSocket**: Load balancer sticky sessions or pub/sub

### Monitoring & Observability
- **Health Checks**: `/healthz` endpoint with database connectivity
- **Metrics**: Performance counters and SLA tracking
- **Logging**: Structured JSON logs with correlation IDs
- **Alerting**: Configurable thresholds for business metrics

### Future Architecture Evolution
1. **Microservice Migration**: Module extraction with API boundaries
2. **Event Sourcing**: Full event store for audit and replay
3. **CQRS**: Separate read/write models for performance
4. **Multi-Region**: Global deployment with data residency
5. **GraphQL**: Unified API layer over microservices

---

This architecture provides a solid foundation for enterprise-scale operations while maintaining development agility and operational reliability.
