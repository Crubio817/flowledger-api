# People Module API Specification for Frontend Development

## Overview

The People module provides staffing and resource management with explainable FitScores, immutable rate snapshots, and rate resolution with full audit breakdowns.

## Core Concepts

- FitScore: Weighted scoring across hard/soft skills, availability, timezone, domain, reliability, continuity.
- Immutable Rate Snapshots: Bill/cost rates are snapshotted at assignment-creation time and not mutable afterward.
- Multi-tenancy: All requests require `org_id` for isolation.

## API Endpoints

### Staffing Requests

#### POST /api/staffing-requests/:id/rank
Rank candidates for a staffing request with FitScore and optional rate preview.

Request:
```http
POST /api/staffing-requests/123/rank?org_id=1&limit=20&include_rate_preview=true
```

Response (shape):
```ts
interface RankResponse {
  data: Array<{
    person_id: number;
    fit_score: number;
    reasons: Array<{ code: string; detail: string; contribution: number; evidence?: any }>;
    modeled_rate?: {
      currency: string;
      base: number;
      abs_premiums: Array<{ source: string; amount: number }>;
      pct_premiums: Array<{ source: string; percentage: number }>;
      scarcity: number;
      total: number;
      override_source?: string;
    } | null;
  }>;
  meta: { total: number; limit: number; staffing_request_id: number };
}
```

### Assignments

#### POST /api/assignments
Create assignment with immutable rate snapshot.

Request:
```http
POST /api/assignments
Content-Type: application/json

{
  "org_id": 1,
  "person_id": 123,
  "engagement_id": 456,
  "role_template_id": 789,
  "start_date": "2025-10-01",
  "end_date": "2025-12-31",
  "alloc_pct": 100,
  "status": "tentative"
}
```

#### PATCH /api/assignments/{assignment_id}
Update non-snapshot fields (e.g., status, alloc_pct). Snapshot fields are rejected.

#### DELETE /api/assignments/{assignment_id}
Cancel an assignment (soft delete by status).

### Rate Preview

#### GET /api/rates/preview
Resolve effective rate with full breakdown before assignment.

Request:
```http
GET /api/rates/preview?org_id=1&role_template_id=789&level=L3&skills=1,2,3&engagement_id=456&as_of=2025-10-01
```

Response (shape):
```ts
{
  base_currency: string;
  base_amount: number;
  premiums: { absolute: Array<{ source: string; amount: number }>; percentage: Array<{ source: string; percentage: number }> };
  scarcity_multiplier: number;
  fx_rate?: number;
  final_amount: number;
  final_currency: string;
  precedence_applied: string;
  breakdown: string; // JSON audit trail
}
```

## Performance Targets

- Ranking p95 < 300ms for 5k people
- Rate resolution < 50ms per preview

## Notes

- All endpoints appear under the People tag in Swagger: /api/docs
- Use `org_id` on every request.

