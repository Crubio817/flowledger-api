# FlowLedger API

For the full docs hub and module guides, see: ./../docs/README.md

This directory contains the backend API for FlowLedger, built with Node.js and Express.

## Prerequisites

- Node.js (v20.x or later)
- Access to the Azure SQL database

## Local Development

1.  **Navigate to the API directory:**
    ```bash
    cd api
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the `api` directory and add the following variables.

    ### Authentication Modes (`SQL_AUTH`)

    The API supports multiple database authentication methods, configured via the `SQL_AUTH` environment variable.

    #### 1. SQL Authentication (Default)
    Uses a traditional SQL username and password.

    ```dotenv
    # .env
    SQL_SERVER="your-server.database.windows.net"
    SQL_DATABASE="your-database-name"
    SQL_AUTH="sql"
    SQL_USER="your-sql-username"
    SQL_PASSWORD="your-sql-password"
    PORT=4001
    ```

    #### 2. Azure AD - Managed Identity
    Uses the Managed Identity of the deployed Azure service (like an App Service or Function App) to authenticate. This is the recommended method for production environments.

    ```dotenv
    # .env
    SQL_SERVER="your-server.database.windows.net"
    SQL_DATABASE="your-database-name"
    SQL_AUTH="aad-msi"
    PORT=4001
    ```

    #### 3. Azure AD - Default Credential
    Uses the `@azure/identity` `DefaultAzureCredential` flow. This is useful for local development when you are logged into Azure via the Azure CLI or other methods.

    ```dotenv
    # .env
    SQL_SERVER="your-server.database.windows.net"
    SQL_DATABASE="your-database-name"
    SQL_AUTH="aad-default"
    PORT=4001
    ```

4.  **Run the server:**
    ```bash
    npm start
    ```
    The API will be available at `http://localhost:4001`. The console will log the active authentication mode on startup.

## Deployment

This API is configured for continuous deployment to an Azure Function App. Deployments are automatically triggered from the `main` branch using the Azure Deployment Center.

## Workstream Module v2.1

The Workstream Module implements a complete Signal → Candidate → Pursuit pipeline for managing sales opportunities and client engagements. This module enables organizations to capture, qualify, and convert business signals into successful pursuits with hard-enforced state machines, event-driven automations, and comprehensive analytics.

### Key Features

- **Multi-tenant Architecture**: All data is scoped by `org_id` for secure multi-organization support
- **State Machine Enforcement**: Hard-coded transition guards prevent invalid state changes
- **Event-Driven Architecture**: All changes trigger events for auditing and side-effect processing
- **MCP Integration**: Leverages Model Context Protocol for signal enrichment (Clay, FullEnrich)
- **Real-time Analytics**: Pre-built views for funnel analysis, SLA monitoring, and performance metrics
- **Idempotent Operations**: Safe retry handling with deduplication keys

### Core Entities

#### Signals
Signals represent incoming business opportunities captured from various sources.

- **Sources**: Email, ads, calls, notes
- **Enrichment**: Automatic data enrichment via MCP (contact info, company details)
- **Deduplication**: Prevents duplicate signals with `dedupe_key`
- **Clustering**: Groups related signals for better organization

#### Candidates
Qualified signals that have been triaged and deemed worthy of pursuit.

- **Status Flow**: new → triaged → nurture → on_hold → promoted → archived
- **Board View**: Kanban-style organization by status, owner, and last touch
- **Nurture Campaigns**: Automated drip email sequences

#### Pursuits
Active sales opportunities with full proposal management.

- **Stage Flow**: qual → pink → red → submit → won/lost
- **Proposal Versions**: Multi-version proposal tracking with send status
- **Cost of Sale**: Detailed time tracking and cost estimation
- **SLA Monitoring**: Automatic breach detection and alerting

### Database Schema

#### Core Tables
- `app.signal` - Incoming business signals

---

## Identity & Comms Hub Module v2.0

The Identity & Comms Hub modules provide a foundation for user/actor management and integrate communications directly into your application workflows. This enables a "single pane of glass" for client interactions, converting messages into actionable work and tracking all activity in one place.

### Key Features

- **Provider-Agnostic Identity**: A core `app.principal` table models all actors (AAD users, non-AAD contacts, service accounts) without a local user table.
- **Multi-Mailbox Support**: Connect to and manage both user and shared mailboxes (e.g., `sales@`, `audits@`) scoped by module.
- **Task-Oriented Inbox**: Threads have both a `status` (e.g., `open`, `closed`) and a `process_state` (e.g., `triage`, `in_processing`, `done`) for workflow management.
- **Integrated Event Sourcing**: Leverages the existing `app.work_event` table for a unified audit trail of all changes (e.g., `comms.thread.assigned`, `comms.thread.status_changed`).
- **State Machine Enforcement**: Uses the existing guard pattern in `src/state/guards.ts` to manage valid transitions for thread status and processing states.
- **Deep Workstream Integration**: Link threads to Signals, Candidates, and Pursuits via `app.work_item_link`; convert emails into actionable tasks.

### Core Entities

#### Identity
- `app.principal`: The canonical record for any actor in the system.
- `app.principal_identity`: Links a principal to one or more external identities (e.g., an AAD Object ID, an email address).

#### Comms Hub
- `app.comms_mailbox`: Represents a connected email account (user or shared).
- `app.comms_subscription`: Manages Microsoft Graph webhook subscriptions for real-time sync.
- `app.comms_thread`: A conversation thread with status, processing state, and assignment.
- `app.comms_message`: An individual message within a thread.
- `app.comms_attachment`: A normalized record for a message attachment, with linkage to `client_documents`.
- `app.comms_tag`: Flexible, org-scoped tagging for threads.

### API Endpoints

#### Principals
```
GET    /api/principals           - List principals (for assignment pickers)
GET    /api/principals/:id       - Get principal details
```

#### Comms
```
GET    /api/comms/threads        - List threads with filters (mailbox, status, assignee, etc.)
POST   /api/comms/threads/:id/reply - Reply to a thread
GET    /api/comms/threads/:id    - Get thread details with paginated messages
PATCH  /api/comms/threads/:id    - Update thread (assign, change status/state, tag)
POST   /api/comms/threads/:id/link - Link thread to a work item (Signal, Pursuit, etc.)
POST   /api/comms/attachments/:id/save-as-doc - Save an attachment to client documents

# Webhooks
POST   /api/webhooks/graph       - Inbound webhook for Microsoft Graph notifications
```

### State Machine Guards

Following the existing pattern, new guards will be added to `src/state/guards.ts`:

```typescript
// filepath: /workspaces/flowledger-api/api/src/state/guards.ts
// ...existing code...
// Pursuit stage transitions
export const PURSUIT_TX = {
// ...existing code...
};

// Comms thread status transitions
export const COMMS_THREAD_STATUS_TX = {
  open: ['waiting_on_us', 'waiting_on_client', 'closed'],
  waiting_on_us: ['waiting_on_client', 'closed'],
  waiting_on_client: ['waiting_on_us', 'closed'],
  closed: ['open'] // Re-open
};

// Comms thread processing state transitions
export const COMMS_THREAD_PROCESS_STATE_TX = {
  triage: ['in_processing', 'queued', 'done', 'archived'],
  in_processing: ['queued', 'done', 'archived'],
  queued: ['in_processing', 'done', 'archived'],
  done: ['archived'],
  archived: ['triage'] // Un-archive
};
```

### Background Workers

#### Comms Sync Worker (`src/workers/commsSync.ts`)
Processes webhook notifications and performs delta sync with Microsoft Graph.
- Triggered by `/api/webhooks/graph` and a periodic catch-up.
- Upserts threads, messages, and attachments idempotently.
- Creates `comms.thread.received` events in `app.work_event`.

#### Comms SLA Worker (`src/workers/commsSla.ts`)
Monitors for SLA breaches on communication threads, similar to the existing `sla.ts` worker.
- Checks for `waiting_on_us` threads approaching their due time.
- Creates `app.sla_breach` records and `comms.thread.sla_breached` events.

### Analytics Views

#### Comms Response Times
```sql
CREATE VIEW app.v_comms_response_time AS
SELECT
  t.org_id,
  t.thread_id,
  t.assigned_principal_id,
  t.client_id,
  t.first_msg_at,
  (SELECT MIN(e.happened_at) FROM app.work_event e WHERE e.item_id = t.thread_id AND e.item_type = 'comms_thread' AND e.payload_json LIKE '%"new_status":"waiting_on_client"%') as first_reply_at,
  DATEDIFF(minute, t.first_msg_at, (SELECT MIN(e.happened_at) FROM app.work_event e WHERE e.item_id = t.thread_id AND e.item_type = 'comms_thread' AND e.payload_json LIKE '%"new_status":"waiting_on_client"%')) as minutes_to_first_reply
FROM app.comms_thread t
WHERE t.channel = 'email' AND t.first_msg_at IS NOT NULL;
```

### Observability (Minimum Viable Signals)

#### Delta Sync Lag
```sql
SELECT mailbox_id, DATEDIFF(minute, MAX(last_sync_at), SYSUTCDATETIME()) as minutes_lag
FROM app.comms_thread_map
GROUP BY mailbox_id;
```
*Target: < 15 minutes*

#### Graph Subscription Health
```sql
SELECT state, COUNT(*) as count
FROM app.comms_subscription
GROUP BY state;
```
*Target: `expired` and `revoked` should be 0.*

#### Thread Processing Load
```sql
SELECT p.display_name, t.process_state, COUNT(*) as thread_count
FROM app.comms_thread t
LEFT JOIN app.principal p ON t.assigned_principal_id = p.principal_id
WHERE t.status != 'closed'
GROUP BY p.display_name, t.process_state;
```
- `app.candidate` - Qualified opportunities
- `app.pursuit` - Active sales pursuits
- `app.proposal` - Proposal versions and status
- `app.candidate_signal` - Junction table linking candidates to signals

#### Supporting Tables
- `app.signal_cluster` - Signal grouping for analysis
- `app.cos_entry` - Cost of sale time entries
- `app.pursuit_role_estimate` - PERT estimating by role
- `app.work_item_link` - Links to external documents/threads
- `app.drip_schedule` - Automated nurture campaigns
- `app.problem_taxonomy` - Standardized problem definitions
- `app.solution_catalog` - Solution playbook references

#### Event & Automation Tables
- `app.work_event` - Audit trail and event sourcing
- `app.sla_rule` - SLA definition rules
- `app.sla_breach` - SLA violation tracking

### API Endpoints

#### Signals
```
GET    /api/signals              - List signals with pagination
POST   /api/signals              - Create new signal (with MCP enrichment)
GET    /api/signals/:id          - Get signal details
PUT    /api/signals/:id          - Update signal
DELETE /api/signals/:id          - Delete signal
```

#### Candidates
```
GET    /api/candidates           - List candidates (board view)
POST   /api/candidates           - Create candidate
GET    /api/candidates/:id       - Get candidate details
PUT    /api/candidates/:id       - Update candidate
DELETE /api/candidates/:id       - Delete candidate

# Actions
POST   /api/candidates/:id/promote - Promote to pursuit
```

#### Pursuits
```
GET    /api/pursuits            - List pursuits (board view)
POST   /api/pursuits            - Create pursuit
GET    /api/pursuits/:id        - Get pursuit details
PUT    /api/pursuits/:id        - Update pursuit
DELETE /api/pursuits/:id        - Delete pursuit

# Actions
POST   /api/pursuits/:id/stage  - Change pursuit stage
POST   /api/pursuits/:id/submit - Submit pursuit (creates/sends proposal)
POST   /api/pursuits/:id/won    - Mark pursuit as won
POST   /api/pursuits/:id/lost   - Mark pursuit as lost
POST   /api/pursuits/:id/proposals - Create new proposal version
POST   /api/proposals/:id/send  - Send proposal
```

### State Machine Guards

All state transitions are validated by guard functions in `src/state/guards.ts`:

```typescript
// Candidate status transitions
export const CANDIDATE_TX = {
  new: ['triaged', 'archived'],
  triaged: ['nurture', 'on_hold', 'promoted', 'archived'],
  nurture: ['on_hold', 'promoted', 'archived'],
  on_hold: ['nurture', 'promoted', 'archived'],
  promoted: ['archived'], // Cannot un-promote
  archived: [] // Terminal state
};

// Pursuit stage transitions
export const PURSUIT_TX = {
  qual: ['pink', 'lost'],
  pink: ['red', 'lost'],
  red: ['submit', 'lost'],
  submit: ['won', 'lost'],
  won: [], // Terminal
  lost: [] // Terminal
};
```

### Background Workers

#### Outbox Worker (`src/workers/outbox.ts`)
Processes events from `work_event` table and triggers side-effects:
- Email notifications for proposal sends
- Team alerts for won/lost pursuits
- Integration webhooks

```typescript
// Run periodically
setInterval(tick, 30000); // Every 30 seconds
```

#### SLA Checker (`src/workers/sla.ts`)
Monitors for SLA breaches and creates alerts:
- Pursuit response times
- Proposal turnaround times
- Custom rule-based monitoring

```typescript
// Run periodically
setInterval(checkSLAs, 3600000); // Every hour
```

### Analytics Views

Pre-built views for reporting and dashboards:

#### Funnel Analysis
```sql
SELECT * FROM app.v_workstream_funnel;
-- Returns: org_id, signals, candidates, pursuits, won, lost
```

#### SLA Monitoring
```sql
SELECT * FROM app.v_workstream_sla;
-- Returns: org_id, item_type, item_id, rule_id, breached_at, reason_code
```

#### Performance Metrics
```sql
SELECT * FROM app.v_pursuit_performance;
-- Returns: org_id, pursuit_id, stage, sent_at, days_since_sent, days_to_close
```

### MCP Integration

The module integrates with Model Context Protocol for signal enrichment:

- **Clay**: Contact and company data enrichment
- **FullEnrich**: Comprehensive business intelligence
- **Custom Providers**: Extensible enrichment pipeline

Enrichment happens automatically on signal creation via `src/mcp.ts`.

### Multi-tenancy

All queries include `org_id` filtering for data isolation:
- Database-level row security via `org_id` columns
- API-level validation of organization context
- Shared taxonomy tables with org-specific entries

### Event Sourcing

All state changes are recorded in `work_event` table:
- Complete audit trail
- Event replay capabilities
- Side-effect processing via outbox pattern
- Activity logging for user notifications

### Development Setup

1. **Database Setup**: Run the DDL scripts in order:
   ```bash
   node scripts/run-ddl.js  # Core tables
   node scripts/run-ddl-views.js  # Analytics views
   ```

2. **Environment Variables**: Add to `.env`:
   ```dotenv
   SQL_SERVER="your-server.database.windows.net"
   SQL_DATABASE="your-database-name"
   SQL_AUTH="sql"
   SQL_USER="your-sql-username"
   SQL_PASSWORD="your-sql-password"
   ```

3. **Start Workers**: For development testing:
   ```bash
   node src/workers/outbox.ts
   node src/workers/sla.ts
   ```

### API Usage Examples

#### Create a Signal
```bash
curl -X POST http://localhost:4001/api/signals \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": 1,
    "source_type": "email",
    "source_ref": "email-123",
    "snippet": "Interested in our services",
    "contact_id": 456,
    "client_id": 789
  }'
```

#### Promote Candidate to Pursuit
```bash
curl -X POST http://localhost:4001/api/candidates/123/promote \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Get Funnel Analytics
```bash
curl http://localhost:4001/api/views/v_workstream_funnel?org_id=1
```

### Security Considerations

- All endpoints require proper authentication (JWT middleware planned)
- Database queries use parameterized statements to prevent SQL injection
- Multi-tenant data isolation enforced at query level
- Event logging captures actor information for audit trails

### Observability (Minimum Viable Signals)

#### Outbox Lag
```sql
SELECT DATEDIFF(second,
  ISNULL(MAX(processed_at), MAX(happened_at)),
  SYSUTCDATETIME()) as seconds_lag
FROM app.work_event
WHERE processed_at IS NULL;
```
*Target: < 60 seconds*

#### SLA Breach Count by Metric
```sql
SELECT r.metric, COUNT(*) breaches
FROM app.sla_breach b
JOIN app.sla_rule r ON r.rule_id = b.rule_id
WHERE b.breached_at >= DATEADD(day, -7, SYSUTCDATETIME())
GROUP BY r.metric;
```

#### Conversion Rates (Daily)
```sql
-- Signal → Candidate rate
SELECT CAST(COUNT(DISTINCT c.candidate_id) AS FLOAT) / NULLIF(COUNT(DISTINCT s.signal_id), 0) as conversion_rate
FROM app.signal s
LEFT JOIN app.candidate_signal cs ON s.signal_id = cs.signal_id
LEFT JOIN app.candidate c ON cs.candidate_id = c.candidate_id AND s.org_id = c.org_id
WHERE s.created_at >= DATEADD(day, -1, SYSUTCDATETIME());

-- Candidate → Promoted rate
SELECT CAST(SUM(CASE WHEN status = 'promoted' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) as promotion_rate
FROM app.candidate
WHERE created_at >= DATEADD(day, -1, SYSUTCDATETIME());

-- Submit → Win rate
SELECT CAST(SUM(CASE WHEN pursuit_stage = 'won' THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(SUM(CASE WHEN pursuit_stage IN ('won', 'lost') THEN 1 ELSE 0 END), 0) as win_rate
FROM app.pursuit
WHERE updated_at >= DATEADD(day, -1, SYSUTCDATETIME());
```

#### Latency Metrics
```sql
-- Promote → Submit (hours)
SELECT AVG(DATEDIFF(hour, c.updated_at, p.updated_at)) as avg_hours_promote_to_submit
FROM app.candidate c
JOIN app.pursuit p ON c.candidate_id = p.candidate_id AND c.org_id = p.org_id
WHERE c.status = 'promoted' AND p.pursuit_stage IN ('submit', 'won', 'lost');

-- Submit → Decision (hours)
SELECT AVG(DATEDIFF(hour, pr.sent_at, p.updated_at)) as avg_hours_submit_to_decision
FROM app.pursuit p
JOIN app.proposal pr ON p.pursuit_id = pr.pursuit_id AND p.org_id = pr.org_id
WHERE p.pursuit_stage IN ('won', 'lost') AND pr.status = 'sent';
```

### Security & Tenancy Checks

- **Never take `org_id` from request body** - only from auth/session
- **Row-level scans**: All GET endpoints include `org_id` filter
- **PII in events**: Only IDs/metadata in `work_event.payload_json`
- **Integration tests**: Try accessing other org's IDs, expect 404

### Quick Integrity Queries

```sql
-- 1) Exactly one pursuit per promoted candidate
SELECT candidate_id, COUNT(*) c
FROM app.pursuit GROUP BY candidate_id HAVING COUNT(*) > 1;

-- 2) Events exist for key transitions
SELECT event_name, COUNT(*) FROM app.work_event
WHERE event_name IN ('candidate.promoted','pursuit.submit','pursuit.won','pursuit.lost')
GROUP BY event_name;

-- 3) Unprocessed events (should trend to zero)
SELECT COUNT(*) as unprocessed FROM app.work_event WHERE processed_at IS NULL;

-- 4) SLA breaches by metric (last 7d)
SELECT r.metric, COUNT(*) breaches
FROM app.sla_breach b
JOIN app.sla_rule r ON r.rule_id=b.rule_id
WHERE b.breached_at >= DATEADD(day,-7, SYSUTCDATETIME())
GROUP BY r.metric;

-- 5) Checklist completion rates
SELECT checklist_type, 
  CAST(SUM(CASE WHEN is_complete = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) as completion_rate
FROM app.pursuit_checklist
GROUP BY checklist_type;

-- 6) Lost reasons distribution
SELECT lr.reason_text, COUNT(*) count
FROM app.pursuit p
JOIN app.lost_reason lr ON p.org_id = lr.org_id -- Note: would need lost_reason_id in pursuit
WHERE p.pursuit_stage = 'lost'
GROUP BY lr.reason_text;
```

### Nice-to-Haves (Won't Block)

- **`v_comms_lag` view**: Time since last touch per item for "Today Panel"
- **Checklist table**: `pursuit_checklist` for Pink/Red gate visibility
- **Lost reason taxonomy**: Enable win/loss theme analytics
- **Signal clustering**: Group related signals automatically

---

## People Module v1.0

The People Module provides a comprehensive staffing and resource management system with AI-powered candidate matching, immutable rate snapshots, and real-time availability tracking. This module enables organizations to efficiently match talent to projects with explainable AI recommendations and automated rate resolution.

### Key Features

- **AI-Powered Matching**: FitScore algorithm with weighted scoring across hard skills, soft skills, availability, timezone, domain experience, reliability, and continuity
- **Immutable Rate Snapshots**: Rates are resolved and "snapshotted" when assignments are created, preventing financial discrepancies
- **Multi-tenant Architecture**: All data scoped by `org_id` with field-level access control
- **Real-time Availability**: Daily allocation tracking with utilization monitoring and over-allocation alerts
- **Comprehensive Billing**: Contract management, time entries, invoices, and rate override capabilities
- **Audit Trail**: Complete event history with immutable logging for all staffing decisions

### Core Concepts

#### FitScore Algorithm
A weighted scoring system that evaluates candidates based on:
- **Hard Skills (35%)**: Level match vs requirements with recency boost
- **Soft Skills (15%)**: Cosine similarity of skill vectors
- **Availability (15%)**: Hours available vs required
- **Timezone (10%)**: Working hours overlap
- **Domain (10%)**: Client/industry experience match
- **Reliability (10%)**: Historical performance score
- **Continuity (5%)**: Existing engagement assignment

#### Immutable Rate Snapshots
- Rates resolved at assignment creation time
- Full breakdown stored: base + premiums + scarcity + overrides
- Prevents financial discrepancies and ensures auditability
- Trigger protection prevents snapshot updates

### Core Entities

#### People & Skills
- `app.person` - Staff profiles with skills and availability
- `app.skill` - Standardized skill taxonomy
- `app.person_skill` - Person-skill associations with proficiency levels
- `app.skill_evidence` - Supporting evidence for skill claims

#### Assignments & Allocations
- `app.assignment` - Person-project assignments with immutable rate snapshots
- `app.person_calendar` - Daily working hours and holidays
- `app.person_daily_allocation` - Daily utilization tracking
- `app.v_person_availability` - Real-time availability view

#### Rate Resolution
- `app.rate_card` - Precedence-based rate resolution rules
- `app.rate_premium` - Skill and role-based premiums
- `app.contract` - Contract/SOW management
- `app.contract_rate_override` - Contract-specific rate overrides

#### Billing & Invoicing
- `app.time_entry` - Time tracking for invoicing
- `app.invoice` - Draft and sent invoices
- `app.invoice_line` - Invoice line items

### Database Schema

#### Core Tables
- `app.person` - Staff profiles and basic information
- `app.skill` - Standardized skill definitions
- `app.assignment` - Person-project assignments
- `app.person_skill` - Skill proficiency associations
- `app.skill_evidence` - Supporting evidence for skills

#### Supporting Tables
- `app.person_calendar` - Working hours and holidays
- `app.person_daily_allocation` - Daily utilization tracking
- `app.rate_card` - Rate resolution rules
- `app.rate_premium` - Premium calculations
- `app.contract` - Contract management
- `app.contract_budget` - Budget caps and alerts
- `app.contract_rate_override` - Contract-specific overrides
- `app.time_entry` - Time tracking entries
- `app.invoice` - Invoice management
- `app.invoice_line` - Invoice details
- `app.audit_log` - Comprehensive audit trail

#### Views
- `app.v_person_availability` - Real-time availability with utilization

### API Endpoints

#### Staffing Requests
```
GET    /api/staffing-requests/:id/rank     - Rank candidates with FitScore
POST   /api/assignments                    - Create assignment with rate snapshot
```

#### People Directory
```
GET    /api/people                         - Search/filter people by skills/availability
GET    /api/people/:id                     - Get person details with skills
```

#### Rate Preview
```
GET    /api/rates/preview                  - Resolve effective rate with breakdown
```

#### Assignments
```
GET    /api/assignments                    - List assignments with filters
GET    /api/assignments/:id                - Get assignment details
PUT    /api/assignments/:id                - Update assignment (limited fields)
DELETE /api/assignments/:id                - Delete assignment
```

### Rate Resolution Precedence

Rates are resolved using a hierarchical precedence system:

1. **Contract Override**: Most specific, applies to this contract only
2. **Engagement Rate**: Applies to all assignments on this engagement
3. **Role Template**: Applies to all assignments with this role template
4. **Person Rate**: Applies to all assignments for this person
5. **Org Default**: Fallback rate for the organization

Each level can include:
- Base rate by level (L1, L2, L3, L4, L5)
- Absolute premiums ($ amounts)
- Percentage premiums (% of base)
- Scarcity multipliers (market demand adjustments)

### Background Workers

#### Rate Scarcity Calculator (`src/workers/rateScarcity.ts`)
Updates scarcity multipliers based on market demand:
- Analyzes assignment patterns and skill utilization
- Calculates scarcity scores for high-demand skills
- Updates `app.scarcity_multiplier` table

#### Availability Monitor (`src/workers/availability.ts`)
Monitors utilization and sends alerts:
- Tracks daily allocations vs capacity
- Identifies over-allocated resources
- Sends proactive alerts for staffing conflicts

### Analytics Views

Pre-built views for reporting and dashboards:

#### Utilization Analysis
```sql
SELECT * FROM app.v_person_utilization;
-- Returns: person_id, week_start, total_hours, available_hours, utilization_pct
```

#### Skill Demand Analysis
```sql
SELECT * FROM app.v_skill_demand;
-- Returns: skill_id, assignments_count, avg_fit_score, scarcity_multiplier
```

#### Rate Resolution Audit
```sql
SELECT * FROM app.v_rate_resolution_audit;
-- Returns: assignment_id, final_rate, breakdown_json, resolved_at
```

### Multi-tenancy

All queries include `org_id` filtering for data isolation:
- Database-level row security via `org_id` columns
- API-level validation of organization context
- Shared skill taxonomy with org-specific customizations

### Event Sourcing

All staffing decisions are recorded in `audit_log` table:
- Complete audit trail of rate resolutions
- Assignment creation and modification tracking
- Evidence chain for skill validations
- Financial decision traceability

### Development Setup

1. **Database Setup**: Run the People module migrations:
   ```bash
   node scripts/run-people-migrations.js
   ```

2. **Environment Variables**: Ensure database connection is configured in `.env`

3. **Start Workers**: For development testing:
   ```bash
   node src/workers/rateScarcity.ts
   node src/workers/availability.ts
   ```

### API Usage Examples

#### Rank Candidates for Staffing Request
```bash
curl -X GET "http://localhost:4001/api/staffing-requests/123/rank?org_id=1&include_rate_preview=true" \
  -H "Authorization: Bearer <token>"
```

#### Create Assignment with Rate Snapshot
```bash
curl -X POST http://localhost:4001/api/assignments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "org_id": 1,
    "person_id": 123,
    "engagement_id": 456,
    "role_template_id": 789,
    "start_date": "2025-10-01",
    "end_date": "2025-12-31",
    "alloc_pct": 100
  }'
```

#### Get Rate Preview
```bash
curl -X GET "http://localhost:4001/api/rates/preview?org_id=1&role_template_id=789&level=L3&skills=1,2,3&engagement_id=456" \
  -H "Authorization: Bearer <token>"
```

### Security Considerations

- All endpoints require proper authentication (JWT middleware)
- Database queries use parameterized statements to prevent SQL injection
- Multi-tenant data isolation enforced at query level
- Rate snapshots prevent unauthorized financial modifications
- Audit logging captures all actor information

### Observability (Minimum Viable Signals)

#### Rate Resolution Performance
```sql
SELECT AVG(DATEDIFF(millisecond, created_at, resolved_at)) as avg_resolution_ms
FROM app.rate_resolution_log
WHERE created_at >= DATEADD(hour, -1, SYSUTCDATETIME());
```
*Target: < 50ms*

#### Assignment Success Rate
```sql
SELECT
  COUNT(CASE WHEN end_date IS NOT NULL THEN 1 END) * 100.0 / COUNT(*) as completion_rate
FROM app.assignment
WHERE start_date >= DATEADD(month, -3, SYSUTCDATETIME());
```
*Target: > 85%*

#### Over-allocation Alerts
```sql
SELECT COUNT(*) as over_allocated_people
FROM app.person_daily_allocation
WHERE is_overallocated = 1
AND allocation_date >= CAST(SYSUTCDATETIME() AS DATE);
```
*Target: < 5% of active assignments*

### Quick Integrity Queries

```sql
-- 1) Rate snapshot immutability check
SELECT COUNT(*) violations
FROM app.assignment
WHERE bill_rate_snapshot <> cost_rate_snapshot; -- Should be 0

-- 2) Assignment date validation
SELECT COUNT(*) invalid_assignments
FROM app.assignment
WHERE start_date > end_date OR end_date < GETDATE(); -- Should be 0

-- 3) Skill evidence completeness
SELECT
  ps.person_id,
  ps.skill_id,
  COUNT(se.evidence_id) as evidence_count
FROM app.person_skill ps
LEFT JOIN app.skill_evidence se ON ps.person_id = se.person_id AND ps.skill_id = se.skill_id
GROUP BY ps.person_id, ps.skill_id
HAVING COUNT(se.evidence_id) = 0; -- Should be minimal

-- 4) Rate resolution coverage
SELECT COUNT(*) unassigned_rates
FROM app.assignment
WHERE bill_rate_snapshot IS NULL OR cost_rate_snapshot IS NULL; -- Should be 0

-- 5) Availability conflicts
SELECT COUNT(*) conflicts
FROM app.person_daily_allocation
WHERE total_hours_allocated > total_hours_available; -- Should be monitored
```

### Performance Targets

- **Candidate Ranking**: <300ms for 5k people
- **Rate Resolution**: <50ms per call
- **Availability Check**: <100ms per person
- **Assignment Creation**: <200ms with snapshot
- **Real-time Updates**: <5 seconds latency

---

**Version**: v1.0 (People Module Complete)  
**Last Updated**: September 8, 2025  
**Database**: Azure SQL Server  
**Architecture**: Multi-tenant with event sourcing
