# Workstream Module Backend Implementation

## Overview

The Workstream backend is implemented as an Express.js router with TypeScript, following the established patterns in the FlowLedger API. It includes routes, workers, state guards, and database operations.

## File Structure

```
api/src/
├── routes/
│   └── workstream.ts          # Main API routes
├── workers/
│   ├── outbox.ts              # Event processing worker
│   └── sla.ts                 # SLA monitoring worker
├── state/
│   └── guards.ts              # State transition guards
└── db/
    └── pool.ts                # Database connection pool
```

## Routes Implementation

### Route Handler Pattern

All route handlers follow the established pattern:

```typescript
router.get('/endpoint', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id);
  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  // Database operations
  // ...

  ok(res, result);
}));
```

### Key Routes

#### Statistics Endpoint
```typescript
router.get('/stats', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT
        'signals' as category,
        COUNT(*) as count,
        COUNT(CASE WHEN ts > DATEADD(day, -7, SYSUTCDATETIME()) THEN 1 END) as recent_count
      FROM app.signal
      WHERE org_id = @orgId
      UNION ALL
      SELECT 'candidates', COUNT(*), COUNT(CASE WHEN created_at > DATEADD(day, -7, SYSUTCDATETIME()) THEN 1 END)
      FROM app.candidate WHERE org_id = @orgId
      UNION ALL
      SELECT 'pursuits', COUNT(*), COUNT(CASE WHEN created_at > DATEADD(day, -7, SYSUTCDATETIME()) THEN 1 END)
      FROM app.pursuit WHERE org_id = @orgId
    `);

  // Transform to key-value pairs
  const stats: Record<string, { total: number; recent: number }> = {};
  result.recordset.forEach(row => {
    stats[row.category] = {
      total: row.count,
      recent: row.recent_count
    };
  });

  ok(res, stats);
}));
```

#### Signals List Endpoint
```typescript
router.get('/signals', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT signal_id, org_id, source_type, source_ref, snippet,
             contact_id, client_id, ts, problem_phrase, solution_hint,
             urgency_score, dedupe_key, cluster_id, owner_user_id,
             created_at, updated_at
      FROM app.signal
      WHERE org_id = @orgId
      ORDER BY ts DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  // Get total count for pagination
  const countResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .query(`SELECT COUNT(*) as total FROM app.signal WHERE org_id = @orgId`);

  listOk(res, result.recordset, {
    page,
    limit,
    total: countResult.recordset[0].total
  });
}));
```

#### Today Panel Endpoint
```typescript
router.get('/today', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id) || 1;

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT item_type, item_id, label as title, state as status,
             last_touch_at as updated_at, due_date, sla_metric, badge
      FROM app.v_today_panel
      WHERE org_id = @orgId
      ORDER BY
        CASE WHEN badge = 'red' THEN 1
             WHEN badge = 'amber' THEN 2
             ELSE 3 END,
        due_date ASC,
        last_touch_at DESC
    `);

  ok(res, result.recordset);
}));
```

## State Guards

### State Machine Definitions

```typescript
// state/guards.ts
export const CANDIDATE_TX = {
  new: ['triaged'],
  triaged: ['nurture','on_hold','promoted','archived'],
  nurture: ['triaged','on_hold','archived'],
  on_hold: ['triaged','archived'],
  promoted: [], archived: []
} as const;

export const PURSUIT_TX = {
  qual: ['pink'],
  pink: ['red','qual'],
  red: ['submit','pink'],
  submit: ['won','lost'],
  won: [], lost: []
} as const;
```

### Transition Validation

```typescript
export function assertTx<T extends string>(
  map: Record<string, readonly T[]>, from: T, to: T, label: string
) {
  const allowed = map[from] ?? [];
  if (!allowed.includes(to)) throw Object.assign(new Error(`Invalid ${label} ${from}→${to}`), { status: 422 });
}
```

### Checklist Guard

```typescript
export async function ensureSubmitChecklistPasses(orgId: number, pursuitId: number, pool: any) {
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('pursuitId', sql.BigInt, pursuitId)
    .query(`
      SELECT ready FROM app.v_pursuit_checklist_ready
      WHERE org_id = @orgId AND pursuit_id = @pursuitId
    `);

  const row = result.recordset[0];
  if (!row || row.ready !== 1) {
    // Get list of incomplete items
    const incompleteResult = await pool.request()
      .input('orgId', sql.Int, orgId)
      .input('pursuitId', sql.BigInt, pursuitId)
      .query(`
        SELECT name FROM app.pursuit_checklist
        WHERE org_id = @orgId AND pursuit_id = @pursuitId AND is_required = 1 AND is_done = 0
      `);

    const missing = incompleteResult.recordset.map((r: any) => r.name);
    const e: any = new Error(`Submit blocked; incomplete checklist: ${missing.join(', ')}`);
    e.status = 409;
    throw e;
  }
}
```

## Workers

### Outbox Worker

The outbox worker processes events reliably with retry logic and dead lettering:

```typescript
// workers/outbox.ts
export async function tick() {
  const pool = await getPool();
  const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Atomic claiming: claim up to 10 unprocessed events
  const claimResult = await pool.request()
    .input('workerId', sql.VarChar(64), workerId)
    .input('now', sql.DateTimeOffset, new Date())
    .query(`
      UPDATE TOP (10) app.work_event
      SET claimed_at = @now, claimed_by = @workerId
      OUTPUT INSERTED.*
      WHERE processed_at IS NULL AND claimed_at IS NULL
        AND (dead_letter_at IS NULL OR dead_letter_at > @now)
      ORDER BY created_at ASC
    `);

  const events = claimResult.recordset;

  for (const event of events) {
    try {
      await processEvent(event);

      // Mark as processed
      await pool.request()
        .input('id', sql.BigInt, event.work_event_id)
        .input('workerId', sql.VarChar(64), workerId)
        .query(`
          UPDATE app.work_event
          SET processed_at = SYSUTCDATETIME(), claimed_at = NULL, claimed_by = NULL
          WHERE work_event_id = @id AND claimed_by = @workerId
        `);

      console.log(`Processed event ${event.work_event_id}: ${event.event_name}`);
    } catch (err) {
      // Handle retry or dead lettering
      // ... (see full implementation)
    }
  }

  // Clean up stale claims
  await pool.request()
    .input('staleThreshold', sql.DateTimeOffset, new Date(Date.now() - 5 * 60 * 1000))
    .query(`
      UPDATE app.work_event
      SET claimed_at = NULL, claimed_by = NULL
      WHERE claimed_at < @staleThreshold AND processed_at IS NULL
    `);
}
```

### Event Processing

```typescript
async function processEvent(event: any) {
  const { event_name, payload_json, item_type, item_id, org_id } = event;
  const payload = payload_json ? JSON.parse(payload_json) : {};

  switch (event_name) {
    case 'candidate.promoted':
      await createProposalV1IfNeeded(org_id, payload.pursuit_id);
      break;
    case 'pursuit.submit':
      await sendProposalEmail(org_id, item_id, payload.proposal_id);
      break;
    case 'proposal.sent':
      await notifyProposalSent(org_id, item_id, payload.proposal_id);
      break;
    case 'pursuit.won':
      await notifyPursuitWon(org_id, item_id, payload.proposal_id);
      break;
    case 'pursuit.lost':
      await notifyPursuitLost(org_id, item_id, payload.reason);
      break;
    default:
      console.log(`Unhandled event: ${event_name}`);
  }
}
```

### SLA Worker

Monitors and tracks SLA compliance:

```typescript
// workers/sla.ts
export async function checkSLAs() {
  const pool = await getPool();

  // Check various SLA types
  const submitBreaches = await pool.request().query(`
    SELECT p.pursuit_id, p.org_id, pr.sent_at, r.threshold_hrs, r.rule_id
    FROM app.pursuit p
    JOIN app.proposal pr ON p.pursuit_id = pr.pursuit_id AND p.org_id = pr.org_id
    JOIN app.sla_rule r ON r.org_id = p.org_id AND r.metric = 'submit_sla' AND r.is_active = 1
    WHERE p.pursuit_stage = 'submit' AND pr.status = 'sent'
    AND DATEDIFF(hour, pr.sent_at, SYSUTCDATETIME()) > r.threshold_hrs
  `);

  // Similar queries for triage and proposal SLAs...

  // Insert breaches
  const allBreaches = [
    ...submitBreaches.recordset.map(b => ({ ...b, item_type: 'pursuit', item_id: b.pursuit_id })),
    // ... other breach types
  ];

  for (const b of allBreaches) {
    // Check if breach already exists
    const existing = await pool.request()
      .input('orgId', sql.Int, b.org_id)
      .input('item_type', sql.VarChar(12), b.item_type)
      .input('item_id', sql.BigInt, b.item_id)
      .input('rule_id', sql.Int, b.rule_id)
      .query(`
        SELECT breach_id FROM app.sla_breach
        WHERE org_id = @orgId AND item_type = @item_type AND item_id = @item_id AND rule_id = @rule_id AND resolved_at IS NULL
      `);

    if (existing.recordset.length === 0) {
      await pool.request()
        .input('orgId', sql.Int, b.org_id)
        .input('item_type', sql.VarChar(12), b.item_type)
        .input('item_id', sql.BigInt, b.item_id)
        .input('rule_id', sql.Int, b.rule_id)
        .input('reason_code', sql.VarChar(32), b.item_type === 'pursuit' ? 'response_overdue' : 'untouched')
        .query(`
          INSERT INTO app.sla_breach (org_id, item_type, item_id, rule_id, reason_code)
          VALUES (@orgId, @item_type, @item_id, @rule_id, @reason_code)
        `);
    }
  }
}
```

## Database Operations

### Parameterized Queries

All database operations use parameterized queries to prevent SQL injection:

```typescript
const result = await pool.request()
  .input('orgId', sql.Int, orgId)
  .input('signalId', sql.BigInt, signalId)
  .query(`
    SELECT * FROM app.signal
    WHERE org_id = @orgId AND signal_id = @signalId
  `);
```

### Transaction Management

Critical operations use transactions for consistency:

```typescript
const transaction = pool.transaction();
await transaction.begin();

try {
  // Multiple operations
  await transaction.request()
    .input('orgId', sql.Int, orgId)
    .query('UPDATE app.candidate SET status = @newStatus WHERE candidate_id = @candidateId');

  await transaction.request()
    .input('orgId', sql.Int, orgId)
    .query('INSERT INTO app.work_event (event_name, ...) VALUES (...)');

  await transaction.commit();
} catch (err) {
  await transaction.rollback();
  throw err;
}
```

## Views and Computed Data

### Today Panel View

```sql
-- scripts/20250907_today_panel_view.sql
CREATE VIEW app.v_today_panel AS
SELECT TOP (200)
  'candidate' AS item_type, c.candidate_id AS item_id, c.org_id,
  c.title AS label, c.status AS state, c.last_touch_at,
  NULL AS due_date,
  COALESCE(b.metric, '') AS sla_metric,
  CASE WHEN b.breach_id IS NOT NULL THEN 'red'
       WHEN DATEDIFF(hour, c.last_touch_at, SYSUTCDATETIME()) > 72 THEN 'amber'
       ELSE 'green' END AS badge
FROM app.candidate c
LEFT JOIN app.sla_breach b ON b.item_type='candidate' AND b.item_id=c.candidate_id AND b.org_id=c.org_id AND b.resolved_at IS NULL
WHERE c.status IN ('triaged','nurture','on_hold')
UNION ALL
SELECT 'pursuit', p.pursuit_id, p.org_id,
  CONCAT('Pursuit #', p.pursuit_id) AS label, p.pursuit_stage,
  (SELECT MAX(happened_at) FROM app.work_event e WHERE e.item_type='pursuit' AND e.item_id=p.pursuit_id) AS last_touch_at,
  p.due_date,
  COALESCE(b.metric, ''),
  CASE WHEN b.breach_id IS NOT NULL THEN 'red'
       WHEN p.due_date IS NOT NULL AND p.due_date < CAST(SYSUTCDATETIME() AS DATE) THEN 'amber'
       ELSE 'green' END
FROM app.pursuit p
LEFT JOIN app.sla_breach b ON b.item_type='pursuit' AND b.item_id=p.pursuit_id AND b.org_id=p.org_id AND b.resolved_at IS NULL
WHERE p.pursuit_stage IN ('qual','pink','red','submit');
```

### Checklist Ready View

```sql
-- scripts/20250907_final_tightenings.sql
CREATE VIEW app.v_pursuit_checklist_ready AS
SELECT pc.org_id, pc.pursuit_id,
  CASE WHEN MIN(CASE WHEN is_required=1 AND is_done=0 THEN 0 ELSE 1 END) = 1 THEN 1 ELSE 0 END AS ready
FROM app.pursuit_checklist pc
GROUP BY pc.org_id, pc.pursuit_id;
```

## Error Handling

### Structured Error Responses

```typescript
// utils/http.ts
export function badRequest(res: Response, message: string) {
  return res.status(400).json({ error: message });
}

export function notFound(res: Response, message: string) {
  return res.status(404).json({ error: message });
}

export function ok<T>(res: Response, data: T) {
  return res.json(data);
}

export function listOk<T>(res: Response, data: T[], pagination?: any) {
  return res.json({
    data,
    pagination
  });
}
```

### Async Handler Wrapper

```typescript
// utils/http.ts
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

## Testing

### Unit Tests

```typescript
// Example test for state transitions
describe('Candidate State Transitions', () => {
  test('should allow triaged -> promoted', () => {
    expect(() => assertTx(CANDIDATE_TX, 'triaged', 'promoted', 'candidate status')).not.toThrow();
  });

  test('should reject triaged -> won', () => {
    expect(() => assertTx(CANDIDATE_TX, 'triaged', 'won', 'candidate status')).toThrow();
  });
});
```

### Integration Tests

```typescript
describe('Workstream API', () => {
  test('GET /stats should return aggregated counts', async () => {
    const response = await request(app)
      .get('/api/workstream/stats')
      .query({ org_id: 1 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('signals');
    expect(response.body).toHaveProperty('candidates');
    expect(response.body).toHaveProperty('pursuits');
  });
});
```

## Performance Optimization

### Connection Pooling

```typescript
// db/pool.ts
import { sql } from 'mssql';

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

export async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
}
```

### Query Optimization

- Use appropriate indexes for common query patterns
- Implement pagination for large result sets
- Use `TOP` clause for limited results
- Avoid `SELECT *` in production queries

### Caching Strategy

Consider caching for:
- SLA rule lookups
- Taxonomy data
- Static configuration
- User permissions

## Deployment

### Worker Processes

```javascript
// Run outbox worker
if (require.main === module) {
  setInterval(tick, 30000); // Process every 30 seconds
  console.log('Outbox worker started');
}
```

### Health Checks

```typescript
// Health endpoint
router.get('/health', asyncHandler(async (req, res) => {
  const pool = await getPool();
  await pool.request().query('SELECT 1');

  ok(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected'
    }
  });
}));
```

## Monitoring and Observability

### Logging

```typescript
// Structured logging
console.log(JSON.stringify({
  level: 'info',
  message: 'Event processed',
  event_id: event.work_event_id,
  event_name: event.event_name,
  processing_time_ms: Date.now() - startTime
}));
```

### Metrics

- Event processing latency
- Queue depth
- SLA breach rates
- Database connection pool usage
- Error rates by endpoint

### Alerts

- Worker process failures
- High queue backlog
- SLA breach thresholds
- Database connection issues
- Memory usage spikes
