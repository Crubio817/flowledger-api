# FlowLedger API

A comprehensive enterprise-grade API platform for managing client relationships, sales workflows, and operational intelligence with advanced multi-tenant architecture, event-driven processing, and AI-powered insights.

## 📋 **Project Overview**

FlowLedger API is a monorepo containing:

- **`api/`** — Node.js (TypeScript) Express API backend with SQL Server
- **`web/`** — React (TypeScript) frontend (planned)
- **`frontend-integration-package/`** — TypeScript client SDK
- **`docs/`** — OpenAPI specifications and documentation

### **Core Capabilities**
- **Multi-tenant Architecture**: Organization-scoped data isolation across all modules
- **Event-Driven Processing**: Async outbox pattern with atomic claiming and retry logic
- **State Machine Management**: Governed workflows with guard functions and business rules
- **AI Integration**: MCP-powered enrichment and content generation
- **Audit Trail**: Complete event history with immutable logging
- **Real-time Dashboards**: Operational views with SLA monitoring and checklists

## 🏗️ **Architecture & Technology**

### **Technology Stack**
- **Backend**: Node.js 18+ + TypeScript + Express
- **Database**: Azure SQL Server with connection pooling
- **Authentication**: JWT-based with organization scoping
- **Validation**: Zod schemas with TypeScript integration
- **AI/MCP**: FullEnrich, Clay, and OpenAI integrations
- **Testing**: Jest with integration tests
- **Deployment**: Docker-ready with production builds

### **Project Structure**
```
flowledger-api/
├── api/                          # Backend API
│   ├── src/
│   │   ├── routes/              # API route handlers
│   │   ├── workers/             # Background workers (outbox, SLA)
│   │   ├── middleware/          # Auth, error handling
│   │   ├── db/                  # Database connection & migrations
│   │   ├── mcp/                 # AI/MCP integrations
│   │   └── validation/          # Zod schemas
│   ├── scripts/                 # Database DDL & utilities
│   ├── test/                    # Unit & integration tests
│   └── README-*.md             # Module documentation
├── web/                         # Frontend (planned)
├── frontend-integration-package/ # Client SDK
├── docs/                        # OpenAPI specs
└── README.md                    # This file
```

## 🚀 **Quick Start**

### **Prerequisites**
- Node.js 18+
- Azure SQL Server instance (or local SQL Server)
- npm or yarn
- Git

### **Installation**
```bash
# Clone the repository
git clone <repository-url>
cd flowledger-api

# Install backend dependencies
cd api
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database connection and API keys
```

### **Database Setup**
```bash
# Initialize core modules (requires DB configured)
npm run db:migrate:core-modules
```

### **Development**
```bash
# Start development server
npm run dev

# API will be available at http://localhost:4001
# Swagger UI at http://localhost:4001/api-docs
# OpenAPI JSON at http://localhost:4001/openapi.json
```

### **Testing**
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

## 📊 **Workstream Module v2.1 (Featured)**

The flagship Workstream Module provides a complete sales operations platform:

### **Core Workflow**
Signal → Candidate → Pursuit → Engagement

### **Key Capabilities**
- **Today Panel Dashboard**: Unified operational view with priority sorting
- **Kanban Boards**: Visual management for candidates and pursuits
- **SLA Monitoring**: Automated breach detection (triage, proposal, response)
- **Checklist Gating**: Mandatory completion for Pink/Red stages
- **Event Processing**: Atomic outbox with exponential backoff and dead letters

### **API Highlights**
```typescript
// Today Panel - unified dashboard
GET /api/workstream/today

// Pursuit lifecycle with validation
POST /api/pursuits/:id/stage    // Gated by checklists
POST /api/pursuits/:id/submit   // Requires Pink completion
POST /api/pursuits/:id/won      // Requires Red completion

// Kanban boards with drag-and-drop
GET /api/candidates?status=new|triaged|nurture
GET /api/pursuits?stage=qual|pink|red|submit
```

### **Database Schema (Workstream)**
```sql
-- Core entities
app.signal, app.candidate, app.pursuit, app.proposal

-- Governance
app.pursuit_checklist, app.sla_rule, app.sla_breach

-- Processing
app.work_event, app.drip_schedule

-- Views
app.v_today_panel, app.v_pursuit_checklist_ready
```

## Modules

- Workstream Module v2.1: `api/README.md`
- Clients Module: `api/README-clients.md`
- MCP Module: `api/README-mcp.md`
- Modules Overview: `api/README-modules.md`

A comprehensive enterprise-grade API platform for managing client relationships, sales workflows, and operational intelligence with advanced multi-tenant architecture, event-driven processing, and AI-powered insights.

## � **Modules**

The Flowledger API includes several specialized modules:

- **[Workstream Module v2.1](api/README.md)** - Sales pursuit lifecycle with SLAs and checklists (this document)
- **[Clients Module](api/README-clients.md)** - Client data and contact management
- **[MCP Module](api/README-mcp.md)** - AI-powered enrichment and analysis tools
- **[Modules Overview](api/README-modules.md)** - High-level summary of all modules

## �🚀 **Key Features**

### **Core Capabilities**
- **Multi-tenant Architecture**: Organization-scoped data isolation with configurable SLA rules
- **Event-Driven Processing**: Async outbox pattern with atomic claiming and retry logic
- **State Machine Management**: Pursuit lifecycle with guard functions and business rule validation
- **Checklist Gating**: Mandatory completion requirements for critical workflow transitions
- **SLA Monitoring**: Automated breach detection for triage, proposal, and response SLAs
- **Today Panel Dashboard**: Unified operational view combining candidates and pursuits

### **Production-Ready Features**
- **Fault Tolerance**: Exponential backoff retry logic with dead letter queue
- **Race Condition Prevention**: Atomic database operations with optimistic locking
- **Audit Trail**: Complete event history with immutable work_event logging
- **Idempotent Operations**: Safe retry handling using natural keys
- **Observability**: Comprehensive logging and error tracking
- **Performance Optimization**: Indexed queries and efficient batch processing

## 🏗️ **Architecture Overview**

### **Technology Stack**
- **Backend**: Node.js + TypeScript + Express
- **Database**: Azure SQL Server with connection pooling
- **Authentication**: JWT-based (middleware ready)
- **Validation**: Type-safe request handling with business logic guards

### **Database Schema**
```sql
-- Core Entities
app.signal          -- Lead signals from various sources
app.candidate       -- Qualified prospects with promotion tracking
app.pursuit         -- Active sales opportunities
app.proposal        -- Versioned proposal documents

-- Supporting Tables
app.pursuit_checklist -- Completion tracking for workflow gates
app.sla_rule         -- Configurable SLA definitions per organization
app.sla_breach       -- Automated breach detection and tracking
app.work_event       -- Immutable audit trail with outbox processing

-- Views
app.v_today_panel   -- Unified dashboard combining candidates/pursuits
app.v_pursuit_checklist_ready -- Checklist completion status
```

### **Event-Driven Architecture**
- **Outbox Pattern**: Reliable async processing with atomic claiming
- **Retry Logic**: Exponential backoff (1min → 60min max) with configurable attempts
- **Dead Letter Queue**: Failed events isolated for manual review
- **Stale Claim Cleanup**: Automatic recovery from crashed workers

## 📋 **API Endpoints**

### **Workstream Operations**
```
GET  /api/workstream/today     -- Today Panel dashboard data
```

### **Pursuit Management**
```
POST /api/pursuits/:id/stage   -- Transition pursuit stage (with checklist validation)
POST /api/pursuits/:id/submit  -- Submit pursuit (requires pink checklist)
POST /api/pursuits/:id/won     -- Mark pursuit as won (requires red checklist)
POST /api/pursuits/:id/lost    -- Mark pursuit as lost (requires red checklist)
POST /api/pursuits/:id/proposals -- Create new proposal version
POST /api/proposals/:id/send   -- Send proposal to client
```

### **Supporting Endpoints**
```
GET  /api/signals              -- List signals with filtering
GET  /api/candidates           -- List candidates with promotion status
POST /api/candidates/:id/promote -- Promote candidate to pursuit
```

## 🔧 **Setup & Development**

### **Prerequisites**
- Node.js 18+
- Azure SQL Server instance
- npm or yarn

### **Installation**
```bash
# Clone repository
git clone <repository-url>
cd flowledger-api

# Install dependencies
cd api
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database connection details
```

### **Database Setup**
```bash
# Run database migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

### **Development Server**
```bash
# Start development server
npm run dev

# Server will be available at http://localhost:3000
# API documentation at http://localhost:3000/api/docs
```

### **Production Deployment**
```bash
# Build for production
npm run build

# Start production server
npm start
```

## 📊 **Recent Improvements (v2.1 Final Tightenings)**

### **Audit-Safe Outbox Processing**
- ✅ Atomic claiming with `UPDATE ... OUTPUT` pattern
- ✅ Race condition prevention across multiple worker instances
- ✅ Exponential backoff retry logic (1min → 60min max)
- ✅ Dead letter queue for failed events
- ✅ Stale claim cleanup (5-minute timeout)

### **Idempotency & Reliability**
- ✅ Unique constraints on critical operations
- ✅ Natural key-based duplicate prevention
- ✅ Transaction rollback on failures
- ✅ Comprehensive error logging and tracking

### **Checklist Gating System**
- ✅ Pink checklist required for pursuit submission
- ✅ Red checklist required for won/lost transitions
- ✅ Completion percentage tracking
- ✅ Business rule validation with guard functions

### **SLA Coverage Expansion**
- ✅ Triage SLA: First touch within configured hours
- ✅ Proposal SLA: Submit within hours of promotion
- ✅ Response SLA: Follow-up within hours of proposal send
- ✅ Automated breach detection and alerting
- ✅ Organization-specific SLA rule configuration

### **Today Panel Dashboard**
- ✅ Unified view of candidates and pursuits
- ✅ Priority-based sorting (urgent → high → medium → low)
- ✅ Due date and assignee tracking
- ✅ Real-time status updates
- ✅ Tag-based filtering and organization

## 🔍 **Monitoring & Observability**

### **Health Checks**
```
GET /healthz     -- Basic liveness check
GET /api/health  -- API health with database connectivity
```

### **Logging**
- Event processing status and errors
- SLA breach notifications
- Database connection pool metrics
- Worker claim/release operations

### **Error Handling**
- Structured error responses with HTTP status codes
- Database transaction rollback on failures
- Dead letter queue for unprocessable events
- Comprehensive error context in logs

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### **Development Guidelines**
- TypeScript strict mode enabled
- ESLint configuration for code quality
- Pre-commit hooks for formatting and linting
- Comprehensive test coverage required
- Database migrations for schema changes

## 📄 **License**

This project is proprietary software. All rights reserved.

## 📞 **Support**

For questions or issues:
- Create an issue in this repository
- Contact the development team
- Check the API documentation at `/api/docs`

---

**Version**: v2.1 (Workstream Module Final Tightenings)  
**Last Updated**: September 8, 2025  
**Node.js**: 18+  
**Database**: Azure SQL Server
