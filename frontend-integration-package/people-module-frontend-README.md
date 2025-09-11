# People Module Frontend Quickstart

This guide shows how to call the People endpoints from a frontend, and what to expect.

## Endpoints

- POST `/api/staffing-requests/{id}/rank` — Rank candidates with FitScore and optional rate preview
- POST `/api/assignments` — Create assignment with immutable rate snapshot
- PATCH `/api/assignments/{assignment_id}` — Update (non-snapshot) fields
- DELETE `/api/assignments/{assignment_id}` — Cancel assignment (soft)
- GET `/api/rates/preview` — Resolve effective rate with breakdown

See full Swagger at `/api/docs`.

## Examples

Rank candidates:
```ts
await fetch(`/api/staffing-requests/${requestId}/rank?org_id=${orgId}&limit=20&include_rate_preview=true`, { method: 'POST' })
  .then(r => r.json());
```

Create assignment:
```ts
await fetch('/api/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  org_id: 1, person_id: 1, engagement_id: 1, role_template_id: 1, start_date: '2025-10-01', end_date: '2025-12-31'
})}).then(r => r.json());
```

Rate preview:
```ts
await fetch(`/api/rates/preview?org_id=${orgId}&role_template_id=1&skills=1,2,3&engagement_id=1`)
  .then(r => r.json());
```

## Types

Generate types from OpenAPI:
```bash
cd api && npm run build && npm run gen:api:snapshot:local
cd ../frontend-integration-package && npx openapi-typescript ../api/openapi.snapshot.json -o api-types.ts
```

