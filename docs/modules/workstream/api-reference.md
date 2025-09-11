# Workstream Module API Reference

## Overview

The Workstream API provides endpoints for managing the sales pipeline from signal intake through pursuit closure. All endpoints require `org_id` as a query parameter for multi-tenancy.

## Base URL
```
/api/workstream
```

## Endpoints

### Statistics

#### GET /stats
Get aggregated statistics for signals, candidates, and pursuits.

**Query Parameters:**
- `org_id` (integer, required): Organization ID

**Response:**
```json
{
  "signals": {
    "total": 150,
    "recent": 12
  },
  "candidates": {
    "total": 45,
    "recent": 8
  },
  "pursuits": {
    "total": 23,
    "recent": 3
  }
}
```

### Signals

#### GET /signals
List signals with pagination.

**Query Parameters:**
- `org_id` (integer, required): Organization ID
- `page` (integer, default: 1): Page number
- `limit` (integer, default: 50): Items per page

**Response:**
```json
{
  "data": [
    {
      "signal_id": 123,
      "org_id": 1,
      "source_type": "email",
      "source_ref": "msg_456",
      "snippet": "We're looking for a new CRM solution...",
      "contact_id": 789,
      "client_id": 101,
      "ts": "2025-09-09T10:30:00Z",
      "problem_phrase": "CRM solution needed",
      "solution_hint": "Sales automation",
      "urgency_score": 0.8,
      "dedupe_key": "email_456",
      "cluster_id": null,
      "owner_user_id": 5,
      "created_at": "2025-09-09T10:30:00Z",
      "updated_at": "2025-09-09T10:35:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150
  }
}
```

### Today Panel

#### GET /today
Get prioritized work items for the current day.

**Query Parameters:**
- `org_id` (integer, required): Organization ID

**Response:**
```json
[
  {
    "item_type": "candidate",
    "item_id": 123,
    "label": "ABC Corp - CRM Project",
    "status": "triaged",
    "last_touch_at": "2025-09-08T14:30:00Z",
    "due_date": null,
    "sla_metric": "",
    "badge": "amber"
  },
  {
    "item_type": "pursuit",
    "item_id": 456,
    "label": "Pursuit #456",
    "status": "red",
    "last_touch_at": "2025-09-09T09:15:00Z",
    "due_date": "2025-09-15",
    "sla_metric": "response_sla",
    "badge": "red"
  }
]
```

### Candidates

#### GET /candidates
List candidates with pagination.

**Query Parameters:**
- `org_id` (integer, required): Organization ID
- `page` (integer, default: 1): Page number
- `limit` (integer, default: 50): Items per page

**Response:**
```json
{
  "data": [
    {
      "candidate_id": 123,
      "org_id": 1,
      "signal_id": 456,
      "title": "ABC Corp - CRM Implementation",
      "status": "triaged",
      "priority": "high",
      "notes": "Enterprise CRM replacement project",
      "created_at": "2025-09-08T10:00:00Z",
      "updated_at": "2025-09-09T11:30:00Z",
      "signal_snippet": "We're looking for a new CRM...",
      "problem_phrase": "Legacy CRM performance issues",
      "solution_hint": "Cloud-based CRM migration",
      "urgency_score": 0.8
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 45
  }
}
```

### Pursuits

#### GET /pursuits
List pursuits with pagination.

**Query Parameters:**
- `org_id` (integer, required): Organization ID
- `page` (integer, default: 1): Page number
- `limit` (integer, default: 50): Items per page

**Response:**
```json
{
  "data": [
    {
      "pursuit_id": 456,
      "org_id": 1,
      "candidate_id": 123,
      "pursuit_stage": "red",
      "value_estimate": 150000.00,
      "probability": 75.0,
      "due_date": "2025-09-15",
      "created_at": "2025-09-08T12:00:00Z",
      "updated_at": "2025-09-09T14:20:00Z",
      "candidate_title": "ABC Corp - CRM Implementation",
      "signal_snippet": "We're looking for a new CRM...",
      "problem_phrase": "Legacy CRM performance issues"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 23
  }
}
```

## State Machines

### Candidate States
```typescript
const CANDIDATE_TX = {
  new: ['triaged'],
  triaged: ['nurture', 'on_hold', 'promoted', 'archived'],
  nurture: ['triaged', 'on_hold', 'archived'],
  on_hold: ['triaged', 'archived'],
  promoted: [], // Terminal state
  archived: []  // Terminal state
};
```

### Pursuit States
```typescript
const PURSUIT_TX = {
  qual: ['pink'],
  pink: ['red', 'qual'],
  red: ['submit', 'pink'],
  submit: ['won', 'lost'],
  won: [],   // Terminal state
  lost: []   // Terminal state
};
```

## Quality Gates

### Pursuit Submission Checklist
Pursuits cannot transition from 'red' to 'submit' stage until all required checklist items are completed:

- Proposal document finalized
- Pricing approved
- Technical requirements reviewed
- Legal review completed
- Stakeholder alignment achieved

### SLA Rules
Default SLA rules (configurable per organization):

- **Triage SLA**: First touch within 24 hours of signal creation
- **Proposal SLA**: Submit proposal within 72 hours of promotion to pursuit
- **Response SLA**: Client response within 96 hours of proposal submission

## Event Processing

The Workstream module uses an event-driven architecture with reliable outbox processing:

### Key Events
- `candidate.promoted` - Candidate advanced to pursuit
- `pursuit.submit` - Pursuit moved to submit stage
- `proposal.sent` - Proposal delivered to prospect
- `pursuit.won` - Pursuit successfully closed
- `pursuit.lost` - Pursuit lost

### Outbox Processing
- Atomic claiming with `UPDATE ... OUTPUT` pattern
- Exponential backoff retry (1min → 60min max)
- Dead letter queue for failed events
- Stale claim cleanup (5-minute timeout)

## Integration Points

### Spotlight System
The Workstream module integrates with the Spotlight system for ICP evaluation:

#### Evaluate Signal Against Spotlight
```
POST /api/spotlights/{id}/evaluate
```

**Request:**
```json
{
  "org_id": 1,
  "signal_data": {
    "company_size": "500-1000",
    "industry": "technology",
    "budget": "100k-500k"
  }
}
```

**Response:**
```json
{
  "match_score": 0.85,
  "matched_fields": 4,
  "total_fields": 5,
  "recommendation": "high_match"
}
```

### Automation Engine
Workstream events trigger automated actions through the automation module:

- Send follow-up emails
- Create tasks in engagement system
- Update CRM records
- Generate reports

### MCP Integration
Model Context Protocol endpoints for AI-assisted workflows:

- Signal analysis and classification
- Proposal content generation
- Follow-up message drafting
- Deal risk assessment

## Error Handling

### HTTP Status Codes
- `200` - Success
- `400` - Bad Request (missing required parameters)
- `404` - Not Found
- `409` - Conflict (state transition blocked by quality gates)
- `422` - Unprocessable Entity (invalid state transition)
- `500` - Internal Server Error

### Validation Rules
- All endpoints require `org_id` query parameter
- State transitions validated against state machines
- Quality gates enforced for critical transitions
- SLA breaches tracked and reported

## Performance Considerations

### Pagination
All list endpoints support pagination with configurable limits (max 200 items per page).

### Indexing Strategy
- Time-based indexes for chronological ordering
- Composite indexes for common filter combinations
- Unique constraints for data integrity

### Caching
Consider caching strategies for:
- SLA rule lookups
- Taxonomy data
- User permission checks

## Monitoring

### Health Checks
- Database connectivity validation
- Worker process status
- Queue depth monitoring
- SLA compliance metrics

### Logging
- Event processing lifecycle
- State transition history
- SLA breach notifications
- Performance metrics

### Alerts
- SLA breach thresholds exceeded
- Worker process failures
- Queue backlog warnings
- Database connection issues
