# Workstream Module Documentation

## Overview

The Workstream module implements a comprehensive sales pipeline management system within the FlowLedger platform. It provides end-to-end lead management from signal ingestion through pursuit closure, with robust state management, SLA monitoring, and automation capabilities.

## Architecture

```
Workstream Module
├── Signals → Candidates → Pursuits
├── Event-Driven Processing
├── SLA Monitoring
├── Quality Gates
├── Spotlight Integration
└── Automation Triggers
```

## Key Features

- **Signal Processing**: Multi-source lead ingestion with deduplication
- **Candidate Management**: Qualified lead nurturing and triage
- **Pursuit Tracking**: Full sales pipeline with stage transitions
- **SLA Compliance**: Automated monitoring and breach detection
- **Quality Assurance**: Checklist gating for critical transitions
- **Event Sourcing**: Reliable outbox pattern for side effects
- **Spotlight Integration**: ICP evaluation and lead scoring
- **Automation**: Event-driven workflows and notifications

## Documentation Structure

### [Overview](./overview.md)
High-level module description, features, and recent improvements including:
- Audit-safe outbox processing
- Idempotency and reliability patterns
- Checklist gating system
- SLA coverage expansion
- Today panel dashboard

### [Database Schema](./database-schema.md)
Complete database schema documentation including:
- Core tables (signals, candidates, pursuits, proposals)
- Supporting tables (events, links, taxonomy)
- SLA and quality assurance tables
- Views for computed data
- Migration scripts and relationships

### [API Reference](./api-reference.md)
Comprehensive API documentation covering:
- RESTful endpoints for all operations
- Request/response formats
- State machines and transitions
- Quality gates and validation
- Pagination and filtering
- Error handling and status codes

### [Backend Implementation](./backend-implementation.md)
Technical implementation details including:
- Route handlers and middleware
- State guards and validation
- Worker processes (outbox, SLA)
- Database operations and transactions
- Views and computed data
- Error handling patterns
- Performance optimization

### [Spotlight Integration](./spotlight-integration.md)
ICP evaluation system documentation including:
- Spotlight definition and management
- Field configuration and rules
- Signal evaluation engine
- Matching algorithms and scoring
- Frontend integration
- Performance considerations

### [Frontend UI Plan](../SPOTLIGHT_FRONTEND_UI_PLAN.md)
Detailed frontend implementation plan for the Spotlight system including:
- UI components and visual design
- User workflows and interactions
- Integration with workstream dashboard
- Performance and accessibility considerations

### [Automation Module Guide](../AUTOMATION_MODULE_GUIDE.md)
Integration with the automation system for event-driven workflows:
- Trigger actions based on workstream events
- Automated notifications and task creation
- SLA breach alerts and follow-ups
- Custom workflow automation

## Quick Start

### Prerequisites
- FlowLedger API running
- Database migrations applied
- Workstream tables created

### Basic Usage

1. **Configure SLA Rules**:
```sql
INSERT INTO app.sla_rule(org_id, item_type, metric, threshold_hrs, is_active)
VALUES (1, 'signal', 'triage_sla', 24, 1);
```

2. **Create a Spotlight**:
```http
POST /api/spotlights
{
  "org_id": 1,
  "name": "Tech Companies",
  "domain": "technology"
}
```

3. **Ingest Signals**:
Signals are automatically processed through various ingestion points (email, web forms, APIs).

4. **Monitor Pipeline**:
```http
GET /api/workstream/stats?org_id=1
GET /api/workstream/today?org_id=1
```

## State Machines

### Candidate Lifecycle
```
new → triaged → nurture/on_hold/promoted/archived
```

### Pursuit Lifecycle
```
qual → pink → red → submit → won/lost
```

### Quality Gates
- Pink → Red: Initial qualification
- Red → Submit: Complete required checklists
- Submit → Won/Lost: Final validation

## SLA Rules

### Default Rules
- **Triage SLA**: 24 hours for first touch on signals
- **Proposal SLA**: 72 hours from promotion to submission
- **Response SLA**: 96 hours for prospect response

### Breach Handling
- Automatic breach detection
- Configurable thresholds per organization
- Resolution tracking and reporting

## Event Processing

### Outbox Pattern
- Atomic event claiming with `UPDATE ... OUTPUT`
- Exponential backoff retry (1min → 60min max)
- Dead letter queue for persistent failures
- Stale claim cleanup (5-minute timeout)

### Key Events
- `candidate.promoted` → Create proposal v1
- `pursuit.submit` → Send proposal email
- `proposal.sent` → Notify team
- `pursuit.won/lost` → Celebration/notification

## Integration Points

### Automation Module
Workstream events trigger automated actions:
- Email notifications
- Task creation
- CRM updates
- Report generation

### MCP Integration
AI-assisted workflows:
- Signal analysis and classification
- Proposal content generation
- Follow-up message drafting

### Spotlight System
ICP evaluation for lead qualification:
- Signal scoring against profiles
- Automated candidate creation
- Priority-based routing

## Monitoring

### Health Checks
```http
GET /healthz     # Basic liveness
GET /api/health  # API health with DB connectivity
```

### Key Metrics
- Signal processing rate
- SLA compliance percentage
- Pipeline conversion rates
- Event processing latency
- Queue depths and backlogs

### Logging
- Structured event processing logs
- SLA breach notifications
- Database performance metrics
- Error tracking with context

## Development

### Local Setup
```bash
# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start development server
npm run dev

# Start workers
node src/workers/outbox.js
node src/workers/sla.js
```

### Testing
```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Generate API documentation
npm run gen:api:snapshot
```

### Code Organization
```
api/src/
├── routes/workstream.ts      # API endpoints
├── workers/                  # Background processors
│   ├── outbox.ts            # Event processing
│   └── sla.ts               # SLA monitoring
├── state/guards.ts          # State validation
├── db/pool.ts               # Database connection
└── utils/http.ts            # Response helpers
```

## Deployment

### Production Checklist
- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] Worker processes running
- [ ] Health checks passing
- [ ] Monitoring alerts configured
- [ ] Backup procedures in place

### Scaling Considerations
- Horizontal scaling of API instances
- Database read replicas for reporting
- Redis caching for performance
- Message queue for high-volume processing

## Troubleshooting

### Common Issues

**Events not processing**:
- Check worker process status
- Verify database connectivity
- Review dead letter queue

**SLA breaches not detected**:
- Confirm SLA rules are active
- Check worker schedules
- Validate timezone settings

**State transition errors**:
- Verify state machine definitions
- Check quality gate completion
- Review guard function logic

### Debug Commands
```bash
# Check event queue depth
SELECT COUNT(*) FROM app.work_event WHERE processed_at IS NULL;

# View recent SLA breaches
SELECT * FROM app.sla_breach WHERE resolved_at IS NULL ORDER BY breached_at DESC;

# Monitor worker activity
SELECT claimed_by, COUNT(*) FROM app.work_event WHERE processed_at IS NULL GROUP BY claimed_by;
```

## Contributing

### Code Standards
- TypeScript for type safety
- Async/await for asynchronous operations
- Parameterized queries for security
- Comprehensive error handling
- Unit test coverage

### Documentation Updates
- Keep API documentation in sync with code
- Update database schema after migrations
- Document new features and breaking changes
- Maintain changelog for releases

## Support

### Resources
- [API Reference](./api-reference.md)
- [Database Schema](./database-schema.md)
- [Backend Implementation](./backend-implementation.md)
- [Spotlight Integration](./spotlight-integration.md)

### Getting Help
- Check existing documentation
- Review code comments
- Examine test cases
- Create GitHub issues for bugs/features

---

## Changelog

### v2.1 (2025-09-07)
- ✅ Audit-safe outbox processing
- ✅ Idempotency rails and reliability
- ✅ Checklist gating for submissions
- ✅ SLA coverage expansion
- ✅ Today panel dashboard
- ✅ Spotlight ICP evaluation system

### v2.0 (2025-09-01)
- ✅ Core workstream tables and relationships
- ✅ Basic API endpoints
- ✅ State machine implementation
- ✅ Event sourcing foundation
- ✅ Multi-tenancy support

### v1.0 (2025-08-15)
- ✅ Initial signal processing
- ✅ Basic candidate and pursuit tracking
- ✅ Simple state transitions
- ✅ Database schema foundation
