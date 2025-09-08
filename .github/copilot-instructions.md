## FlowLedger – Copilot Instructions (for AI coding agents)

Big picture
- Monorepo with Node.js/TypeScript API on Azure SQL. Event-sourced via `app.work_event`, strict multi-tenancy via `org_id`, and guarded state machines.
- Key areas: `api/` (backend), `docs/` (OpenAPI), `frontend-integration-package/` (SDK), `web/` (demo UI).

Where to work (backend)
- Entry/server: `api/src/server.ts` (routes, OpenAPI, WebSocket).
- SQL pool/auth: `api/src/db/pool.ts` (SQL/AAD auth modes via env SQL_AUTH).
- HTTP helpers: `api/src/utils/http.ts` (`ok`, `badRequest`, `listOk`, `asyncHandler`).
- Guards: `api/src/state/guards.ts` (`assertTx`, `PURSUIT_TX`, `CANDIDATE_TX`, `COMMS_THREAD_TX`).
- Routes live in `api/src/routes/*`; background workers in `api/src/workers/*` (outbox, SLA, comms sync).

Non-negotiable patterns
- Always filter by org_id and use parameterized queries (mssql `.input('orgId', sql.Int, orgId) ... WHERE org_id = @orgId`). Never trust org_id from body.
- Wrap every handler with `asyncHandler`. Use `ok()/badRequest()/listOk()/notFound()` for responses.
- Validate inputs (Zod schemas live under `src/validation/*` when present) and enforce transitions with `assertTx` from `guards.ts`.
- Emit events by inserting into `app.work_event`; workers claim/process with retry/backoff (`api/src/workers/outbox.ts`).

Route skeleton (use this exact shape)
```ts
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req);
  const orgId = Number(req.query.org_id); // body is forbidden
  if (!orgId) return badRequest(res, 'org_id required');
  const pool = await getPool();
  const r = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('limit', sql.Int, limit).input('offset', sql.Int, offset)
    .query('SELECT * FROM app.entity WHERE org_id=@orgId ORDER BY created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY');
  listOk(res, r.recordset, { page, limit });
}));
```

Runbook (api/)
- Dev server (hot reload): `npm run dev`
- Build/start: `npm run build && npm start`
- DB checks/migrations: `npm run db:ping`, `npm run db:migrate:core-modules`, `npm run db:migrate:fix-int-client`
- OpenAPI snapshot: `npm run gen:api:snapshot` (or `:local` for local scan)

Integration points
- MCP endpoint: POST `/mcp` handled by `api/src/mcp.ts`; tools in `api/src/mcp-tools.ts`.
- WebSocket server created in `server.ts` (simple subscribe/unsubscribe messages); Comms WS DB-backed endpoints in `routes/comms.ts`.

Gotchas observed in code
- Some legacy routes read `org_id` from query; keep body-free and always bind `@orgId` in SQL.
- State transitions must go through `guards.ts` (e.g., `ensureSubmitChecklistPasses` before `submit`). Returning 409/422 is expected.
- Keep result sets paginated; cap `limit` (see `getPagination()` in `http.ts`).

Useful references
- Multi-tenant, state, patterns: `AI_QUICK_REFERENCE.md`, `AI_COLLABORATION_GUIDE.md`.
- Examples: `routes/engagements.ts`, `routes/pursuits.actions.ts`, `workers/outbox.ts`.

If unsure, mirror existing route/SQL patterns and add org_id filters, guard checks, pagination, and outbox events.
<parameter name="filePath">/workspaces/flowledger-api/.github/copilot-instructions.md
