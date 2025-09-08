# Modules Overview

## Overview

The Flowledger API consists of several modules for managing clients, workstreams, and AI integrations. Each module is multi-tenant, event-driven, and designed for scalability.

### Core Modules
- **Clients**: Manage client data and contacts.
- **Workstream**: Signal → Candidate → Pursuit flow with SLAs and checklists.
- **MCP**: AI tools for enrichment and analysis.
- **Audits**: Logging and compliance.

### Shared Components
- **Authentication**: JWT with [`org_id`](src/workers/outbox.ts).
- **Database**: SQL Server with multi-tenancy.
- **Workers**: Outbox for async processing.

### Development Guide
- Refer to individual READMEs for details.
- Use [`src/server.ts`](src/server.ts) for routing.

For questions, refer to the codebase.
