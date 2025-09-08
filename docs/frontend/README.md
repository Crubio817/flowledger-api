# Frontend Integration

TypeScript API types, axios client, and example UI modules for rapid integration.

## SDK & Utilities

- OpenAPI types: ./../../frontend-integration-package/api-types.ts
- Axios client: ./../../frontend-integration-package/api.ts
- Env example: `VITE_API_BASE` in ./../../frontend-integration-package/.env.local

## Ready-to-Use Modules

- Billing & Contracts guide: ./../../frontend-integration-package/BILLING_MODULE_GUIDE.md
- Billing components: ./../../frontend-integration-package/BillingManager.tsx, ./../../frontend-integration-package/billing-api.ts

## How to Use

1) Copy `api-types.ts` and `api.ts` into your frontend (or import as a package if published).
2) Set `VITE_API_BASE` to your API origin.
3) Follow module guides above for feature-specific UI.

