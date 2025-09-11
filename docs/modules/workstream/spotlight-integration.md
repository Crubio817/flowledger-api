# Spotlight System Integration

## Overview

The Spotlight system provides Ideal Customer Profile (ICP) evaluation capabilities that integrate with the Workstream module. It allows organizations to define custom criteria for lead qualification and automatically evaluate incoming signals against these profiles.

## Architecture

### Core Components

- **Spotlights**: ICP definitions with custom fields
- **Fields**: Configurable evaluation criteria
- **Values**: Field values for specific spotlights
- **Rules**: Conditional logic for field visibility/validation
- **Evaluation Engine**: Signal matching against spotlights

## Database Schema

### Spotlights Table

```sql
create table app.spotlights (
  spotlight_id bigint identity primary key,
  org_id       int not null,
  name         nvarchar(255) not null,
  domain       nvarchar(100) not null, -- e.g., 'tech', 'healthcare'
  description  nvarchar(1000) null,
  active       bit not null default 1,
  created_at   datetime2 not null default sysdatetime(),
  updated_at   datetime2 not null default sysdatetime(),
  row_version  rowversion
);
```

### Spotlight Fields Table

```sql
create table app.spotlight_fields (
  field_id      bigint identity primary key,
  org_id        int not null,
  domain        nvarchar(100) not null,
  field_name    nvarchar(255) not null,
  field_type    nvarchar(50) not null check (field_type in ('text','number','boolean','enum','date')),
  is_required   bit not null default 0,
  display_order int not null default 0,
  enum_values   nvarchar(max) null, -- JSON array for enum options
  created_at    datetime2 not null default sysdatetime(),
  row_version   rowversion
);
```

### Spotlight Values Table

```sql
create table app.spotlight_values (
  value_id     bigint identity primary key,
  org_id       int not null,
  spotlight_id bigint not null,
  field_id     bigint not null,
  field_value  nvarchar(max) null,
  created_at   datetime2 not null default sysdatetime(),
  updated_at   datetime2 not null default sysdatetime(),
  row_version  rowversion,
  foreign key (spotlight_id) references app.spotlights(spotlight_id),
  foreign key (field_id) references app.spotlight_fields(field_id)
);
```

### Spotlight Field Rules Table

```sql
create table app.spotlight_field_rules (
  rule_id            bigint identity primary key,
  org_id             int not null,
  field_id           bigint not null,
  condition_field_id bigint not null,
  operator           nvarchar(10) not null check (operator in ('=','!=','>','<','>=','<=','contains')),
  condition_value    nvarchar(255) not null,
  created_at         datetime2 not null default sysdatetime(),
  row_version        rowversion,
  foreign key (field_id) references app.spotlight_fields(field_id),
  foreign key (condition_field_id) references app.spotlight_fields(field_id)
);
```

## API Endpoints

### List Spotlights

```http
GET /api/spotlights?org_id=1&domain=tech&active=true&page=1&limit=20
```

**Response:**
```json
{
  "data": [
    {
      "spotlight_id": 123,
      "org_id": 1,
      "name": "Enterprise Tech Companies",
      "domain": "tech",
      "description": "Companies with 500+ employees in tech sector",
      "active": true,
      "field_count": 5,
      "created_at": "2025-09-09T10:00:00Z",
      "updated_at": "2025-09-09T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15
  }
}
```

### Create Spotlight

```http
POST /api/spotlights
Content-Type: application/json

{
  "org_id": 1,
  "name": "Mid-Market SaaS Companies",
  "domain": "saas",
  "description": "Companies with 100-500 employees using SaaS solutions"
}
```

### Get Spotlight Details

```http
GET /api/spotlights/123?org_id=1
```

**Response:**
```json
{
  "spotlight_id": 123,
  "org_id": 1,
  "name": "Enterprise Tech Companies",
  "domain": "tech",
  "description": "Companies with 500+ employees in tech sector",
  "active": true,
  "created_at": "2025-09-09T10:00:00Z",
  "updated_at": "2025-09-09T10:00:00Z",
  "fields": [
    {
      "field_id": 456,
      "field_name": "company_size",
      "field_type": "enum",
      "is_required": true,
      "display_order": 1,
      "enum_values": ["1-50", "51-200", "201-500", "501-1000", "1000+"],
      "value": "501-1000"
    },
    {
      "field_id": 457,
      "field_name": "annual_revenue",
      "field_type": "number",
      "is_required": false,
      "display_order": 2,
      "enum_values": null,
      "value": "50000000"
    }
  ]
}
```

### Update Spotlight

```http
PUT /api/spotlights/123
Content-Type: application/json

{
  "org_id": 1,
  "name": "Large Enterprise Tech Companies",
  "domain": "tech",
  "description": "Updated description",
  "active": true,
  "field_values": {
    "456": "1000+",
    "457": "100000000"
  }
}
```

### Evaluate Signal

```http
POST /api/spotlights/123/evaluate
Content-Type: application/json

{
  "org_id": 1,
  "signal_data": {
    "company_size": "1000+",
    "industry": "technology",
    "annual_revenue": "75000000",
    "budget": "500000"
  }
}
```

**Response:**
```json
{
  "match_score": 0.8,
  "matched_fields": 3,
  "total_fields": 4,
  "recommendation": "high_match"
}
```

### Clone Spotlight

```http
POST /api/spotlights/123/clone
Content-Type: application/json

{
  "org_id": 1,
  "name": "Enterprise Tech Companies v2"
}
```

## Evaluation Logic

### Matching Algorithm

The evaluation engine compares signal data against spotlight field values:

```typescript
function matchesCriteria(signalValue: any, spotlightValue: any, fieldType: string): boolean {
  if (!signalValue || !spotlightValue) return false;

  switch (fieldType) {
    case 'text':
      return String(signalValue).toLowerCase().includes(String(spotlightValue).toLowerCase());
    case 'number':
      return Number(signalValue) === Number(spotlightValue);
    case 'boolean':
      return Boolean(signalValue) === Boolean(spotlightValue);
    case 'enum':
      return String(signalValue) === String(spotlightValue);
    case 'date':
      return new Date(signalValue).getTime() === new Date(spotlightValue).getTime();
    default:
      return false;
  }
}
```

### Scoring

```typescript
function calculateMatchScore(signalData: any, spotlightFields: any[]): number {
  let matched = 0;
  const total = spotlightFields.length;

  for (const field of spotlightFields) {
    const signalValue = signalData[field.field_name];
    if (signalValue && matchesCriteria(signalValue, field.value, field.field_type)) {
      matched++;
    }
  }

  return total > 0 ? matched / total : 0;
}

function getRecommendation(score: number): string {
  if (score >= 0.8) return 'high_match';
  if (score >= 0.6) return 'medium_match';
  if (score >= 0.4) return 'low_match';
  return 'no_match';
}
```

## Conditional Field Rules

Field rules enable dynamic form behavior:

```typescript
interface FieldRule {
  field_id: number;
  condition_field_id: number;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';
  condition_value: string;
}
```

**Example Rules:**
- Show "budget_range" field only when "company_size" > "500"
- Require "technical_contacts" when "solution_type" = "enterprise"
- Hide "trial_interest" when "contract_type" = "annual"

## Integration with Workstream

### Signal Evaluation Flow

1. **Signal Ingestion**: New signals are captured from various sources
2. **Spotlight Evaluation**: Signals are evaluated against active spotlights
3. **Scoring**: Match scores determine lead priority
4. **Candidate Creation**: High-scoring signals become candidates
5. **Pursuit Advancement**: Qualified candidates progress through pipeline

### Event Integration

Spotlight evaluations generate events for the workstream:

```typescript
// Emit spotlight evaluation event
await emitSpotlightEvent('spotlight.evaluated', {
  spotlight_id: spotlightId,
  signal_id: signalId,
  match_score: score,
  recommendation: recommendation,
  org_id: orgId
});
```

### Automation Triggers

Evaluation results can trigger automated actions:

- **High Match**: Auto-create candidate with priority boost
- **Medium Match**: Add to nurture campaign
- **Low Match**: Route to manual review queue
- **No Match**: Archive or discard

## Frontend Integration

### Spotlight Management UI

The frontend provides interfaces for:

- **Spotlight Builder**: Visual ICP creation with drag-and-drop fields
- **Field Configuration**: Define custom fields with validation rules
- **Rule Engine**: Set up conditional logic
- **Evaluation Dashboard**: View match results and scoring

### Workstream Dashboard Integration

- **Signal List**: Show spotlight match scores
- **Candidate Details**: Display evaluation results
- **Pursuit Timeline**: Track qualification progress
- **Analytics**: Match rate reporting

## Performance Considerations

### Indexing Strategy

```sql
-- Domain and active status filtering
create index IX_spotlights_org_domain on app.spotlights(org_id, domain);
create index IX_spotlights_org_active on app.spotlights(org_id, active);

-- Field lookups
create index IX_spotlight_fields_org_domain on app.spotlight_fields(org_id, domain);
create unique index UX_spotlight_fields_org_domain_name on app.spotlight_fields(org_id, domain, field_name);

-- Value lookups
create index IX_spotlight_values_org_spotlight on app.spotlight_values(org_id, spotlight_id);
create index IX_spotlight_values_org_field on app.spotlight_values(org_id, field_id);
```

### Caching

- Cache spotlight definitions for evaluation
- Cache field configurations
- Cache evaluation results for repeated signals

### Batch Processing

For high-volume signal processing:

```typescript
async function batchEvaluateSignals(signals: Signal[], spotlights: Spotlight[]): Promise<EvaluationResult[]> {
  const results: EvaluationResult[] = [];

  for (const signal of signals) {
    for (const spotlight of spotlights) {
      if (spotlight.active && spotlight.domain === signal.domain) {
        const score = await evaluateSignal(signal, spotlight);
        results.push({
          signal_id: signal.id,
          spotlight_id: spotlight.id,
          match_score: score,
          recommendation: getRecommendation(score)
        });
      }
    }
  }

  return results;
}
```

## Monitoring and Analytics

### Key Metrics

- **Match Rates**: Percentage of signals matching each spotlight
- **Evaluation Latency**: Time to evaluate signal against all spotlights
- **Conversion Rates**: High-match signals becoming customers
- **Field Usage**: Which fields contribute most to matches

### Logging

```typescript
// Structured evaluation logging
logger.info('Spotlight evaluation completed', {
  spotlight_id: spotlightId,
  signal_id: signalId,
  match_score: score,
  matched_fields: matchedCount,
  total_fields: totalCount,
  evaluation_time_ms: Date.now() - startTime,
  recommendation: recommendation
});
```

### Alerts

- Low match rates for active spotlights
- Evaluation failures
- Performance degradation
- Configuration errors

## Migration and Deployment

### Database Migration

```sql
-- Migration: Add Spotlight System tables
-- Date: 2025-09-09

-- Create tables as defined above
-- Add indexes for performance
-- Insert sample data for testing
```

### API Versioning

- Use semantic versioning for API changes
- Maintain backward compatibility
- Document breaking changes

### Rollout Strategy

1. **Database Migration**: Deploy schema changes
2. **Backend Deployment**: Deploy API changes
3. **Frontend Deployment**: Deploy UI updates
4. **Data Migration**: Migrate existing ICP data
5. **Testing**: Validate end-to-end functionality
6. **Monitoring**: Monitor performance and errors

## Future Enhancements

### Advanced Matching

- **Fuzzy Matching**: Approximate string matching
- **Weighted Scoring**: Different field weights
- **Machine Learning**: AI-powered matching algorithms
- **Historical Analysis**: Learn from past conversions

### Integration Extensions

- **CRM Integration**: Sync with Salesforce, HubSpot
- **Marketing Automation**: Trigger campaigns based on matches
- **External Data Sources**: Enrich signals with third-party data
- **Real-time Evaluation**: Streaming signal processing

### Analytics Improvements

- **A/B Testing**: Test different spotlight configurations
- **Predictive Scoring**: Forecast conversion probability
- **Attribution Modeling**: Track touchpoint contributions
- **Custom Dashboards**: Flexible reporting interfaces
