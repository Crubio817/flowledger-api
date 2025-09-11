# FlowLedger API Modules

## Docs & Knowledge Module

### Overview
The Docs & Knowledge module provides comprehensive document lifecycle management, versioning, approvals, and sharing capabilities. It serves as the backbone for proposals, SOWs, audit reports, deliverables, SOPs/runbooks, and evidence.

### Core Concepts
- **Documents**: Core entities with types (proposal, sow, report, etc.), status lifecycle (draft→in_review→approved→released), and classification (internal, client_view, confidential).
- **Versions**: Immutable snapshots with hashing for audit trails.
- **Links**: Contextual associations to entities (clients, pursuits, engagements, etc.).
- **Templates**: Reusable structures for generating documents from data.
- **Approvals**: Multi-approver workflows (sequential or parallel).
- **Binders**: Deliverable packs rendered to PDF/ZIP.
- **Knowledge Articles**: Publishable SOPs/runbooks with taxonomy.
- **Share Links**: Secure external sharing with expiration and watermarking.

### Key Features
- Event-sourced state transitions with guards.
- Multi-tenant with org_id filtering.
- File storage with hashing and virus scanning.
- Template rendering from entity data (pursuits, engagements, billing).
- Full-text search with OCR support.
- Automations: Proposal generation, audit report assembly, invoice PDF rendering.

### API Endpoints
- `POST /docs` - Create document (upload, from template, external link).
- `GET /docs` - List documents with pagination and filters.
- `POST /docs/{id}/versions` - Add new version.
- `POST /docs/{id}/approve` - Request/start approvals.
- `POST /docs/{id}/share` - Create share link.
- `POST /templates/{id}/render` - Render document from template.
- `POST /binders` - Create binder.
- `GET /search/docs` - Search documents.

### Database Tables
- `app.document` - Core documents.
- `app.document_version` - Immutable versions.
- `app.document_link` - Entity associations.
- `app.template` - Generation templates.
- `app.share_link` - Sharing tokens.
- `app.approval_request` - Approval workflows.
- `app.binder` / `app.binder_item` - Deliverable packs.
- `app.knowledge_article` - Knowledge base.
- `app.document_audit` - Audit trail.
- `app.document_search_index` - Search index.

### Guards & State Machine
- `assertDocumentCanTransition` in `guards.ts` for status changes.
- Events: `document.created`, `document.version.approved`, etc. in `work_event`.

### Workers & Automations
- Outbox worker for approvals and renders.
- File ingestion: Upload → scan → hash → index.
- Template rendering with variable resolution from domain queries.

### Security & Compliance
- Classification-based permissions.
- Retention policies and legal holds.
- Watermarking and no-download options for shares.
- Immutable evidence with hashes for audits.

### Integration Points
- Comms: Save attachments as docs, draft emails for shares.
- Engagements/Audits: Auto-link evidence, generate reports.
- Billing: Render invoice PDFs.
- Frontend: `docs-api.ts` for client integration.

### Development Notes
- Always filter by `org_id` in queries.
- Use parameterized queries with `mssql.input`.
- Wrap handlers with `asyncHandler`.
- Emit events for state changes.
- Test with `npm run db:migrate:core-modules` for schema updates.