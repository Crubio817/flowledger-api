# FlowLedger API (Node + Express + TypeScript)

This API mirrors the FlowLedger Azure SQL schema. It exposes REST endpoints with pagination, validation, and FK-aware logic. Suitable for Azure App Service.

## Setup

1) Install Node.js 20+
2) Copy env
```
cp .env.example .env
```
3) Install deps
```
npm install
```
4) Run dev
```
npm run dev
```

API: http://localhost:4000

## Initial Routes
- GET /healthz
- /api/clients (CRUD)
- /api/audits (CRUD)
- /api/views (dashboard-stats, audit-recent-touch)

Follow the patterns to implement remaining tables.

## Auth to Azure SQL

The DB connection supports multiple auth modes via `SQL_AUTH`:

- sql (default): username/password using `SQL_USER` and `SQL_PASSWORD`.
- aad-default: Azure AD Default Credential (works on Azure with Managed Identity, or local dev with `az login`).
- aad-msi: Explicit Managed Identity for App Service/Functions. Optional `AZURE_CLIENT_ID` to select user-assigned MI.
- aad-access-token: Acquire token via `@azure/identity` and pass as access token.

Env variables:

- SQL_SERVER, SQL_DATABASE (required)
- SQL_AUTH=sql|aad-default|aad-msi|aad-access-token
- For sql: SQL_USER, SQL_PASSWORD
- For aad-msi/aad-default: optional AZURE_CLIENT_ID (aka MI client id)
- SQL_ENCRYPT=true, SQL_TRUST_SERVER_CERTIFICATE=false

When the server starts it logs `sql.auth` mode to aid troubleshooting.
