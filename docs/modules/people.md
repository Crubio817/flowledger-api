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

## Related Endpoints

- Rank candidates: `POST /staffing-requests/:id/rank`
- Assignments: `POST /assignments` (immutable rate snapshot)
- Rate preview: `GET /rates/preview`

See backend README above for performance targets and architecture notes (FitScore, rate precedence, availability).

