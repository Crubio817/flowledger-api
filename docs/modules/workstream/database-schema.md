```markdown
# Workstream Module Database Schema

## Overview

The Workstream module implements a sales pipeline management system with the following core entities:

- **Signals**: Incoming leads from various sources (email, ads, calls, notes)
- **Candidates**: Qualified leads that have been triaged
- **Pursuits**: Active sales opportunities
- **Proposals**: Document versions sent to prospects
- **Events**: Audit trail and outbox pattern for reliable processing

### v2.2 Hardening Enhancements

The schema has been enhanced with three critical hardening systems:

1. **Centralized Configuration Registry**: Unified rule management with effective dating
2. **Explainable AI Scoring**: Component-level score breakdown and audit trails
3. **Enhanced Identity Resolution**: Canonical key management and conflict resolution

## Core Tables

### Signals (`app.signal`)

Stores incoming lead signals with deduplication and clustering.

| Column | Type | Description |
|--------|------|-------------|
| `signal_id` | `bigint` | Primary key |
| `org_id` | `int` | Multi-tenant organization ID |
| `source_type` | `varchar(16)` | Source: 'email', 'ad', 'call', 'note' |
| `source_ref` | `varchar(256)` | Reference to source system |
| `snippet` | `nvarchar(1000)` | Signal content snippet |
| `contact_id` | `int` | Associated contact |
| `client_id` | `int` | Associated client |
| `ts` | `datetime2` | Signal timestamp |
| `problem_phrase` | `nvarchar(300)` | Extracted problem statement |
| `solution_hint` | `nvarchar(300)` | Suggested solution |
| `urgency_score` | `decimal(3,2)` | Urgency rating (0-1) |
| `dedupe_key` | `varchar(128)` | Deduplication key |
| `cluster_id` | `bigint` | Signal cluster ID |
| `owner_user_id` | `int` | Assigned owner |
| `contact_email` | `varchar(256)` | **NEW**: Extracted email for identity resolution |
| `contact_phone` | `varchar(32)` | **NEW**: Extracted phone for identity resolution |
| `company_domain` | `varchar(128)` | **NEW**: Company domain for identity resolution |
| `normalized_keys_json` | `nvarchar(500)` | **NEW**: JSON object with all extracted keys |
| `created_at` | `datetime2` | Creation timestamp |
| `updated_at` | `datetime2` | Last update timestamp |

**Indexes:**
- `UX_signal_dedupe` (org_id, dedupe_key) - Unique deduplication
- `UX_signal_composite_dedupe` (org_id, source_type, source_ref, contact_email, contact_phone) - **NEW**: Enhanced deduplication
- `IX_signal_cluster` (org_id, cluster_id) - Cluster lookup
- `IX_signal_ts` (ts DESC) - Time-based ordering
- `IX_signal_org_ts` (org_id, ts DESC) - Org-scoped time ordering

### Signal Clusters (`app.signal_cluster`)

Groups related signals for analysis.

| Column | Type | Description |
|--------|------|-------------|
| `cluster_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `algo` | `varchar(32)` | Clustering algorithm used |
| `params_json` | `nvarchar(max)` | Algorithm parameters |
| `created_at` | `datetime2` | Creation timestamp |

### Candidates (`app.candidate`)

Qualified leads that have been triaged and are being nurtured.

| Column | Type | Description |
|--------|------|-------------|
| `candidate_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `client_id` | `int` | Associated client |
| `contact_id` | `int` | Associated contact |
| `problem_id` | `int` | Problem taxonomy ID |
| `solution_id` | `int` | Solution catalog ID |
| `title` | `nvarchar(200)` | Candidate title |
| `one_liner_scope` | `nvarchar(280)` | Brief scope description |
| `confidence` | `decimal(3,2)` | Confidence score (0-1) |
| `value_band` | `varchar(8)` | Value estimate: 'low', 'med', 'high' |
| `next_step` | `nvarchar(200)` | Next action |
| `status` | `varchar(12)` | Status: 'new', 'triaged', 'nurture', 'on_hold', 'promoted', 'archived' |
| `owner_user_id` | `int` | Assigned owner |
| `last_touch_at` | `datetime2` | Last activity timestamp |
| `created_at` | `datetime2` | Creation timestamp |
| `updated_at` | `datetime2` | Last update timestamp |

**Indexes:**
- `IX_candidate_board` (org_id, status, owner_user_id, last_touch_at DESC) - Board view
- `IX_candidate_org_client` (org_id, client_id) - Client lookup
- `IX_candidate_org_status` (org_id, status) - Status filtering

### Candidate-Signal Links (`app.candidate_signal`)

Links candidates to their originating signals.

| Column | Type | Description |
|--------|------|-------------|
| `candidate_id` | `bigint` | Candidate ID |
| `signal_id` | `bigint` | Signal ID |

**Constraints:**
- Primary key: (candidate_id, signal_id)
- Foreign keys to candidate and signal tables

### Pursuits (`app.pursuit`)

Active sales opportunities with full pipeline tracking.

| Column | Type | Description |
|--------|------|-------------|
| `pursuit_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `candidate_id` | `bigint` | Associated candidate |
| `due_date` | `date` | Pursuit due date |
| `capture_lead_id` | `int` | Capture lead user |
| `proposal_mgr_id` | `int` | Proposal manager user |
| `pursuit_stage` | `varchar(8)` | Stage: 'qual', 'pink', 'red', 'submit', 'won', 'lost' |
| `compliance_score` | `decimal(4,1)` | Compliance score |
| `forecast_value_usd` | `decimal(18,2)` | Forecast value |
| `cos_hours` | `decimal(10,2)` | Cost of sale hours |
| `cos_amount` | `decimal(18,2)` | Cost of sale amount |
| `created_at` | `datetime2` | Creation timestamp |
| `updated_at` | `datetime2` | Last update timestamp |

**Indexes:**
- `IX_pursuit_board` (org_id, pursuit_stage, due_date ASC) - Pipeline board
- `IX_pursuit_org_candidate` (org_id, candidate_id) - Candidate lookup
- `IX_pursuit_org_stage` (org_id, pursuit_stage) - Stage filtering

**Constraints:**
- `UX_pursuit_once_per_candidate` (org_id, candidate_id) - One pursuit per candidate

### Proposals (`app.proposal`)

Proposal documents with versioning.

| Column | Type | Description |
|--------|------|-------------|
| `proposal_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `pursuit_id` | `bigint` | Associated pursuit |
| `version` | `int` | Version number |
| `doc_id` | `varchar(128)` | Document reference |
| `status` | `varchar(12)` | Status: 'draft', 'sent', 'signed', 'void' |
| `sent_at` | `datetime2` | Sent timestamp |
| `created_at` | `datetime2` | Creation timestamp |

**Constraints:**
- `UX_proposal_version` (org_id, pursuit_id, version) - Unique versions
- `UX_proposal_version_once` (org_id, pursuit_id, version) - Version uniqueness

### Cost of Sale Entries (`app.cos_entry`)

Detailed cost tracking for pursuits.

| Column | Type | Description |
|--------|------|-------------|
| `cos_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `pursuit_id` | `bigint` | Associated pursuit |
| `role` | `varchar(64)` | Role description |
| `hours` | `decimal(10,2)` | Hours worked |
| `rate` | `decimal(10,2)` | Hourly rate |
| `amount` | `decimal(18,2)` | Computed amount (hours * rate) |
| `source` | `varchar(24)` | Cost source |
| `created_at` | `datetime2` | Creation timestamp |

### Pursuit Role Estimates (`app.pursuit_role_estimate`)

PERT estimating for pursuits.

| Column | Type | Description |
|--------|------|-------------|
| `estimate_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `pursuit_id` | `bigint` | Associated pursuit |
| `role` | `varchar(64)` | Role being estimated |
| `optimistic_hours` | `decimal(10,2)` | Optimistic estimate |
| `most_likely_hours` | `decimal(10,2)` | Most likely estimate |
| `pessimistic_hours` | `decimal(10,2)` | Pessimistic estimate |
| `confidence` | `decimal(3,2)` | Confidence score |
| `created_at` | `datetime2` | Creation timestamp |

## Supporting Tables

### Work Item Links (`app.work_item_link`)

Links work items to external references.

| Column | Type | Description |
|--------|------|-------------|
| `link_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `item_type` | `varchar(12)` | Item type: 'signal', 'candidate', 'pursuit' |
| `item_id` | `bigint` | Item ID |
| `link_type` | `varchar(12)` | Link type: 'thread', 'doc' |
| `target_type` | `varchar(24)` | Target system type |
| `target_ref` | `varchar(256)` | Target reference |
| `created_at` | `datetime2` | Creation timestamp |

### Work Events (`app.work_event`)

Event sourcing and outbox pattern for reliable processing.

| Column | Type | Description |
|--------|------|-------------|
| `event_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `item_type` | `varchar(12)` | Item type |
| `item_id` | `bigint` | Item ID |
| `event_name` | `varchar(40)` | Event name |
| `payload_json` | `nvarchar(max)` | Event payload |
| `happened_at` | `datetime2` | Event timestamp |
| `actor_user_id` | `int` | User who triggered event |
| `claimed_at` | `datetime2` | Outbox claim timestamp |
| `claimed_by` | `varchar(64)` | Worker claiming event |
| `processed_at` | `datetime2` | Processing completion timestamp |
| `dead_letter_at` | `datetime2` | Dead letter timestamp |
| `retry_count` | `int` | Retry attempts |
| `max_attempts` | `int` | Maximum retry attempts |

### Drip Schedules (`app.drip_schedule`)

Automated nurture campaigns.

| Column | Type | Description |
|--------|------|-------------|
| `drip_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `candidate_id` | `bigint` | Target candidate |
| `template_id` | `int` | Email template ID |
| `next_run_at` | `datetime2` | Next send time |
| `cadence_days` | `int` | Days between sends |
| `status` | `varchar(12)` | Status: 'active', 'paused', 'done' |
| `last_sent_at` | `datetime2` | Last send timestamp |

## Taxonomy Tables

### Problem Taxonomy (`app.problem_taxonomy`)

Standardized problem definitions.

| Column | Type | Description |
|--------|------|-------------|
| `problem_id` | `int` | Primary key |
| `org_id` | `int` | Organization ID |
| `name` | `nvarchar(120)` | Problem name |
| `definition` | `nvarchar(400)` | Problem definition |
| `active` | `bit` | Active flag |

### Solution Catalog (`app.solution_catalog`)

Available solution offerings.

| Column | Type | Description |
|--------|------|-------------|
| `solution_id` | `int` | Primary key |
| `org_id` | `int` | Organization ID |
| `name` | `nvarchar(120)` | Solution name |
| `playbook_ref` | `nvarchar(256)` | Playbook reference |
| `active` | `bit` | Active flag |

## SLA and Quality Assurance

### SLA Rules (`app.sla_rule`)

Service level agreement definitions.

| Column | Type | Description |
|--------|------|-------------|
| `rule_id` | `int` | Primary key |
| `org_id` | `int` | Organization ID |
| `item_type` | `varchar(12)` | Item type |
| `stage` | `varchar(16)` | Applicable stage |
| `metric` | `varchar(24)` | SLA metric |
| `threshold_hrs` | `int` | Hours threshold |
| `active_from` | `datetime2` | Activation date |
| `active_to` | `datetime2` | Deactivation date |
| `is_active` | `bit` | Active flag |

### SLA Breaches (`app.sla_breach`)

Recorded SLA violations.

| Column | Type | Description |
|--------|------|-------------|
| `breach_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `item_type` | `varchar(12)` | Item type |
| `item_id` | `bigint` | Item ID |
| `rule_id` | `int` | SLA rule ID |
| `breached_at` | `datetime2` | Breach timestamp |
| `reason_code` | `varchar(32)` | Breach reason |
| `resolved_at` | `datetime2` | Resolution timestamp |

## Quality Gates

### Pursuit Checklist (`app.pursuit_checklist`)

Quality checklist items for pursuits.

| Column | Type | Description |
|--------|------|-------------|
| `checklist_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `pursuit_id` | `bigint` | Associated pursuit |
| `name` | `nvarchar(120)` | Checklist item name |
| `is_required` | `bit` | Required flag |
| `is_done` | `bit` | Completion flag |
| `done_at` | `datetime2` | Completion timestamp |

## Configuration Management Tables (v2.2)

### Configuration Registry (`app.config_registry`)

Centralized configuration management for all business rules.

| Column | Type | Description |
|--------|------|-------------|
| `config_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `config_type` | `varchar(32)` | Type: 'sla_rule', 'spotlight_rule', 'gate_rule', 'ranking_rule' |
| `config_key` | `varchar(64)` | Configuration key |
| `config_value` | `nvarchar(max)` | JSON configuration data |
| `effective_from` | `datetime2` | Activation date |
| `effective_to` | `datetime2` | Deactivation date (NULL = active) |
| `is_active` | `bit` | Active flag |
| `created_at` | `datetime2` | Creation timestamp |
| `created_by` | `int` | Creator user ID |
| `updated_at` | `datetime2` | Last update timestamp |
| `updated_by` | `int` | Last updater user ID |

**Indexes:**
- `IX_config_registry_org_type` (org_id, config_type, is_active) - Lookup by type
- `IX_config_registry_effective` (effective_from, effective_to) WHERE is_active = 1 - Time-based filtering
- `UX_config_registry_active` (org_id, config_type, config_key, effective_from) WHERE is_active = 1 AND effective_to IS NULL - Unique active configs

### Active Configuration View (`app.v_active_config`)

Real-time view of currently active configurations.

**Columns:** config_id, org_id, config_type, config_key, config_value, effective_from, effective_to, created_at, created_by

**Logic:** Filters config_registry for currently active configurations (is_active = 1, effective_from <= NOW, effective_to IS NULL OR > NOW)

## Explainable AI Scoring Tables (v2.2)

### Spotlight Score Components (`app.spotlight_score_components`)

Detailed breakdown of AI scoring decisions for transparency and tuning.

| Column | Type | Description |
|--------|------|-------------|
| `component_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `item_type` | `varchar(12)` | Item type: 'signal', 'candidate', 'pursuit' |
| `item_id` | `bigint` | Item ID |
| `spotlight_id` | `int` | Spotlight configuration ID |
| `component_name` | `varchar(64)` | Component: 'industry_match', 'budget_fit', 'geo_alignment' |
| `component_score` | `decimal(6,2)` | Score (can be positive/negative) |
| `component_weight` | `decimal(4,2)` | Weight multiplier (default 1.0) |
| `component_reason` | `nvarchar(200)` | Human-readable explanation |
| `max_possible_score` | `decimal(6,2)` | Maximum possible score for this component |
| `scored_at` | `datetime2` | Scoring timestamp |
| `algorithm_version` | `varchar(16)` | Algorithm version for tracking |

**Indexes:**
- `IX_score_components_item` (org_id, item_type, item_id, scored_at DESC) - Item lookup
- `IX_score_components_spotlight` (org_id, spotlight_id, scored_at DESC) - Spotlight analysis
- `IX_score_components_name` (org_id, component_name, scored_at DESC) - Component analysis

### Spotlight Score Summary (`app.v_spotlight_score_summary`)

Aggregated view with total scores and component breakdowns.

**Columns:** org_id, item_type, item_id, spotlight_id, scored_at, algorithm_version, total_score, score_breakdown (JSON), top_positive, top_negative, component_count

### Spotlight Scoring History (`app.spotlight_scoring_history`)

Audit trail of score changes over time.

| Column | Type | Description |
|--------|------|-------------|
| `history_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `item_type` | `varchar(12)` | Item type |
| `item_id` | `bigint` | Item ID |
| `spotlight_id` | `int` | Spotlight ID |
| `previous_score` | `decimal(6,2)` | Previous total score |
| `new_score` | `decimal(6,2)` | New total score |
| `score_delta` | `decimal(6,2)` | Score change |
| `change_reason` | `nvarchar(300)` | Reason for change |
| `changed_components` | `nvarchar(max)` | JSON array of changed components |
| `algorithm_version` | `varchar(16)` | Algorithm version |
| `scored_at` | `datetime2` | Change timestamp |
| `scored_by` | `int` | User ID (NULL = system) |

## Enhanced Identity Resolution Tables (v2.2)

### Canonical Identity Keys (`app.canonical_identity_keys`)

Master registry for identity resolution across all sources.

| Column | Type | Description |
|--------|------|-------------|
| `key_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `key_type` | `varchar(16)` | Type: 'email', 'phone', 'source_ref', 'company_domain' |
| `key_value` | `varchar(256)` | Normalized key value |
| `canonical_contact_id` | `int` | Resolved contact ID |
| `canonical_client_id` | `int` | Resolved client ID |
| `confidence_score` | `decimal(3,2)` | Resolution confidence (0.0-1.0) |
| `first_seen_at` | `datetime2` | First occurrence |
| `last_seen_at` | `datetime2` | Last occurrence |
| `occurrences` | `int` | Number of times seen |
| `resolution_status` | `varchar(16)` | Status: 'unresolved', 'auto_resolved', 'manual_resolved', 'conflict' |
| `resolved_by` | `int` | User ID for manual resolution |
| `resolved_at` | `datetime2` | Resolution timestamp |

**Indexes:**
- `UX_canonical_keys` (org_id, key_type, key_value) - Unique key lookup
- `IX_canonical_keys_contact` (org_id, canonical_contact_id) WHERE canonical_contact_id IS NOT NULL
- `IX_canonical_keys_client` (org_id, canonical_client_id) WHERE canonical_client_id IS NOT NULL
- `IX_canonical_keys_unresolved` (org_id, resolution_status) WHERE resolution_status = 'unresolved'

### Identity Resolution Conflicts (`app.identity_resolution_conflicts`)

Tracks conflicts requiring manual intervention.

| Column | Type | Description |
|--------|------|-------------|
| `conflict_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `key_type` | `varchar(16)` | Conflicting key type |
| `key_value` | `varchar(256)` | Conflicting key value |
| `conflicting_contact_ids` | `nvarchar(100)` | JSON array of contact IDs |
| `conflicting_client_ids` | `nvarchar(100)` | JSON array of client IDs |
| `conflict_reason` | `nvarchar(300)` | Description of conflict |
| `detected_at` | `datetime2` | Detection timestamp |
| `resolution_status` | `varchar(16)` | Status: 'pending', 'resolved', 'ignored' |
| `resolved_contact_id` | `int` | Final resolved contact |
| `resolved_client_id` | `int` | Final resolved client |
| `resolved_by` | `int` | Resolver user ID |
| `resolved_at` | `datetime2` | Resolution timestamp |
| `resolution_notes` | `nvarchar(500)` | Resolution notes |

### Contact Merge History (`app.contact_merge_history`)

Audit trail of contact merging operations.

| Column | Type | Description |
|--------|------|-------------|
| `merge_id` | `bigint` | Primary key |
| `org_id` | `int` | Organization ID |
| `primary_contact_id` | `int` | Contact that was kept |
| `merged_contact_id` | `int` | Contact that was merged |
| `merge_reason` | `nvarchar(300)` | Reason for merge |
| `merged_keys` | `nvarchar(max)` | JSON of keys that triggered merge |
| `data_preserved` | `nvarchar(max)` | JSON of preserved data |
| `merged_by` | `int` | User who performed merge |
| `merged_at` | `datetime2` | Merge timestamp |

### Identity Resolution Status View (`app.v_identity_resolution_status`)

Dashboard view for identity resolution monitoring.

**Columns:** org_id, key_type, total_keys, unresolved_count, auto_resolved_count, manual_resolved_count, conflict_count, avg_confidence, most_recent_activity

## Enhanced Views (v2.2)

### Today Panel with Intelligent Ranking (`app.v_today_panel`)

Enhanced dashboard view with multi-factor priority scoring.

**Columns:** 
- item_type, item_id, org_id, label, state, last_touch_at, due_date, sla_metric, badge
- **NEW**: priority_score, owner_user_id, icp_band, hours_since_touch, priority_tier

**Priority Calculation Logic:**
- SLA urgency weight (100 for breaches, 50 for aging, 25 for medium, 10 for recent)
- ICP band weight (30 for high, 15 for medium, 5 for low value)
- Stage weight (35 for submit, 25 for red, 15 for pink/nurture, 10 for qual/triaged)
- Workload penalty (reduces priority based on owner's current load)

**Priority Tiers:** 'critical' (≥100), 'high' (≥75), 'medium' (≥50), 'low' (<50)

### User Workload Analysis (`app.v_user_workload_analysis`)

Performance analytics for workload distribution.

**Columns:** org_id, owner_user_id, total_items, critical_items, high_priority_items, medium_priority_items, low_priority_items, avg_priority_score, sla_breaches, at_risk_items, max_hours_without_touch, stale_items

### Pursuit Checklist Ready (`app.v_pursuit_checklist_ready`)

Determines if a pursuit's required checklist items are complete.

**Columns:** org_id, pursuit_id, ready

## Stored Procedures (v2.2)

### Identity Resolution (`app.sp_resolve_identity`)

Automated identity resolution with conflict detection.

**Parameters:**
- @org_id INT
- @key_type VARCHAR(16) 
- @key_value VARCHAR(256)
- @resolved_contact_id INT (optional)
- @resolved_client_id INT (optional)
- @resolved_by INT (optional)

**Logic:**
1. Check for existing key and potential conflicts
2. Log conflicts to identity_resolution_conflicts table
3. Update or insert resolution if no conflicts
4. Handle both automatic and manual resolution workflows

## Migration Scripts

- `20250907_add_workstream_tables.sql` - Core workstream tables
- `20250907_add_core_modules.sql` - Module system integration
- `20250907_final_tightenings.sql` - SLA, checklists, constraints
- `20250907_today_panel_view.sql` - Dashboard view
- `20250909_add_spotlight_tables.sql` - Spotlight integration
- **NEW**: `20250909_add_config_registry.sql` - Centralized configuration system
- **NEW**: `20250909_add_score_components.sql` - Explainable AI scoring
- **NEW**: `20250909_add_identity_system.sql` - Enhanced identity resolution
- **NEW**: `20250909_enhanced_today_panel.sql` - Intelligent priority ranking

## Integration Points

### Spotlight Integration (Enhanced v2.2)

The Workstream module integrates with an enhanced Spotlight system for ICP evaluation:

#### Core Spotlight Tables
- `app.spotlights` - ICP definitions
- `app.spotlight_fields` - Custom fields for ICP evaluation  
- `app.spotlight_values` - Field values for specific spotlights
- `app.spotlight_field_rules` - Conditional logic for field visibility/validation

#### New Scoring Enhancement Tables
- `app.spotlight_score_components` - Detailed score breakdowns
- `app.v_spotlight_score_summary` - Aggregated scoring view
- `app.spotlight_scoring_history` - Score change audit trail

### Configuration Integration

All business rules now flow through the centralized configuration registry:
- SLA thresholds and breach detection rules
- Quality gate requirements (Pink/Red checklists)
- Spotlight scoring weights and algorithms
- Priority ranking formulas for Today panel
- State machine transition rules (future enhancement)

### Identity Resolution Integration

Enhanced deduplication connects to:
- Contact management system for canonical contact resolution
- Client management for company-level deduplication
- Signal ingestion for real-time duplicate detection
- External data sources for identity enrichment

```
