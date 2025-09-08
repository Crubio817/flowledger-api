# Clients Module

## Overview

The Clients Module manages client data, contacts, and onboarding tasks within the Flowledger API. It supports multi-tenant operations, audit logging, and integration with other modules like Workstream. This module handles CRUD operations for clients, their contacts, and related entities, ensuring data integrity and security.

### Key Features
- **Multi-Tenant**: All data scoped by [`org_id`](src/workers/outbox.ts).
- **Audit Trail**: Activity logging for changes.
- **Onboarding Tasks**: Track client setup progress.
- **Contact Management**: Linked contacts with enrichment.
- **Integration**: Links to signals, candidates, and pursuits.

### Technology Stack
- **Backend**: Node.js/Express with TypeScript.
- **Database**: SQL Server with tables like `clients`, `client_contacts`, `client_onboarding_tasks`.
- **Validation**: Zod schemas in [`src/validation/schemas.ts`](src/validation/schemas.ts).

## Database Schema

### Core Tables
- **`clients`**: Client details (id, name, is_active, org_id).
- **`client_contacts`**: Contacts linked to clients.
- **`client_onboarding_tasks`**: Tasks for client setup.
- **`client_notes`**: Notes and history.

### Key Constraints
- **Multi-Tenancy**: [`org_id`](api/src/workers/outbox.ts) in all tables.
- **FKs**: `client_contacts.client_id` → `clients.id`.

## API Reference

### Authentication
Requires JWT with [`org_id`](src/workers/outbox.ts) claim.

### Endpoints
- `GET /api/clients` - List clients (paginated).
- `POST /api/clients` - Create client.
- `GET /api/clients/{id}` - Get client details.
- `PATCH /api/clients/{id}` - Update client.
- `DELETE /api/clients/{id}` - Delete client.
- `GET /api/clients/{id}/contacts` - List contacts.
- `POST /api/clients/{id}/contacts` - Add contact.
- `GET /api/clients/{id}/tasks` - List onboarding tasks.

### Response Formats
- **Clients**: `{ id, name, is_active, org_id, created_at }`.
- **Contacts**: `{ id, client_id, name, email, phone }`.

## Development Guide

### Setup
1. Ensure tables exist (run DDL if needed).
2. Use [`src/routes/clients.ts`](src/routes/clients.ts) for routes.
3. Apply auth middleware.

### Key Files
- [`src/routes/clients.ts`](src/routes/clients.ts): Route handlers.
- [`src/validation/schemas.ts`](src/validation/schemas.ts): Client schemas.

### Testing
- Unit: Route logic.
- Integration: API with JWT.

For questions, refer to the codebase.
