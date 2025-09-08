# People Module Implementation

This directory contains the implementation of the People module for staffing and resource management.

## Overview

The People module provides:
- **Skill-based staffing** with explainable FitScores
- **Immutable rate snapshots** for auditability
- **Availability tracking** and conflict detection
- **Team optimization** with constraint satisfaction

## Architecture

### Core Components

1. **Services** (`src/services/people/`)
   - `rateResolver.ts` - Deterministic rate resolution with precedence
   - `fitScore.ts` - FitScore calculation with typed reasons
   - `teamFit.ts` - Team optimization (greedy/Hungarian/ILP)

2. **API Handlers** (`src/api/people/`)
   - `rankHandler.ts` - POST /staffing-requests/:id/rank
   - `assignmentHandler.ts` - POST/PATCH /assignments

3. **Database Schema** (`scripts/migrations/`)
   - `20250909_add_people_core.sql` - Core entities
   - `20250909_add_contracts_billing.sql` - Rates and billing
   - `20250909_add_constraints_triggers.sql` - Views and triggers

## Key Features

### FitScore Calculation
- **Hard Skills**: Weighted min(level/required, 1) × recency boost
- **Soft Skills**: Cosine similarity vs target vector
- **Availability**: 1 - overload_penalty from daily allocations
- **Timezone**: Working hours overlap
- **Domain**: Client/industry history match
- **Reliability**: Person reliability score
- **Continuity**: Existing engagement assignment

### Rate Resolution
Precedence: engagement > client > person > role > org
- Absolute premiums summed first
- Percentage premiums applied after
- Scarcity multiplier (0.8-1.3) from demand/supply
- Currency conversion with FX rates
- Full breakdown audit trail

### Data Integrity
- **Immutable snapshots**: DB triggers prevent rate snapshot updates
- **Multi-tenant**: org_id on all tables with proper indices
- **Audit trail**: All changes logged with before/after values
- **Constraints**: CHECK constraints on enums, ranges, and relationships

## Setup Instructions

1. **Run Migrations**:
   ```bash
   cd /workspaces/flowledger-api/api
   node scripts/run-people-migrations.js
   ```

2. **Seed Initial Data**:
   ```sql
   -- Add sample skills
   INSERT INTO app.skill (org_id, name, type) VALUES
   (1, 'Python', 'hard'),
   (1, 'JavaScript', 'hard'),
   (1, 'Communication', 'soft');

   -- Add sample people
   INSERT INTO app.person (org_id, name, level, timezone) VALUES
   (1, 'Alice Johnson', 'L3', 'America/New_York'),
   (1, 'Bob Smith', 'L4', 'Europe/London');
   ```

3. **Test API Endpoints**:
   ```bash
   # Rank people for a request
   curl -X POST "http://localhost:4001/staffing-requests/1/rank?org_id=1"

   # Create assignment with snapshot
   curl -X POST "http://localhost:4001/assignments" \
     -H "Content-Type: application/json" \
     -d '{
       "org_id": 1,
       "person_id": 1,
       "engagement_id": 1,
       "role_template_id": 1,
       "start_date": "2025-10-01",
       "end_date": "2025-12-31"
     }'
   ```

## API Endpoints

### Staffing Requests
- `POST /staffing-requests/:id/rank` - Rank candidates with FitScore and reasons
- `POST /staffing-requests` - Create new request
- `PATCH /staffing-requests/:id` - Update request

### Assignments
- `POST /assignments` - Create with rate snapshot
- `PATCH /assignments/:id` - Update (non-snapshot fields only)
- `DELETE /assignments/:id` - Cancel assignment

### People
- `GET /people` - Filter by skills, availability, etc.
- `GET /people/:id` - Person details with skills history

### Rates
- `GET /rates/preview` - Resolve effective rate with breakdown

## Performance Targets

- **Rank endpoint**: p95 < 300ms for 5k people
- **Rate resolution**: < 50ms per call
- **Team optimization**: < 1000ms for greedy mode

## Monitoring & Alerts

- Over-allocation detection (runs every 5 minutes)
- Cert expiry warnings (60 days out)
- Unfilled requests (T-7 days)
- Utilization reports (weekly)

## Future Enhancements

- **Hungarian algorithm** for optimal team assignment
- **ILP solver** for complex constraint optimization
- **Calendar integration** for availability sync
- **Machine learning** for improved FitScore predictions
- **Real-time notifications** via WebSocket

## Testing

Run the test suite:
```bash
npm test -- --grep "People"
```

Key test cases:
- Snapshot immutability enforcement
- FitScore monotonicity (higher skill never lowers score)
- Rate precedence correctness
- Over-allocation detection accuracy
