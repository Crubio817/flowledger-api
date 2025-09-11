# People Module

Overview, backend implementation details, and frontend specs.

## Read First

- Backend implementation: ./../../api/src/services/people/README.md
- Frontend spec (API + components): ./../../people-module-frontend-spec.md
- Frontend quickstart (People): ./../../people-module-frontend-README.md

## Schema & Migrations

- Core entities and billing extensions: ./../../api/scripts/migrations/
  - 20250909_add_people_core.sql
  - 20250909_add_contracts_billing.sql
  - 20250909_add_constraints_triggers.sql

## API Endpoints

- Rank candidates: `POST /api/staffing-requests/:id/rank`
  - Query: `org_id` (required), `limit` (default 20), `include_rate_preview` (default true)
  - Returns: ranked people with FitScore reasons and optional rate preview
  - Example:
    - `curl -X POST "http://localhost:4001/api/staffing-requests/123/rank?org_id=1&limit=20&include_rate_preview=true"`

- Assignments (immutable snapshots)
  - Create: `POST /api/assignments`
    - Body: `{ org_id, person_id, engagement_id, role_template_id, start_date, end_date, alloc_pct?, status? }`
  - Update: `PATCH /api/assignments/{assignment_id}`
    - Body: updatable fields only (snapshot fields rejected)
  - Cancel: `DELETE /api/assignments/{assignment_id}` sets `status='cancelled'`

- Rate Preview: `GET /api/rates/preview`
  - Query: `org_id` (required), `role_template_id?`, `level?`, `skills?` (CSV), `engagement_id?`, `client_id?`, `person_id?`, `target_currency?`, `as_of?`
  - Returns: base, premiums, scarcity, fx, final amount with precedence audit

All endpoints are documented in Swagger under the People tag.

## Developer Pointers

- Code: ranking logic in `api/src/services/people/fitScore.ts`
- Code: rate resolution in `api/src/services/people/rateResolver.ts`
- Routes: `api/src/routes/people.ts`
- Audit: assignment snapshot immutability enforced in DB (see migrations)

See backend README above for performance targets and architecture notes (FitScore, rate precedence, availability).
