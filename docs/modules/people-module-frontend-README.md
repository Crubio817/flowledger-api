# People Module Frontend Specification

This document provides the complete frontend specification for the People Module, including API endpoints, component designs, and implementation guidelines.

## Overview

The People module provides a comprehensive staffing and resource management system with explainable AI recommendations, immutable rate snapshots, and real-time availability tracking.

## Quick Start

### Prerequisites
- Node.js 18+
- React 18+ with TypeScript
- Access to People Module API

### Installation
```bash
npm install @flowledger/people-api-client
```

### Basic Usage
```typescript
import { PeopleApiClient } from '@flowledger/people-api-client';

const client = new PeopleApiClient({
  baseUrl: 'https://api.flowledger.com',
  apiKey: 'your-api-key'
});

// Rank candidates for a staffing request
const rankings = await client.rankCandidates(requestId, {
  includeRatePreview: true,
  limit: 20
});
```

## Core Components

### CandidateRankingTable
Interactive table showing ranked candidates with FitScore explanations.

```typescript
interface CandidateRankingTableProps {
  requestId: number;
  onSelectCandidate: (personId: number) => void;
  filters?: CandidateFilters;
}
```

### RateBreakdownModal
Hierarchical display of rate components with explanations.

```typescript
interface RateBreakdownModalProps {
  rate: RateBreakdown;
  isOpen: boolean;
  onClose: () => void;
}
```

### AvailabilityHeatmap
Weekly calendar view of person availability.

```typescript
interface AvailabilityHeatmapProps {
  personId: number;
  startDate: string;
  endDate: string;
}
```

## API Integration

### Authentication
All API calls require JWT authentication with organization context.

### Error Handling
Standard HTTP status codes with detailed error messages.

### Real-time Updates
WebSocket integration for live availability and assignment updates.

## Performance

- **Candidate Ranking**: <300ms for 5k candidates
- **Rate Resolution**: <50ms per preview
- **Availability Check**: <100ms per person
- **Real-time Updates**: <5 seconds latency

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### E2E Tests
```bash
npm run test:e2e
```

## Deployment

### Build
```bash
npm run build
```

### Preview
```bash
npm run preview
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

Proprietary software. All rights reserved.

---

**Version**: 1.0.0  
**Last Updated**: September 8, 2025  
**Compatibility**: People Module API v1.0
