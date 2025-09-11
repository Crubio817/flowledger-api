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

## 📚 Documentation

- Docs index and navigation: ./docs/README.md

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
# Swagger UI at http://localhost:4001/api/docs
# OpenAPI JSON at http://localhost:4001/openapi.json
```

### **Testing**
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

## 📊 **People Module v1.0 (Featured)**

The flagship People Module provides a complete staffing and resource management platform with AI-powered candidate matching and immutable rate snapshots.

### **Core Capabilities**
- **AI-Powered Matching**: FitScore algorithm with explainable recommendations
- **Immutable Rate Snapshots**: Financial integrity with audit trails
- **Real-time Availability**: Daily allocation tracking with conflict detection
- **Comprehensive Billing**: Contract management and invoicing system
- **Multi-tenant Architecture**: Organization-scoped data isolation

### **Key Features**
- **Candidate Ranking**: <300ms ranking of 5k+ candidates with FitScore explanations
- **Rate Resolution**: Hierarchical precedence system with full breakdown audit
- **Availability Tracking**: Real-time utilization monitoring with over-allocation alerts
- **Skill Management**: Proficiency tracking with evidence chains
- **Audit Trail**: Complete event history for compliance and analysis

### **API Highlights**
```typescript
// Candidate ranking with FitScore
POST /api/staffing-requests/:id/rank

// Rate preview with full breakdown
GET /api/rates/preview

// Assignment creation with immutable snapshot
POST /api/assignments

// People directory with skill filtering
GET /api/people?skill=python&min_level=3
```

### **Database Schema (People)**
```sql
-- Core entities
app.person, app.skill, app.assignment

-- Rate resolution
app.rate_card, app.rate_premium, app.contract

-- Billing & tracking
app.time_entry, app.invoice, app.audit_log

-- Views
app.v_person_availability, app.v_person_utilization
```

## Modules

- Workstream (Sales): ./docs/modules/workstream.md
- Clients: ./docs/modules/clients.md
- People (Staffing): ./docs/modules/people.md
- Engagements (Projects/Audits/Jobs): ./docs/modules/engagements.md
- Billing & Contracts: ./docs/modules/billing.md
- MCP (AI/Enrichment): ./docs/modules/mcp.md

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
