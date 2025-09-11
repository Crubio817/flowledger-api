# FlowLedger Memory Layer Frontend UI Plan

## Overview
This document outlines the frontend implementation plan for integrating the FlowLedger Memory Layer into the user interface. The memory layer captures institutional knowledge across all FlowLedger entities and presents it as contextual insights to users.

## 1. Memory Card Component

### 1.1 Core Memory Card UI
```typescript
interface MemoryCard {
  atoms: MemoryAtom[];
  entityType: string;
  entityId: number;
  lastUpdated: Date;
  relevanceScore?: number;
}

interface MemoryAtom {
  id: number;
  atomType: 'decision' | 'risk' | 'preference' | 'status' | 'note';
  content: string;
  source: {
    system: string;
    originId: string;
    url?: string;
  };
  tags: string[];
  createdAt: Date;
  isRedacted: boolean;
}
```

### 1.2 Memory Card Visual Design
- **Card Container**: Floating panel or embedded section with soft shadows
- **Header**: Entity context, last updated timestamp, relevance indicator
- **Content**: Chronological list of memory atoms with type-specific icons
- **Footer**: Quick actions (add note, mark sensitive, export)

### 1.3 Memory Atom Types & Styling
- **Decision** (🎯): Blue accent, high importance
- **Risk** (⚠️): Orange/red accent, warning styling
- **Preference** (❤️): Green accent, positive styling
- **Status** (📊): Gray accent, neutral styling
- **Note** (📝): Purple accent, annotation styling

## 2. Entity Integration Points

### 2.1 Candidates Module
**Location**: Right sidebar in candidate detail view

**Implementation**:
```typescript
// components/candidates/CandidateDetailView.tsx
const CandidateDetailView = ({ candidateId }: { candidateId: number }) => {
  const { data: candidate } = useCandidateDetail(candidateId);
  const { data: memoryCard } = useMemoryCard('candidate', candidateId);

  return (
    <div className="candidate-detail-layout">
      <main className="candidate-main-content">
        {/* Existing candidate form and details */}
      </main>
      <aside className="candidate-sidebar">
        <MemoryCardWidget 
          card={memoryCard}
          onAddNote={(content) => addMemoryNote('candidate', candidateId, content)}
        />
      </aside>
    </div>
  );
};
```

**Memory Triggers**:
- Candidate creation → "New candidate profile created"
- Status changes → "Status changed from X to Y"
- Notes added → User-generated insights

### 2.2 Engagements Module
**Location**: Tabbed interface with "Memory" tab alongside Features/Milestones

**Implementation**:
```typescript
// components/engagements/EngagementTabs.tsx
const EngagementTabs = ({ engagementId }: { engagementId: number }) => {
  const [activeTab, setActiveTab] = useState('overview');
  
  return (
    <TabContainer>
      <TabList>
        <Tab id="overview">Overview</Tab>
        <Tab id="features">Features</Tab>
        <Tab id="milestones">Milestones</Tab>
        <Tab id="memory">Memory</Tab>
      </TabList>
      <TabPanels>
        {/* Other tab panels */}
        <TabPanel id="memory">
          <EngagementMemoryView engagementId={engagementId} />
        </TabPanel>
      </TabPanels>
    </TabContainer>
  );
};
```

**Memory Triggers**:
- Engagement creation → "Project engagement started"
- Phase transitions → "Moved to phase X"
- Change requests → "Change request submitted"

### 2.3 Communications Module
**Location**: Thread sidebar showing conversation context and insights

**Implementation**:
```typescript
// components/comms/CommThreadView.tsx
const CommThreadView = ({ threadId }: { threadId: number }) => {
  const { data: thread } = useCommThread(threadId);
  const { data: memoryCard } = useMemoryCard('comms_thread', threadId);

  return (
    <div className="comm-thread-layout">
      <main className="message-list">
        {/* Message components */}
      </main>
      <aside className="thread-insights">
        <h3>Conversation Context</h3>
        <MemoryCardWidget 
          card={memoryCard}
          compact={true}
          onCapture={(content, type) => captureCommInsight(threadId, content, type)}
        />
      </aside>
    </div>
  );
};
```

**Memory Triggers**:
- Thread creation → "Communication thread started"
- Important decisions → User-marked insights
- Client preferences → Extracted preferences

### 2.4 Clients Module
**Location**: Client overview dashboard with memory summary section

**Implementation**:
```typescript
// components/clients/ClientDashboard.tsx
const ClientDashboard = ({ clientId }: { clientId: number }) => {
  const { data: client } = useClientDetail(clientId);
  const { data: memoryCard } = useMemoryCard('client', clientId);

  return (
    <div className="client-dashboard">
      <section className="client-overview">
        {/* Client details */}
      </section>
      <section className="client-insights">
        <h2>Institutional Memory</h2>
        <MemoryCardWidget 
          card={memoryCard}
          expandable={true}
          showTimeline={true}
        />
      </section>
    </div>
  );
};
```

**Memory Triggers**:
- Client creation → "New client relationship established"
- Relationship updates → "Client relationship status changed"
- Preferences → "Client preference noted"

## 3. Global Memory Components

### 3.1 Memory Search Interface
**Location**: Global navigation or dedicated memory dashboard

```typescript
// components/memory/MemorySearch.tsx
const MemorySearch = () => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    entityType: 'all',
    atomType: 'all',
    dateRange: 'all'
  });
  
  const { data: results } = useMemorySearch(query, filters);

  return (
    <div className="memory-search">
      <SearchInput 
        value={query}
        onChange={setQuery}
        placeholder="Search institutional memory..."
      />
      <FilterPanel filters={filters} onChange={setFilters} />
      <ResultsList results={results} />
    </div>
  );
};
```

### 3.2 Memory Timeline View
**Location**: Dedicated page or modal for comprehensive memory browsing

```typescript
// components/memory/MemoryTimeline.tsx
const MemoryTimeline = ({ entityType, entityId }: TimelineProps) => {
  const { data: timeline } = useMemoryTimeline(entityType, entityId);

  return (
    <div className="memory-timeline">
      {timeline.map((period) => (
        <TimelinePeriod key={period.date}>
          <DateHeader date={period.date} />
          {period.atoms.map((atom) => (
            <TimelineAtom key={atom.id} atom={atom} />
          ))}
        </TimelinePeriod>
      ))}
    </div>
  );
};
```

## 4. API Integration Layer

### 4.1 React Query Hooks
```typescript
// hooks/useMemory.ts
export const useMemoryCard = (entityType: string, entityId: number) => {
  return useQuery({
    queryKey: ['memory', 'card', entityType, entityId],
    queryFn: () => memoryApi.getCard(entityType, entityId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useAddMemoryAtom = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: memoryApi.addAtom,
    onSuccess: (data) => {
      queryClient.invalidateQueries(['memory', 'card']);
    },
  });
};
```

### 4.2 Memory API Client
```typescript
// api/memoryApi.ts
export const memoryApi = {
  getCard: async (entityType: string, entityId: number): Promise<MemoryCard> => {
    const response = await fetch(`/api/memory/card?entity_type=${entityType}&entity_id=${entityId}`);
    return response.json();
  },
  
  addAtom: async (atom: CreateMemoryAtom): Promise<MemoryAtom> => {
    const response = await fetch('/api/memory/atoms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(atom),
    });
    return response.json();
  },
  
  redactAtom: async (atomId: number, reason: string): Promise<void> => {
    await fetch('/api/memory/redactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atom_id: atomId, reason }),
    });
  },
};
```

## 5. User Experience Features

### 5.1 Contextual Memory Suggestions
- Show relevant memory atoms when viewing related entities
- Highlight important decisions when status changes occur
- Surface historical patterns and preferences

### 5.2 Memory Capture Workflows
- **Quick Note**: Floating action button for immediate memory capture
- **Smart Suggestions**: AI-powered suggestions for important moments
- **Bulk Import**: Import historical data from notes and documents

### 5.3 Privacy and Security
- **Redaction Interface**: Easy marking of sensitive information
- **Access Controls**: Role-based visibility of memory atoms
- **Audit Trail**: Track who added/modified memory entries

## 6. Implementation Phases

### Phase 1: Core Memory Card Component (Week 1-2)
- Basic MemoryCard component with atom display
- Integration into candidate detail view
- API connection and error handling

### Phase 2: Entity Integration (Week 3-4)
- Engagement, communications, and client integration
- Memory capture workflows
- Timeline view implementation

### Phase 3: Advanced Features (Week 5-6)
- Global memory search
- AI-powered insights and suggestions
- Bulk operations and data management

### Phase 4: Polish and Performance (Week 7-8)
- Performance optimization
- Advanced UX features
- Mobile responsiveness
- Testing and bug fixes

## 7. Success Metrics

### User Adoption
- Memory card view rate per entity
- Active memory capture per user
- Search usage patterns

### Business Impact
- Reduced information loss incidents
- Faster onboarding for new team members
- Improved client relationship continuity

### Technical Performance
- API response times < 200ms
- Memory search results < 500ms
- Real-time updates working correctly

## 8. Technical Architecture

### State Management
- React Query for server state
- Zustand for global UI state
- Local storage for user preferences

### Performance Considerations
- Virtualized lists for large memory timelines
- Debounced search queries
- Optimistic updates for memory capture

### Accessibility
- Keyboard navigation for all memory components
- Screen reader support for memory atoms
- High contrast mode compatibility

---

This plan provides a comprehensive roadmap for integrating the Memory Layer into the FlowLedger frontend, ensuring users can effectively capture, browse, and utilize institutional knowledge across all entities.
