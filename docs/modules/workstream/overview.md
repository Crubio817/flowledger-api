# Workstream (Sales) Module

Signal → Candidate → Pursuit lifecycle with SLAs, proposals, and analytics.

## Reference

- Module overview, schema, and endpoints: ./../../api/README.md

## Highlights

- Guarded state machines for candidates and pursuits
- Outbox, SLA checks, analytics views
- MCP integration for enrichment
- **NEW**: Centralized configuration registry for rules management
- **NEW**: Explainable AI scoring with component breakdown
- **NEW**: Enhanced identity resolution and deduplication
- **NEW**: Intelligent priority ranking for Today panel

## Recent Improvements (v2.2 Hardening Update)

### Centralized Configuration Registry ✨
- ✅ Unified config system for SLA rules, quality gates, and spotlight rules
- ✅ Effective-dated configurations with org-scoped isolation
- ✅ JSON-based rule definitions with hot-reload capability
- ✅ Migration from scattered hardcoded rules to centralized management
- ✅ Version control and audit trail for configuration changes

### Explainable AI Scoring System ✨
- ✅ Detailed score component breakdown for Spotlight evaluations
- ✅ Component-level explanations: "+12 industry match, −5 budget misfit"
- ✅ Algorithm versioning and score history tracking
- ✅ Confidence scoring and manual override capabilities
- ✅ Trend analysis and score evolution over time

### Enhanced Identity Resolution ✨
- ✅ Canonical key management for emails, phones, and company domains
- ✅ Multi-source deduplication with confidence scoring
- ✅ Conflict detection and manual resolution workflows
- ✅ Contact merge audit trail and rollback capabilities
- ✅ Automatic resolution with fallback to human review

### Intelligent Priority Ranking ✨
- ✅ Multi-factor priority scoring for Today panel
- ✅ SLA urgency weighting with breach detection
- ✅ ICP band integration with value-based prioritization
- ✅ Workload balancing with penalty calculations
- ✅ Stage-aware priority adjustments

### Previous Improvements (v2.1 Final Tightenings)

#### Audit-Safe Outbox Processing
- ✅ Atomic claiming with `UPDATE ... OUTPUT` pattern
- ✅ Race condition prevention across multiple worker instances
- ✅ Exponential backoff retry logic (1min → 60min max)
- ✅ Dead letter queue for failed events
- ✅ Stale claim cleanup (5-minute timeout)

#### Idempotency & Reliability
- ✅ Unique constraints on critical operations
- ✅ Natural key-based duplicate prevention
- ✅ Transaction rollback on failures
- ✅ Comprehensive error logging and tracking

#### Checklist Gating System
- ✅ Pink checklist required for pursuit submission
- ✅ Red checklist required for won/lost transitions
- ✅ Completion percentage tracking
- ✅ Business rule validation with guard functions

#### SLA Coverage Expansion
- ✅ Triage SLA: First touch within configured hours
- ✅ Proposal SLA: Submit within hours of promotion
- ✅ Response SLA: Follow-up within hours of proposal send
- ✅ Automated breach detection and alerting
- ✅ Organization-specific SLA rule configuration

#### Today Panel Dashboard
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

### New Configuration Monitoring
- Configuration drift detection
- Rule effectiveness metrics
- Score component distribution analysis
- Identity resolution success rates

### Enhanced Logging
- Event processing status and errors
- SLA breach notifications
- Database connection pool metrics
- Worker claim/release operations
- **NEW**: Configuration change audit trail
- **NEW**: Score component calculation logs
- **NEW**: Identity resolution decision logs

### Error Handling
- Structured error responses with HTTP status codes
- Database transaction rollback on failures
- Dead letter queue for unprocessable events
- Comprehensive error context in logs
- **NEW**: Configuration validation and fallback handling
- **NEW**: Score calculation error recovery
- **NEW**: Identity conflict resolution workflows

### Performance Improvements
- **NEW**: Priority score caching for Today panel
- **NEW**: Bulk identity resolution processing
- **NEW**: Score component batch calculations
- **NEW**: Configuration lookup optimization
