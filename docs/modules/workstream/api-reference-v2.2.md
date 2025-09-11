# Workstream Module API Reference v2.2

## Base URL and Authentication

**Base Path:** `/api/workstream`
**Authentication:** Organization-scoped via `org_id` query parameter
**Headers:** 
- `Content-Type: application/json`
- Standard FlowLedger authentication headers

## Core Endpoints

### Statistics
#### GET /stats
Get aggregated workstream statistics.

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
    "recent": 5
  }
}
```

### Enhanced Today Panel (v2.2)
#### GET /today
Get prioritized work items with intelligent ranking.

**Query Parameters:**
- `org_id` (integer, required): Organization ID
- `priority_tier` (string, optional): Filter by 'critical', 'high', 'medium', 'low'
- `owner_user_id` (integer, optional): Filter by owner

**Response:**
```json
{
  "data": [
    {
      "item_type": "pursuit",
      "item_id": 123,
      "org_id": 1,
      "label": "Pursuit #123: Enterprise CRM Implementation",
      "state": "red",
      "last_touch_at": "2025-09-08T14:30:00Z",
      "due_date": "2025-09-12",
      "sla_metric": "proposal_sla",
      "badge": "amber",
      "priority_score": 145,
      "owner_user_id": 5,
      "icp_band": "high",
      "hours_since_touch": 18,
      "priority_tier": "critical"
    }
  ]
}
```

**Priority Score Calculation:**
- **SLA Urgency:** 100 (breach), 75 (overdue), 50 (due soon), 20 (normal)
- **Value Band:** 30 (high), 15 (medium), 5 (low)  
- **Stage Weight:** 35 (submit), 25 (red), 15 (pink/nurture), 10 (qual/triaged)
- **Workload Penalty:** -2 per additional item for same owner

### Signals
#### GET /signals
List signals with pagination.

**Query Parameters:**
- `org_id` (integer, required): Organization ID
- `page` (integer, default: 1): Page number
- `limit` (integer, default: 50): Items per page
- `source_type` (string, optional): Filter by source type
- `resolved` (boolean, optional): Filter by resolution status

**Response:**
```json
{
  "data": [
    {
      "signal_id": 456,
      "org_id": 1,
      "source_type": "email",
      "source_ref": "email_123",
      "snippet": "Interested in CRM solution for 50+ users...",
      "contact_id": 789,
      "client_id": 101,
      "problem_phrase": "Need scalable CRM solution",
      "solution_hint": "Enterprise CRM implementation",
      "urgency_score": 0.85,
      "dedupe_key": "email_contact@company.com",
      "cluster_id": 12,
      "owner_user_id": 5,
      "contact_email": "contact@company.com",
      "contact_phone": "+1-555-0123",
      "company_domain": "company.com",
      "created_at": "2025-09-08T10:15:00Z",
      "updated_at": "2025-09-08T10:15:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150
  }
}
```

#### POST /signals
Create a new signal with automatic identity resolution.

**Request Body:**
```json
{
  "source_type": "email",
  "source_ref": "email_124", 
  "snippet": "Looking for project management solution",
  "contact_email": "new@company.com",
  "contact_phone": "+1-555-0124",
  "company_domain": "newcompany.com",
  "problem_phrase": "Need project tracking",
  "solution_hint": "PM software implementation",
  "urgency_score": 0.7
}
```

**Response:**
```json
{
  "signal_id": 457,
  "org_id": 1,
  "identity_resolution": {
    "contact_resolved": true,
    "contact_id": 790,
    "client_resolved": true, 
    "client_id": 102,
    "confidence_score": 0.95,
    "resolution_method": "auto_resolved"
  }
}
```

### Candidates
#### GET /candidates
List candidates with board view optimization.

**Query Parameters:**
- `org_id` (integer, required): Organization ID
- `status` (string, optional): Filter by status
- `owner_user_id` (integer, optional): Filter by owner
- `page` (integer, default: 1): Page number
- `limit` (integer, default: 50): Items per page

**Response:**
```json
{
  "data": [
    {
      "candidate_id": 234,
      "title": "Enterprise CRM Implementation",
      "status": "nurture",
      "value_band": "high",
      "one_liner_scope": "50+ user CRM with custom integrations",
      "owner_user_id": 5,
      "last_touch_at": "2025-09-08T16:00:00Z",
      "days_since_touch": 1,
      "has_threads": 1,
      "has_docs": 1,
      "spotlight_scores": {
        "total_score": 87.5,
        "top_positive": "+15 industry_match",
        "top_negative": "-3 geographic_distance"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 45
  }
}
```

#### POST /candidates/:id/promote
Promote candidate to pursuit with quality gate validation.

**Path Parameters:**
- `id` (integer, required): Candidate ID

**Query Parameters:**
- `org_id` (integer, required): Organization ID

**Response:**
```json
{
  "pursuit_id": 345,
  "quality_gates_passed": {
    "pink_checklist": ["budget_confirmed", "technical_scope_defined"],
    "configured_requirements": ["budget_confirmed", "technical_scope_defined", "decision_makers_identified"]
  }
}
```

### Pursuits
#### GET /pursuits
List pursuits with pipeline board view.

**Query Parameters:**
- `org_id` (integer, required): Organization ID
- `stage` (string, optional): Filter by pursuit stage
- `page` (integer, default: 1): Page number
- `limit` (integer, default: 50): Items per page

**Response:**
```json
{
  "data": [
    {
      "pursuit_id": 345,
      "title": "Enterprise CRM Implementation", 
      "stage": "red",
      "due_date": "2025-09-15",
      "forecast_value_usd": 150000,
      "compliance_score": 8.5,
      "sla_badge": "green",
      "has_threads": 1,
      "has_docs": 1,
      "last_touch_at": "2025-09-08T14:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 23
  }
}
```

#### POST /pursuits/:id/stage
Change pursuit stage with gated transitions.

**Path Parameters:**
- `id` (integer, required): Pursuit ID

**Query Parameters:**
- `org_id` (integer, required): Organization ID

**Request Body:**
```json
{
  "stage": "submit"
}
```

**Response (Success):**
```json
{
  "pursuit_id": 345,
  "previous_stage": "red",
  "new_stage": "submit",
  "quality_gates_validated": {
    "submit_requirements": ["proposal_reviewed", "pricing_approved", "legal_terms_agreed", "delivery_plan_finalized"],
    "all_completed": true
  }
}
```

**Response (Blocked by Quality Gate):**
```json
{
  "error": "Submit blocked; incomplete checklist: pricing_approved, legal_terms_agreed",
  "status": 409,
  "missing_items": ["pricing_approved", "legal_terms_agreed"],
  "required_items": ["proposal_reviewed", "pricing_approved", "legal_terms_agreed", "delivery_plan_finalized"]
}
```

## Configuration Management (v2.2)

### GET /config
Get active configuration for organization.

**Query Parameters:**
- `org_id` (integer, required): Organization ID
- `config_type` (string, optional): Filter by type ('sla_rule', 'gate_rule', 'ranking_rule', 'spotlight_rule')
- `config_key` (string, optional): Specific configuration key

**Response:**
```json
{
  "data": [
    {
      "config_id": 12,
      "config_type": "gate_rule",
      "config_key": "submit_requirements", 
      "config_value": ["proposal_reviewed", "pricing_approved", "legal_terms_agreed", "delivery_plan_finalized"],
      "effective_from": "2025-09-01T00:00:00Z",
      "effective_to": null
    }
  ]
}
```

### POST /config
Create or update configuration.

**Query Parameters:**
- `org_id` (integer, required): Organization ID

**Request Body:**
```json
{
  "config_type": "ranking_rule",
  "config_key": "today_panel_weights",
  "config_value": {
    "sla_urgency_weight": 10,
    "icp_band_weight": 5,
    "stage_weight": 3,
    "workload_penalty_per_item": 1
  },
  "effective_from": "2025-09-15T00:00:00Z"
}
```

## Explainable AI Scoring (v2.2)

### GET /spotlight-scores/:item_type/:item_id
Get detailed score breakdown for an item.

**Path Parameters:**
- `item_type` (string, required): 'signal', 'candidate', or 'pursuit'
- `item_id` (integer, required): Item ID

**Query Parameters:**
- `org_id` (integer, required): Organization ID
- `spotlight_id` (integer, optional): Specific spotlight ID

**Response:**
```json
{
  "item_type": "candidate",
  "item_id": 234,
  "spotlight_id": 1,
  "total_score": 87.5,
  "algorithm_version": "v1.0",
  "scored_at": "2025-09-08T12:00:00Z",
  "score_breakdown": [
    {
      "name": "industry_match",
      "score": 15.0,
      "weight": 1.0,
      "reason": "Perfect match: Financial Services sector",
      "contribution": 15.0
    },
    {
      "name": "budget_fit", 
      "score": -3.0,
      "weight": 0.8,
      "reason": "Budget below ideal range: $50K vs $100K+ target",
      "contribution": -2.4
    }
  ],
  "top_positive": "+15 industry_match",
  "top_negative": "-3 budget_fit",
  "component_count": 6
}
```

### POST /spotlight-scores/:item_type/:item_id/rescore
Trigger rescoring for an item.

**Path Parameters:**
- `item_type` (string, required): 'signal', 'candidate', or 'pursuit'  
- `item_id` (integer, required): Item ID

**Query Parameters:**
- `org_id` (integer, required): Organization ID

**Request Body:**
```json
{
  "spotlight_id": 1,
  "reason": "Updated company data"
}
```

## Identity Resolution (v2.2)

### GET /identity-conflicts
Get unresolved identity conflicts requiring manual intervention.

**Query Parameters:**
- `org_id` (integer, required): Organization ID
- `resolution_status` (string, optional): 'pending', 'resolved', 'ignored'

**Response:**
```json
{
  "data": [
    {
      "conflict_id": 15,
      "key_type": "email",
      "key_value": "contact@company.com",
      "conflicting_contact_ids": [789, 790],
      "conflicting_client_ids": [101, 102],
      "conflict_reason": "Email associated with multiple contacts",
      "detected_at": "2025-09-08T09:00:00Z",
      "resolution_status": "pending"
    }
  ]
}
```

### POST /identity-conflicts/:id/resolve
Resolve an identity conflict.

**Path Parameters:**
- `id` (integer, required): Conflict ID

**Query Parameters:**
- `org_id` (integer, required): Organization ID

**Request Body:**
```json
{
  "resolved_contact_id": 789,
  "resolved_client_id": 101,
  "resolution_notes": "Verified primary contact through phone call"
}
```

### GET /identity-status
Get identity resolution dashboard metrics.

**Query Parameters:**
- `org_id` (integer, required): Organization ID

**Response:**
```json
{
  "data": [
    {
      "key_type": "email",
      "total_keys": 1250,
      "unresolved_count": 45,
      "auto_resolved_count": 1100,
      "manual_resolved_count": 95,
      "conflict_count": 10,
      "avg_confidence": 0.92,
      "most_recent_activity": "2025-09-08T16:30:00Z"
    }
  ]
}
```

## Workload Analytics (v2.2)

### GET /workload-analysis
Get user workload distribution and performance metrics.

**Query Parameters:**
- `org_id` (integer, required): Organization ID
- `owner_user_id` (integer, optional): Specific user

**Response:**
```json
{
  "data": [
    {
      "owner_user_id": 5,
      "total_items": 12,
      "critical_items": 2,
      "high_priority_items": 4,
      "medium_priority_items": 5,
      "low_priority_items": 1,
      "avg_priority_score": 67.5,
      "sla_breaches": 1,
      "at_risk_items": 3,
      "max_hours_without_touch": 48,
      "stale_items": 2
    }
  ]
}
```

## Error Handling

### Standard HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (missing/invalid parameters)
- `404` - Not Found (entity doesn't exist)
- `409` - Conflict (quality gate failure, state transition blocked)
- `422` - Unprocessable Entity (invalid state transition)
- `500` - Internal Server Error

### Enhanced Error Responses (v2.2)

**Quality Gate Failure (409):**
```json
{
  "error": "Submit blocked; incomplete checklist: pricing_approved, legal_terms_agreed", 
  "status": 409,
  "gate_type": "submit_requirements",
  "missing_items": ["pricing_approved", "legal_terms_agreed"],
  "required_items": ["proposal_reviewed", "pricing_approved", "legal_terms_agreed", "delivery_plan_finalized"],
  "config_source": "config_registry"
}
```

**Identity Conflict (409):**
```json
{
  "error": "Identity resolution conflict detected",
  "status": 409,
  "conflict_id": 15,
  "key_type": "email",
  "key_value": "contact@company.com",
  "conflicting_entities": {
    "contacts": [789, 790],
    "clients": [101, 102]
  },
  "resolution_required": true
}
```

**Invalid State Transition (422):**
```json
{
  "error": "Invalid pursuit transition qual→submit",
  "status": 422,
  "current_state": "qual",
  "attempted_state": "submit", 
  "allowed_transitions": ["pink"],
  "state_machine": "pursuit"
}
```

## State Machines (Enhanced v2.2)

### Candidate Status Transitions
```
new → triaged → nurture → promoted
     ↓        ↓      ↓
   archived ← on_hold ← (configurable transitions)
```

**Default Transitions (configurable via config registry):**
- `new` → `triaged`, `archived`
- `triaged` → `nurture`, `on_hold`, `promoted`, `archived`
- `nurture` → `on_hold`, `promoted`, `archived`
- `on_hold` → `nurture`, `promoted`, `archived`
- `promoted` → `archived` (terminal after promotion)

### Pursuit Stage Transitions
```
qual → pink → red → submit → won/lost
  ↓      ↓     ↓       ↓
 lost ←──┴─────┴───────┘
```

**Default Transitions (configurable via config registry):**
- `qual` → `pink`, `lost`
- `pink` → `red`, `lost`
- `red` → `submit`, `lost`
- `submit` → `won`, `lost`
- `won`, `lost` → (terminal states)

## Quality Gates (Config-Driven v2.2)

### Pink → Red Transition
**Default Requirements (configurable):**
- Budget confirmed and documented
- Technical scope defined
- Decision makers identified
- Timeline agreed upon

### Red → Submit Transition
**Default Requirements (configurable):**
- Proposal reviewed and approved
- Pricing signed off
- Legal terms agreed
- Delivery plan finalized

**Validation:** Enforced via enhanced `ensureQualityGatePasses()` guard with config lookup

## Configuration Examples

### SLA Rule Configuration
```json
{
  "config_type": "sla_rule",
  "config_key": "candidate_triage_sla",
  "config_value": {
    "threshold_hrs": 24,
    "breach_escalation": true,
    "notification_channels": ["email", "slack"]
  }
}
```

### Spotlight Rule Configuration
```json
{
  "config_type": "spotlight_rule", 
  "config_key": "enterprise_icp_weights",
  "config_value": {
    "industry_match": 1.0,
    "budget_fit": 0.8,
    "geo_alignment": 0.6,
    "urgency_match": 1.2,
    "tech_stack_fit": 0.7,
    "company_size_fit": 0.9
  }
}
```

### Quality Gate Configuration
```json
{
  "config_type": "gate_rule",
  "config_key": "pink_to_red_requirements", 
  "config_value": [
    "budget_confirmed",
    "technical_scope_defined", 
    "decision_makers_identified",
    "timeline_agreed",
    "risk_assessment_complete"
  ]
}
```

## Memory Integration Endpoints

### Get Memory Card
Retrieve contextual memory for any workstream entity.

```http
GET /api/memory/card?org_id={org_id}&entity_type={entity_type}&entity_id={entity_id}
```

**Parameters:**
- `org_id` (required): Organization identifier
- `entity_type` (required): Entity type (`candidate`, `pursuit`, `engagement`, `comms_thread`)
- `entity_id` (required): Entity identifier

**Response:**
```json
{
  "status": "ok",
  "data": {
    "summary": {
      "key_facts": ["Client prefers weekly reporting", "Previous proposal rejected due to price"],
      "recent_activity": ["status: Pursuit created", "decision: Proposal submitted"],
      "decisions": ["Pursuit won - contract secured"]
    },
    "top_atoms": [
      {
        "atom_type": "decision",
        "content": "Client confirmed budget approval for $50k",
        "occurred_at": "2025-09-09T15:30:00Z",
        "source_url": "/pursuits/123",
        "score": 100
      }
    ],
    "last_built_at": "2025-09-09T15:35:00Z",
    "etag": "W/\"1-1725897300000\"",
    "empty": false
  }
}
```

**Features:**
- ETag caching support (304 Not Modified responses)
- Real-time context aggregation
- Scored relevance ranking
- Automatic deduplication

### Create Memory Atom
Manually create memory atoms for custom business logic.

```http
POST /api/memory/atoms?org_id={org_id}
Content-Type: application/json

{
  "entity_type": "pursuit",
  "entity_id": 123,
  "atom_type": "preference",
  "content": "Client strongly prefers fixed-price contracts",
  "source": {
    "system": "app",
    "origin_id": "pursuit:123:discovery_call",
    "url": "/pursuits/123"
  },
  "tags": ["pricing", "contract_preference"]
}
```

**Atom Types:**
- `decision`: Important business decisions (100 points)
- `risk`: Risk factors and concerns (90 points)
- `preference`: Client preferences and requirements (80 points)
- `note`: General observations (60 points)
- `status`: Status changes and updates (40 points)

### Redact/Correct Memory
Governance capabilities for memory management.

```http
POST /api/memory/redactions?org_id={org_id}
Content-Type: application/json

{
  "atom_id": 456,
  "action": "redact",
  "reason": "Contains sensitive client information"
}
```

**Actions:**
- `redact`: Mark atom as redacted (hidden from queries)
- `correct`: Create corrected version with new content

## Memory Integration in Workstream Actions

All workstream actions automatically create relevant memory atoms:

### Candidate Actions
```typescript
// Automatic memory capture
POST /api/candidates → candidateMemory.created()
PUT /api/candidates/{id} → candidateMemory.statusChanged()
```

### Pursuit Actions
```typescript
// Lifecycle memory tracking
POST /api/pursuits → pursuitMemory.created()
POST /api/pursuits/{id}/submit → pursuitMemory.proposalSubmitted()
POST /api/pursuits/{id}/won → pursuitMemory.won()
POST /api/pursuits/{id}/lost → pursuitMemory.lost()
```

### Memory Query Examples

```bash
# Get context for pursuit decision
curl -H "Authorization: Bearer $TOKEN" \
  "/api/memory/card?org_id=1&entity_type=pursuit&entity_id=123"

# Create custom memory atom
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_type":"candidate","entity_id":456,"atom_type":"preference","content":"Prefers morning meetings","source":{"system":"app","origin_id":"candidate:456:call","url":"/candidates/456"}}' \
  "/api/memory/atoms?org_id=1"

# Redact sensitive information
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"atom_id":789,"action":"redact","reason":"Contains PII"}' \
  "/api/memory/redactions?org_id=1"
```
