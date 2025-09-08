# People Module API Specification for Frontend Development

## Overview

The People module provides a comprehensive staffing and resource management system with explainable AI recommendations, immutable rate snapshots, and real-time availability tracking.

## Core Concepts

### 1. FitScore
A weighted scoring system that evaluates candidates based on:
- **Hard Skills (35%)**: Level match vs requirements with recency boost
- **Soft Skills (15%)**: Cosine similarity of skill vectors
- **Availability (15%)**: Hours available vs required
- **Timezone (10%)**: Working hours overlap
- **Domain (10%)**: Client/industry experience match
- **Reliability (10%)**: Historical performance score
- **Continuity (5%)**: Existing engagement assignment

### 2. Immutable Rate Snapshots
- Rates are resolved and "snapshotted" when assignments are created
- Prevents financial discrepancies and ensures auditability
- Full breakdown stored: base + premiums + scarcity + overrides

### 3. Multi-Tenant Architecture
- All data scoped by `org_id`
- Field-level access control (Finance roles see cost rates)
- Audit trails for all changes

## API Endpoints

### Staffing Requests

#### POST /staffing-requests/:id/rank
Rank candidates for a staffing request with FitScore and rate preview.

**Request:**
```typescript
GET /staffing-requests/123/rank?org_id=1&limit=20&include_rate_preview=true
```

**Response:**
```typescript
interface RankResponse {
  data: PersonFit[];
  meta: {
    total: number;
    limit: number;
    staffing_request_id: number;
  };
}

interface PersonFit {
  person_id: number;
  fit_score: number; // 0-1 scale
  reasons: FitReason[];
  modeled_rate?: RateBreakdown;
}

interface FitReason {
  code: 'HARD_SKILL_MATCH' | 'SOFT_SKILL_GAP' | 'AVAILABILITY' | 'TZ_OVERLAP' | 'DOMAIN' | 'RELIABILITY' | 'CONTINUITY';
  detail: string;
  contribution: number; // + or - impact on score
  evidence?: any; // Supporting data
}

interface RateBreakdown {
  currency: string;
  base: number;
  abs_premiums: Array<{source: string; amount: number}>;
  pct_premiums: Array<{source: string; percentage: number}>;
  scarcity: number;
  total: number;
  override_source?: string;
}
```

**Frontend Usage:**
```typescript
// React component for candidate ranking
const CandidateList = ({ requestId }: { requestId: number }) => {
  const [candidates, setCandidates] = useState<PersonFit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCandidates = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/staffing-requests/${requestId}/rank?org_id=1&include_rate_preview=true`);
        setCandidates(response.data.data);
      } catch (error) {
        console.error('Failed to fetch candidates:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCandidates();
  }, [requestId]);

  return (
    <div className="candidate-list">
      {candidates.map(candidate => (
        <CandidateCard
          key={candidate.person_id}
          candidate={candidate}
          onSelect={() => handleSelect(candidate)}
        />
      ))}
    </div>
  );
};
```

#### POST /assignments
Create assignment with immutable rate snapshot.

**Request:**
```typescript
POST /assignments
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

**Response:**
```typescript
{
  "data": {
    "assignment_id": 1001,
    "person_id": 123,
    "engagement_id": 456,
    "bill_rate_snapshot": 150.00,
    "cost_rate_snapshot": 120.00,
    "currency": "USD",
    "rate_breakdown": "{\"base\": 125.00, \"premiums\": [...], \"scarcity\": 1.2}",
    "created_at": "2025-09-08T10:30:00Z"
  }
}
```

### People Directory

#### GET /people
Search and filter people by skills, availability, etc.

**Request:**
```typescript
GET /people?org_id=1&skill=python&min_level=3&availability_window=2025-10-01,2025-12-31&limit=50
```

**Response:**
```typescript
interface PeopleResponse {
  data: Person[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

interface Person {
  person_id: number;
  name: string;
  level: string; // L1, L2, L3, L4, L5
  timezone: string;
  reliability_score: number;
  skills: PersonSkill[];
  availability_next_2_weeks: number; // percentage
}

interface PersonSkill {
  skill_id: number;
  name: string;
  level: number; // 1-5
  last_used_at?: string;
  confidence: number; // 0-1
}
```

### Rate Preview

#### GET /rates/preview
Resolve effective rate with full breakdown before assignment.

**Request:**
```typescript
GET /rates/preview?org_id=1&role_template_id=789&level=L3&skills=1,2,3&engagement_id=456&as_of=2025-10-01
```

**Response:**
```typescript
{
  "base_currency": "USD",
  "base_amount": 125.00,
  "premiums": {
    "absolute": [
      { "source": "Python (skill)", "amount": 15.00 },
      { "source": "Seniority (role)", "amount": 10.00 }
    ],
    "percentage": [
      { "source": "Market scarcity", "percentage": 5.0 }
    ]
  },
  "scarcity_multiplier": 1.2,
  "final_amount": 165.00,
  "precedence_applied": "engagement",
  "breakdown": "JSON audit trail"
}
```

## Frontend Components

### 1. Candidate Ranking Table

```typescript
// components/CandidateRanking.tsx
interface CandidateRankingProps {
  requestId: number;
  onSelectCandidate: (personId: number) => void;
}

const CandidateRanking: React.FC<CandidateRankingProps> = ({ requestId, onSelectCandidate }) => {
  const [candidates, setCandidates] = useState<PersonFit[]>([]);
  const [sortBy, setSortBy] = useState<'fit_score' | 'rate'>('fit_score');

  // Fetch and display candidates with FitScore explanations
  // Show expandable reasons panel
  // Highlight top matches
};
```

### 2. Rate Breakdown Modal

```typescript
// components/RateBreakdownModal.tsx
interface RateBreakdownModalProps {
  rate: RateBreakdown;
  isOpen: boolean;
  onClose: () => void;
}

const RateBreakdownModal: React.FC<RateBreakdownModalProps> = ({ rate, isOpen, onClose }) => {
  // Display hierarchical breakdown:
  // Base Rate: $125
  // + Python Premium: $15
  // + Seniority Premium: $10
  // × Scarcity (1.2): $150 × 1.2 = $180
  // Total: $180
};
```

### 3. Availability Heatmap

```typescript
// components/AvailabilityHeatmap.tsx
interface AvailabilityHeatmapProps {
  personId: number;
  startDate: string;
  endDate: string;
}

const AvailabilityHeatmap: React.FC<AvailabilityHeatmapProps> = ({ personId, startDate, endDate }) => {
  // Display weekly calendar grid
  // Color-code: green=available, yellow=partial, red=overallocated
  // Show conflicts with existing assignments
};
```

### 4. Skills Proficiency Chart

```typescript
// components/SkillsChart.tsx
interface SkillsChartProps {
  personId: number;
}

const SkillsChart: React.FC<SkillsChartProps> = ({ personId }) => {
  // Radar chart showing skill levels
  // Color-code by recency (green=recent, yellow=old, red=stale)
  // Show confidence scores as opacity
};
```

## Real-time Updates

### WebSocket Events

```typescript
// Connection management
const wsClient = new WebSocketClient();
wsClient.connect(userId, orgId);

// Listen for updates
wsClient.on('assignment.created', (data) => {
  // Refresh availability data
  refreshAvailability(data.person_id);
});

wsClient.on('staffing_request.updated', (data) => {
  // Refresh candidate rankings
  refreshRankings(data.request_id);
});
```

## Error Handling

### Common Error Codes

```typescript
enum PeopleApiError {
  INVALID_REQUEST = 'INVALID_REQUEST',
  PERSON_NOT_FOUND = 'PERSON_NOT_FOUND',
  SKILL_NOT_FOUND = 'SKILL_NOT_FOUND',
  RATE_RESOLUTION_FAILED = 'RATE_RESOLUTION_FAILED',
  AVAILABILITY_CONFLICT = 'AVAILABILITY_CONFLICT',
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED'
}

interface ApiError {
  code: PeopleApiError;
  message: string;
  details?: any;
}
```

## Performance Targets

- **Candidate Ranking**: <300ms for 5k people
- **Rate Resolution**: <50ms per call
- **Availability Check**: <100ms per person
- **Real-time Updates**: <5 seconds latency

## Testing Strategy

### Unit Tests
```typescript
describe('FitScore Calculator', () => {
  test('higher skill level never lowers score', () => {
    const score1 = calculateFitScore({ skills: [{ id: 1, level: 3 }] });
    const score2 = calculateFitScore({ skills: [{ id: 1, level: 4 }] });
    expect(score2.total).toBeGreaterThanOrEqual(score1.total);
  });

  test('snapshot immutability enforced', () => {
    expect(() => updateSnapshot(assignmentId)).toThrow('immutable');
  });
});
```

### Integration Tests
- End-to-end assignment creation with rate snapshot
- Multi-user concurrent ranking requests
- Availability conflict detection

## Deployment Checklist

- [ ] Database migrations applied
- [ ] Rate resolver seeded with base rates
- [ ] Skills taxonomy populated
- [ ] Sample people data loaded
- [ ] WebSocket server configured
- [ ] API endpoints documented
- [ ] Frontend components implemented
- [ ] Performance benchmarks met
- [ ] Security audit completed

## Support & Maintenance

### Monitoring
- Track FitScore accuracy vs actual performance
- Monitor rate prediction error rates
- Alert on over-allocation conflicts
- Track API response times

### Data Quality
- Regular skill level validation
- Availability calendar accuracy checks
- Rate override audit reviews

This specification provides everything needed to build a comprehensive frontend for the People module. The API is designed for performance, explainability, and real-time collaboration.
