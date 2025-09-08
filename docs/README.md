# FlowLedger API Documentation Hub

Welcome to the comprehensive documentation for FlowLedger API - a multi-tenant enterprise platform for managing client relationships, sales workflows, and operational intelligence.

## 📖 Quick Navigation

### 🚀 Getting Started
- [Installation & Setup](../api/README.md) - Backend API setup and auth modes
- [Quick Start Overview](../README.md) - Project overview and structure
- [Live API Documentation](http://localhost:4001/api/docs) - Interactive Swagger UI
- [OpenAPI Specification](http://localhost:4001/openapi.json) - Machine-readable API spec

### 🏗️ Architecture & Core Concepts
- [System Architecture](architecture/overview.md) - Multi-tenant design patterns
- [Event-Driven Processing](architecture/events.md) - Outbox pattern and async workers
- [State Management](architecture/state-machines.md) - Business rule enforcement
- [Security Model](architecture/security.md) - Authentication and authorization

### 📋 Core Modules
- [Workstream (Sales Pipeline)](modules/workstream.md) - Lead management and sales process
- [Clients Management](modules/clients.md) - Customer relationship management
- [People & Staffing](modules/people.md) - Resource allocation and skill tracking
- [Engagements (Projects)](modules/engagements.md) - Project lifecycle management
- [Billing & Contracts](modules/billing.md) - Financial management and invoicing
- [Automation Rules](modules/automation.md) - Workflow automation and triggers
- [MCP (AI Integration)](modules/mcp.md) - AI-powered enrichment and insights

### 💻 Frontend Integration
- [TypeScript SDK](frontend/README.md) - Client SDK and example components
- [Billing Module UI](../frontend-integration-package/BILLING_MODULE_GUIDE.md) - Pre-built billing components
- [Automation Manager](../frontend-integration-package/AUTOMATION_MODULE_GUIDE.md) - Automation rule management
- [Engagements Manager](../frontend-integration-package/EngagementsManager.tsx) - Project management UI

### 🗄️ Database & Schema
- [Migration Scripts](../api/scripts/) - Database schema evolution
- [People Module Migrations](../api/scripts/migrations/) - Staffing module schema
- [Migration Runner](../api/scripts/run-people-migrations.js) - Automated migration tool
- [Database Patterns](development/database-patterns.md) - Multi-tenant SQL patterns

### 🧪 Development & Testing
- [Coding Standards](WRITING_GUIDE.md) - Development conventions and guidelines
- [API Testing](../api/test/) - Unit and integration test suites
- [Module Development](development/new-modules.md) - Adding new functionality
- [Contributing Guidelines](development/contributing.md) - Pull request workflow

### 📊 Current Status
**Version**: v2.1 (Workstream Module Final Tightenings)  
**Last Updated**: September 8, 2025  
**API Status**: ✅ Production Ready  
**Database**: Azure SQL Server  
**Framework**: Node.js 18+ + TypeScript + Express

### 🔧 Developer Tools
- [Backend Development](../api/README.md) - API development setup
- [Frontend Package](../frontend-integration-package/README.md) - Client library usage
- [API Scripts](../api/scripts/) - Utility scripts and migrations
- [Test Utilities](../archive/test-scripts/) - Development testing tools

#### OpenAPI / Swagger
- Live Swagger UI: http://localhost:4001/api/docs (spec: http://localhost:4001/openapi.json)
- Refresh snapshot (dev):
  - Generate spec: `cd api && npm run build && npm run gen:api:snapshot:local`
  - Update TS types: `cd frontend-integration-package && npx openapi-typescript ../api/openapi.snapshot.json -o api-types.ts`

## 🤖 AI Collaboration

- **Working with AI**: Use [AI Collaboration Guide](../AI_COLLABORATION_GUIDE.md) for comprehensive AI assistant instructions
- **Quick Reference**: Copy [AI Quick Reference](../AI_QUICK_REFERENCE.md) when starting AI sessions
- **Development Patterns**: Share these guides to ensure AI follows project conventions

## 🆘 Quick Help

- **Quick Issues**: Check [Troubleshooting Guide](troubleshooting/common-issues.md)
- **API Questions**: See [API Documentation](api/overview.md)
- **Setup Problems**: Follow [Installation Guide](../api/README.md)
- **Development**: Read [Development Guide](development/guide.md)

## 📞 Support Channels

- **Technical Issues**: Create an issue in the repository
- **Documentation**: Contribute improvements via pull requests
- **API Support**: Check OpenAPI docs at `/api/docs`
- **AI Assistance**: Use the AI collaboration guides for consistent AI behavior

---

*This documentation hub consolidates all guides, specs, and references in one organized location. For the most current API reference, always check the live OpenAPI specification at your running instance.*
