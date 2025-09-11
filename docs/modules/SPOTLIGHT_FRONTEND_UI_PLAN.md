# FlowLedger Spotlight System Frontend UI Plan

## Overview
This document outlines the frontend implementation plan for integrating the FlowLedger Spotlight System into the user interface. The spotlight system manages Ideal Customer Profiles (ICPs) for lead qualification and integrates with the Workstream Module's signal evaluation process.

## 1. Spotlight Profile Builder Component

### 1.1 Core Spotlight Builder UI
```typescript
interface SpotlightProfile {
  spotlight_id: number;
  org_id: number;
  name: string;
  domain: string;
  description?: string;
  active: boolean;
  fields: SpotlightField[];
  created_at: Date;
}

interface SpotlightField {
  field_id: number;
  field_name: string;
  field_type: 'text' | 'number' | 'boolean' | 'enum' | 'date';
  is_required: boolean;
  display_order: number;
  enum_values?: string[];
  value?: any;
  rules?: SpotlightRule[];
}

interface SpotlightRule {
  rule_id: number;
  condition_field_id: number;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';
  condition_value: string;
}
```

### 1.2 Spotlight Builder Visual Design
- **Builder Container**: Multi-step wizard or tabbed interface
- **Profile Header**: Name, domain, description fields
- **Field Manager**: Dynamic field addition/removal with drag-and-drop ordering
- **Rule Builder**: Conditional logic interface for field visibility
- **Preview Panel**: Live preview of the profile form

### 1.3 Field Type Components
- **Text Field** (📝): Single-line input with validation
- **Number Field** (🔢): Numeric input with min/max
- **Boolean Field** (✅): Checkbox or toggle
- **Enum Field** (📋): Dropdown or radio buttons
- **Date Field** (📅): Date picker with format options

## 2. Entity Integration Points

### 2.1 Signals Module
**Location**: Signal detail view with evaluation sidebar

**Implementation**:
```typescript
// components/signals/SignalDetailView.tsx
const SignalDetailView = ({ signalId }: { signalId: number }) => {
  const { data: signal } = useSignalDetail(signalId);
  const { data: evaluations } = useSpotlightEvaluations(signalId);

  return (
    <div className="signal-detail-layout">
      <main className="signal-main-content">
        {/* Existing signal form and details */}
      </main>
      <aside className="signal-sidebar">
        <SpotlightEvaluationPanel 
          signal={signal}
          evaluations={evaluations}
          onEvaluate={(spotlightId) => evaluateSignal(signalId, spotlightId)}
        />
      </aside>
    </div>
  );
};
```

**Evaluation Triggers**:
- Signal creation → Automatic evaluation against active spotlights
- Manual evaluation → User-triggered assessment
- Profile updates → Re-evaluation of existing signals

### 2.2 Candidates Module
**Location**: Candidate creation/edit form with spotlight matching

**Implementation**:
```typescript
// components/candidates/CandidateForm.tsx
const CandidateForm = ({ candidateId }: { candidateId?: number }) => {
  const { data: candidate } = useCandidateDetail(candidateId);
  const { data: spotlights } = useActiveSpotlights();
  const [selectedSpotlight, setSelectedSpotlight] = useState<number | null>(null);

  return (
    <div className="candidate-form">
      <form>
        {/* Existing candidate fields */}
        <SpotlightSelector 
          spotlights={spotlights}
          selectedId={selectedSpotlight}
          onSelect={setSelectedSpotlight}
        />
        {selectedSpotlight && (
          <SpotlightFieldMapper 
            spotlightId={selectedSpotlight}
            candidateData={candidate}
            onMappingChange={handleMappingChange}
          />
        )}
      </form>
    </div>
  );
};
```

**Matching Triggers**:
- Candidate creation → Spotlight-based field suggestions
- Profile updates → Validation against spotlight criteria
- Pursuit promotion → Spotlight compliance checking

### 2.3 Clients Module
**Location**: Client profile with spotlight association

**Implementation**:
```typescript
// components/clients/ClientProfile.tsx
const ClientProfile = ({ clientId }: { clientId: number }) => {
  const { data: client } = useClientDetail(clientId);
  const { data: matchedSpotlights } = useClientSpotlightMatches(clientId);

  return (
    <div className="client-profile">
      <section className="client-details">
        {/* Existing client information */}
      </section>
      <section className="client-spotlights">
        <h3>Matching Profiles</h3>
        <SpotlightMatchList 
          matches={matchedSpotlights}
          onAssociate={(spotlightId) => associateSpotlight(clientId, spotlightId)}
        />
      </section>
    </div>
  );
};
```

**Association Triggers**:
- Client creation → Automatic spotlight matching
- Profile updates → Re-evaluation of matches
- Manual association → User-selected profile linking

## 3. Global Spotlight Components

### 3.1 Spotlight Directory
**Location**: Dedicated page or global navigation section

```typescript
// components/spotlight/SpotlightDirectory.tsx
const SpotlightDirectory = () => {
  const [filters, setFilters] = useState({
    domain: 'all',
    active: true,
    search: ''
  });
  const { data: spotlights } = useSpotlightDirectory(filters);

  return (
    <div className="spotlight-directory">
      <DirectoryHeader 
        filters={filters}
        onFilterChange={setFilters}
        onCreateNew={() => navigate('/spotlights/new')}
      />
      <SpotlightGrid 
        spotlights={spotlights}
        onEdit={(id) => navigate(`/spotlights/${id}/edit`)}
        onClone={(id) => cloneSpotlight(id)}
        onToggleActive={(id, active) => toggleSpotlightActive(id, active)}
      />
    </div>
  );
};
```

### 3.2 Spotlight Analytics Dashboard
**Location**: Analytics section showing profile performance

```typescript
// components/spotlight/SpotlightAnalytics.tsx
const SpotlightAnalytics = () => {
  const { data: analytics } = useSpotlightAnalytics();

  return (
    <div className="spotlight-analytics">
      <MetricCards metrics={analytics.overview} />
      <MatchRateChart data={analytics.matchRates} />
      <TopPerformingProfiles data={analytics.topProfiles} />
      <ConversionFunnel data={analytics.conversions} />
    </div>
  );
};
```

## 4. API Integration Layer

### 4.1 React Query Hooks
```typescript
// hooks/useSpotlight.ts
export const useSpotlights = (filters: SpotlightFilters) => {
  return useQuery({
    queryKey: ['spotlights', filters],
    queryFn: () => spotlightApi.getSpotlights(filters),
    staleTime: 5 * 60 * 1000,
  });
};

export const useSpotlightEvaluation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: spotlightApi.evaluateSignal,
    onSuccess: (data) => {
      queryClient.invalidateQueries(['signals', 'evaluations']);
    },
  });
};
```

### 4.2 Spotlight API Client
```typescript
// api/spotlightApi.ts
export const spotlightApi = {
  getSpotlights: async (filters: SpotlightFilters): Promise<SpotlightListResponse> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, String(value));
    });
    
    const response = await fetch(`/api/spotlights?${params}`);
    return response.json();
  },
  
  createSpotlight: async (spotlight: CreateSpotlightRequest): Promise<SpotlightProfile> => {
    const response = await fetch('/api/spotlights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spotlight),
    });
    return response.json();
  },
  
  evaluateSignal: async (signalId: number, spotlightId: number): Promise<EvaluationResult> => {
    const response = await fetch(`/api/spotlights/${spotlightId}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal_id: signalId }),
    });
    return response.json();
  },
  
  cloneSpotlight: async (spotlightId: number, name: string): Promise<SpotlightProfile> => {
    const response = await fetch(`/api/spotlights/${spotlightId}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return response.json();
  },
};
```

## 5. User Experience Features

### 5.1 Dynamic Form Generation
- Auto-generated forms based on spotlight field definitions
- Conditional field visibility using spotlight rules
- Real-time validation and error feedback

### 5.2 Smart Matching and Suggestions
- AI-powered field value suggestions
- Historical data analysis for profile optimization
- Automated profile updates based on successful conversions

### 5.3 Evaluation and Scoring
- Real-time signal evaluation against multiple profiles
- Weighted scoring based on field importance
- Match confidence indicators and explanations

## 6. Implementation Phases

### Phase 1: Core Spotlight Builder (Week 1-2)
- Basic profile creation and field management
- Integration with signals for evaluation
- API connection and error handling

### Phase 2: Advanced Features (Week 3-4)
- Conditional rules and dynamic forms
- Profile cloning and templating
- Analytics dashboard implementation

### Phase 3: Integration and Optimization (Week 5-6)
- Full Workstream integration
- Performance optimization
- Mobile responsiveness and accessibility

### Phase 4: AI Enhancements (Week 7-8)
- Smart suggestions and auto-completion
- Predictive matching algorithms
- Advanced analytics and reporting

## 7. Success Metrics

### Adoption Metrics
- Number of active spotlight profiles per organization
- Frequency of profile usage in signal evaluation
- Profile creation and update rates

### Performance Metrics
- Average evaluation time per signal
- Match accuracy rates
- User engagement with spotlight features

### Business Impact
- Improved lead qualification accuracy
- Faster signal-to-candidate conversion
- Higher pursuit success rates for matched profiles

## 8. Technical Architecture

### State Management
- React Query for server state management
- Zustand for complex form state
- Local storage for user preferences and drafts

### Performance Considerations
- Lazy loading of spotlight data
- Debounced search and filtering
- Optimistic updates for better UX

### Accessibility
- Keyboard navigation for all components
- Screen reader support for dynamic content
- High contrast mode compatibility

---

This plan provides a comprehensive roadmap for integrating the Spotlight System into the FlowLedger frontend, enabling organizations to effectively manage and utilize Ideal Customer Profiles for enhanced lead qualification and sales optimization.</content>
<parameter name="filePath">/workspaces/flowledger-api/SPOTLIGHT_FRONTEND_UI_PLAN.md
