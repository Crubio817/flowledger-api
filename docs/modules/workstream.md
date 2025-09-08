# Workstream (Sales) Module

Signal → Candidate → Pursuit lifecycle with SLAs, proposals, and analytics.

## Reference

- Module overview, schema, and endpoints: ./../../api/README.md

## Highlights

- Guarded state machines for candidates and pursuits
- Outbox, SLA checks, analytics views
- MCP integration for enrichment

## Recent Improvements (v2.1 Final Tightenings)

### Audit-Safe Outbox Processing
- ✅ Atomic claiming with `UPDATE ... OUTPUT` pattern
- ✅ Race condition prevention across multiple worker instances
- ✅ Exponential backoff retry logic (1min → 60min max)
- ✅ Dead letter queue for failed events
- ✅ Stale claim cleanup (5-minute timeout)

### Idempotency & Reliability
- ✅ Unique constraints on critical operations
- ✅ Natural key-based duplicate prevention
- ✅ Transaction rollback on failures
- ✅ Comprehensive error logging and tracking

### Checklist Gating System
- ✅ Pink checklist required for pursuit submission
- ✅ Red checklist required for won/lost transitions
- ✅ Completion percentage tracking
- ✅ Business rule validation with guard functions

### SLA Coverage Expansion
- ✅ Triage SLA: First touch within configured hours
- ✅ Proposal SLA: Submit within hours of promotion
- ✅ Response SLA: Follow-up within hours of proposal send
- ✅ Automated breach detection and alerting
- ✅ Organization-specific SLA rule configuration

### Today Panel Dashboard
- ✅ Unified view of candidates and pursuits
- ✅ Priority-based sorting (urgent → high → medium → low)
- ✅ Due date and assignee tracking
- ✅ Real-time status updates
- ✅ Tag-based filtering and organization

## Monitoring & Observability

### Health Checks
```
GET /healthz     -- Basic liveness check
GET /api/health  -- API health with database connectivity
```

### Logging
- Event processing status and errors
- SLA breach notifications
- Database connection pool metrics
- Worker claim/release operations

### Error Handling
- Structured error responses with HTTP status codes
- Database transaction rollback on failures
- Dead letter queue for unprocessable events
- Comprehensive error context in logs
