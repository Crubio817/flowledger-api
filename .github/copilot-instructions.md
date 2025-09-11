## FlowLedger – Copilot Instructions (AI Coding Agents)

Purpose: Fast onboarding for autonomous edits. Follow these patterns precisely; prefer copying existing file style over inventing new abstractions.

### 1. Architecture Snapshot
- Monorepo: `api/` (Express + TypeScript + Azure SQL), `frontend-integration-package/` (SDK), `web/` (demo UI), `docs/` (OpenAPI + MkDocs).
- Core backend pillars: strict multi-tenancy (`org_id`), event sourcing (`app.work_event`), guarded state machines (`src/state/guards.ts`), background workers (`src/workers/*`).
- Data mutation flow: HTTP route → validate & guard → write rows (with `org_id`) → insert event into `app.work_event` → outbox worker processes side‑effects.

### 2. Critical Files
- Server / wiring: `api/src/server.ts` (routes registration, OpenAPI, WebSocket broadcast helper).
- DB pool & auth modes: `api/src/db/pool.ts` (`SQL_AUTH` = `sql` | `aad-msi` | `aad-default`).
- HTTP helpers: `api/src/utils/http.ts` (`asyncHandler`, `ok`, `badRequest`, `listOk`, `notFound`, `getPagination`).
- Guards & transitions: `api/src/state/guards.ts` (`assertTx`, `PURSUIT_TX`, `CANDIDATE_TX`, `COMMS_THREAD_TX`, etc.).
- Workers: `api/src/workers/outbox.ts`, `sla.ts`, `commsSync.ts` (pattern reference: claim → process → mark processed / retry with backoff columns).
- Validation: `api/src/validation/*` (Zod schemas; create new schema near related route if missing).

### 3. Non‑Negotiable Patterns
1. Never trust `org_id` from body. Accept only from query (or auth context once added). Always bind: `.input('orgId', sql.Int, orgId)` and `WHERE org_id=@orgId`.
2. Every handler wrapped with `asyncHandler`; never use raw `try/catch` unless adding custom rollback logic.
3. Paginate list endpoints: use `getPagination()`; cap `limit` (helper enforces). Always stable `ORDER BY created_at DESC` (or domain‑specific column) + `OFFSET/FETCH`.
4. State changes must pass `assertTx(current, requested, MAP)`. Return 409 or 422 via `badRequest` on invalid transition.
5. Emit domain events: insert a row into `app.work_event` with `event_name`, `item_type`, `item_id`, `org_id`, minimal JSON payload (IDs / metadata only—no PII blobs).
6. Parameterize all SQL. No string concatenation. Keep one request chain per route (avoid opening multiple pools).
7. For mutation routes, respond with the newly affected row (re‑`SELECT` by PK + `org_id`).
8. No silent deletes: prefer soft state via status when pattern exists; only hard delete if precedent in that entity’s existing routes.

### 4. Route Skeleton (copy verbatim then adjust)
```ts
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req);
  const orgId = Number(req.query.org_id);
  if (!orgId) return badRequest(res, 'org_id required');
  const pool = await getPool();
  const r = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('limit', sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query(`SELECT * FROM app.entity WHERE org_id=@orgId ORDER BY created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  listOk(res, r.recordset, { page, limit });
}));
```

### 5. Events & Workers
- Insert event example:
```ts
await pool.request()
  .input('orgId', sql.Int, orgId)
  .input('eventName', sql.NVarChar, 'pursuit.stage.changed')
  .input('itemType', sql.NVarChar, 'pursuit')
  .input('itemId', sql.Int, pursuitId)
  .input('payload', sql.NVarChar, JSON.stringify({ from: prev, to: next }))
  .query(`INSERT INTO app.work_event (org_id,event_name,item_type,item_id,payload_json) VALUES (@orgId,@eventName,@itemType,@itemId,@payload)`);
```
- Outbox worker handles unprocessed rows (`processed_at IS NULL`) with retry/backoff; do not replicate logic—extend via conditional inside worker.

### 6. State Machines (add new transitions only in `guards.ts`)
- Pursuits: `qual → pink → red → submit → (won|lost)`.
- Candidates: defined in `CANDIDATE_TX` (no reverse from `promoted`).
- Comms threads: separate status + process_state maps (`COMMS_THREAD_TX` variants). Modifications require updating both map & corresponding validation.

### 7. Testing & Verification
- Prefer adding/adjusting tests in `api/test/*.ts` mirroring existing ones for new endpoints (happy path + invalid transition + org isolation).
- Quick manual smoke: start dev `npm run dev`, then call endpoint with `?org_id=1` using existing entity IDs (see seed/migration scripts for examples).

### 8. DB & Migrations
- Migration scripts: `api/scripts/*.sql` executed via dedicated npm scripts (`npm run db:migrate:core-modules`, etc.). New structural changes: create timestamped SQL under same folder; keep idempotent checks (`IF NOT EXISTS ... CREATE`).
- Avoid in‑code schema creation. Never auto‑migrate inside request handlers.

### 9. OpenAPI / SDK Sync
- After adding/renaming routes: run `npm run gen:api:snapshot` then copy/update snapshot in `frontend-integration-package/` & `web/` if required.
- Keep consistent tags and path parameter names; follow existing naming (`/api/pursuits/:id/stage`).

### 10. WebSocket Notes
- Broadcast utility in `server.ts` (simple topic subscribe). If emitting from a worker, import the broadcaster or enqueue event then let HTTP layer push on next poll—avoid tight coupling.

### 11. Common Pitfalls / Anti‑Patterns
- DO NOT: read `org_id` from body, interpolate IDs into SQL, skip `assertTx`, return huge unpaginated lists, embed secrets or large blobs into `work_event.payload_json`.
- DO: reuse existing column order & naming, keep timestamps UTC (`SYSUTCDATETIME()` in SQL), guard all state transitions centrally.

### 12. Useful References
- Patterns overview: `AI_QUICK_REFERENCE.md`, collaboration norms: `AI_COLLABORATION_GUIDE.md`.
- Good route examples: `src/routes/engagements.ts`, `src/routes/pursuits.actions.ts`.
- Worker logic: `src/workers/outbox.ts` (claim pattern), `src/workers/sla.ts`.
- Guard usage: search for `assertTx(` in routes.

### 13. When Unsure
Copy an adjacent module’s implementation and adapt entity/table names; maintain pagination + guards + event emission. Ask for clarification only if business rule ambiguity blocks coding.

---
Minimal, precise, repeatable. Follow this and changes integrate cleanly with existing automation.
