# Module Documentation Guide

## Overview

This guide provides a comprehensive template for documenting modules in the FlowLedger project. It establishes standards for documentation structure, content requirements, and best practices based on the workstream module documentation approach, including **Memory Layer Philosophy** documentation patterns.

## Documentation Structure

Each module should have its own folder under `/docs/modules/` with the following structure:

```
docs/modules/{module-name}/
├── README.md                 # Main navigation and overview with Memory Philosophy
├── overview.md              # High-level module description
├── database-schema.md       # Complete database schema
├── api-reference.md         # REST API documentation
├── backend-implementation.md # Technical implementation details
├── memory-integration.md    # Memory Layer integration (if applicable)
├── {specific-feature}.md    # Feature-specific documentation
└── frontend-integration.md  # Frontend integration (if applicable)
```

## Memory Layer Philosophy Documentation

### When to Include Memory Philosophy

Memory Layer Philosophy sections should be included when:
- Module captures business context and decisions
- System learns from user interactions
- Historical patterns inform future decisions
- Institutional knowledge is preserved
- Context drives better outcomes

### Memory Philosophy Template

```markdown
## 📖 Memory Layer Philosophy

### From {Current State} to {Enhanced State}

{Explain the evolution and improvement that memory brings}

#### The {Domain-Specific} Problem

Every {domain} organization faces the challenge:
- **Critical context lives in people's heads** and walks out the door when they leave
- **Important decisions get buried** in {domain-specific storage locations}
- **Lessons learned** from {domain failures} rarely prevent future mistakes
- **{Domain preferences/patterns}** get rediscovered painfully in every new interaction

#### Our Memory Solution

The Memory Layer solves this by treating **every {domain} action as a learning opportunity**:

```
{Domain} Action → Contextual Atom → Institutional Knowledge → Better Decisions
```

**Example Flow:**
1. {User action example}
2. System captures {specific context}
3. Memory atom created with {relevance/scoring}
4. Future {similar situations} automatically surface this {pattern/knowledge}
5. Team {proactive improvement}

#### Why This Matters

**Traditional Approach:**
- {User} {performs action} → {manual knowledge capture} → Knowledge stays with individual
- {New user} takes over → Repeats same mistake
- Organization learns nothing → Pattern continues

**Memory Layer Approach:**  
- {User} {performs action} → System captures {context} → Knowledge becomes organizational asset
- Memory surfaces {patterns} → Team adapts {approach} proactively
- Organization gets smarter → {Outcomes} improve over time

### Core Memory Philosophy

#### 1. **Capture Everything, Surface Smartly**
The system captures all {domain} context automatically but uses intelligent scoring to surface what matters most for {domain decisions}.

#### 2. **Context Over Data**
Raw data tells you what happened. Memory tells you **why it happened** and **what to do next** in {domain context}.

#### 3. **Learning Organization**
Each successful {domain pattern} gets reinforced. Each {domain failure} becomes institutional wisdom specific to {domain challenges}.

#### 4. **Privacy-First Intelligence**
Full governance capabilities ensure sensitive {domain information} can be redacted or corrected without losing the learning value of the {domain interaction} patterns.
```

### Memory Integration Documentation

When documenting memory integration, include:

#### Automatic Memory Capture
```markdown
### Memory Capture Patterns

#### {Entity} Memory Events
- **Creation**: `{entity}Memory.created(orgId, entityId, context)`
- **State Changes**: `{entity}Memory.stateChanged(orgId, entityId, from, to)`
- **Decisions**: `{entity}Memory.decision(orgId, entityId, decision, context)`
- **Preferences**: `{entity}Memory.preference(orgId, entityId, preference)`

#### Example Integration
```typescript
// Automatic memory capture in {entity} operations
router.post('/{entities}', asyncHandler(async (req, res) => {
  // ... business logic ...
  
  // Memory capture
  await {entity}Memory.created(orgId, created.{entity}_id, created.name);
  
  ok(res, created, 201);
}));
```

#### Memory-Enhanced Decision Making
```markdown
### Context-Aware Operations

#### Memory Card Integration
```typescript
// Get memory context for decision making
const memoryCard = await fetch(`/api/memory/card?org_id=${orgId}&entity_type=${entityType}&entity_id=${entityId}`);
const context = memoryCard.data;

// Use context to inform decisions
if (context.summary.key_facts.includes('prefers_morning_meetings')) {
  // Schedule for morning
}
```

#### Pattern Recognition
- Historical success patterns automatically surface
- Risk factors from past {domain events} highlighted
- Client/user preferences preserved and suggested
- Decision rationale captured for future reference
```

## 1. README.md - Main Navigation

### Required Sections

#### Overview
- Module purpose and business value
- Key features and capabilities
- Architecture diagram (ASCII art)
- Integration points with other modules

#### Documentation Structure
- Links to all documentation files
- Brief description of each document's purpose
- Reading order recommendations

#### Quick Start
- Prerequisites and dependencies
- Basic setup instructions
- Simple usage examples
- Health check endpoints

#### Key Features
- Core functionality highlights
- Unique selling points
- Integration capabilities

#### State Machines
- Entity lifecycles
- State transition diagrams
- Business rules and constraints

#### Integration Points
- Dependencies on other modules
- APIs consumed
- Events published/subscribed
- Shared database tables

#### Development
- Local setup instructions
- Testing procedures
- Code organization
- Deployment checklist

#### Troubleshooting
- Common issues and solutions
- Debug commands
- Monitoring and logging
- Support resources

#### Changelog
- Version history
- Feature additions
- Breaking changes
- Migration notes

### Template

```markdown
# {Module Name} Documentation

## Overview
{Module purpose, 2-3 sentences}

## Architecture
```
{Module Name}
├── {Core Entity 1} → {Core Entity 2} → {Core Entity 3}
├── {Key Feature 1}
├── {Key Feature 2}
└── {Integration Point}
```

## Key Features
- **{Feature 1}**: {Description}
- **{Feature 2}**: {Description}
- **{Feature 3}**: {Description}

## Documentation Structure
### [Overview](./overview.md)
{Description of overview document}

### [Database Schema](./database-schema.md)
{Description of database document}

### [API Reference](./api-reference.md)
{Description of API document}

### [Backend Implementation](./backend-implementation.md)
{Description of backend document}

## Quick Start
### Prerequisites
- {Dependency 1}
- {Dependency 2}

### Basic Usage
```http
GET /{module}/stats?org_id=1
```

## State Machines
### {Entity} Lifecycle
```
{state1} → {state2} → {state3}
```

## Integration Points
- **{Other Module}**: {Integration description}
- **{External System}**: {Integration description}

## Development
### Local Setup
```bash
# Setup commands
```

### Testing
```bash
# Test commands
```

## Troubleshooting
### Common Issues
**{Issue}**: {Solution}

## Changelog
### v{version} ({date})
- ✅ {Feature implemented}
- ✅ {Improvement made}
```

## 2. Overview.md - High-Level Description

### Required Content

#### Business Context
- Problem the module solves
- Target users and use cases
- Business value and ROI

#### Technical Overview
- Architecture and design principles
- Key technologies and frameworks
- Performance characteristics
- Scalability considerations

#### Recent Improvements
- Latest features and enhancements
- Performance optimizations
- Bug fixes and stability improvements

#### Module Highlights
- Unique features
- Competitive advantages
- Integration capabilities

#### Monitoring & Observability
- Health check endpoints
- Key metrics and KPIs
- Logging and alerting
- Error handling patterns

### Template

```markdown
# {Module Name} Overview

## Business Context
{Explain the business problem and solution}

## Technical Overview
{Architecture, technologies, performance}

## Recent Improvements ({Version})
- ✅ {Improvement 1}
- ✅ {Improvement 2}
- ✅ {Improvement 3}

## Module Highlights
- **{Highlight 1}**: {Description}
- **{Highlight 2}**: {Description}

## Monitoring & Observability

### Health Checks
```
GET /healthz     -- Basic liveness check
GET /api/health  -- API health with database connectivity
```

### Logging
- {Log type 1}: {Purpose}
- {Log type 2}: {Purpose}

### Error Handling
- {Error pattern 1}: {Handling approach}
- {Error pattern 2}: {Handling approach}
```

## 3. Database-Schema.md - Database Documentation

### Required Sections

#### Overview
- Module's data model purpose
- Key entities and relationships
- Multi-tenancy approach

#### Core Tables
For each table, document:
- Purpose and business logic
- Column definitions with types and constraints
- Indexes and performance considerations
- Relationships and foreign keys
- Usage patterns and access patterns

#### Supporting Tables
- Lookup tables
- Junction tables
- Audit and history tables
- Configuration tables

#### Views
- Computed data views
- Aggregation views
- Security and filtering views

#### Migration Scripts
- Schema creation scripts
- Data migration scripts
- Index optimization scripts

### Table Documentation Template

```markdown
### {Table Name} (`app.{table_name}`)

{Single sentence describing the table's purpose}

| Column | Type | Description |
|--------|------|-------------|
| `{column_name}` | `{data_type}` | {Description} |
| `{column_name}` | `{data_type}` | {Description} |

**Indexes:**
- `{index_name}` ({columns}) - {Purpose}
- `{index_name}` ({columns}) - {Purpose}

**Constraints:**
- `{constraint_name}` - {Description}
- `{constraint_name}` - {Description}

**Relationships:**
- FK to `{referenced_table}` - {Relationship description}
```

## 4. API-Reference.md - API Documentation

### Required Sections

#### Base URL and Authentication
- API endpoints base path
- Authentication requirements
- Common headers and parameters

#### Endpoints
For each endpoint:
- HTTP method and path
- Purpose and use case
- Query/path parameters
- Request body schema
- Response format
- Error responses
- Example requests/responses

#### State Machines
- Entity state transitions
- Business rules
- Validation logic

#### Quality Gates
- Required conditions for operations
- Validation rules
- Business constraints

#### Memory Integration Endpoints (if applicable)
- Memory card retrieval
- Manual memory atom creation
- Memory redaction and correction
- Context-aware endpoint behavior

#### Integration Endpoints
- Webhook endpoints
- External API integrations
- Third-party service connections

### Memory Integration API Template

```markdown
## Memory Integration Endpoints

### Get Memory Card
Retrieve contextual memory for any {module} entity.

```http
GET /api/memory/card?org_id={org_id}&entity_type={entity_type}&entity_id={entity_id}
```

**Parameters:**
- `org_id` (required): Organization identifier
- `entity_type` (required): Entity type (`{entity1}`, `{entity2}`, `{entity3}`)
- `entity_id` (required): Entity identifier

**Response:**
```json
{
  "status": "ok",
  "data": {
    "summary": {
      "key_facts": ["{domain-specific facts}"],
      "recent_activity": ["{domain-specific activities}"],
      "decisions": ["{domain-specific decisions}"]
    },
    "top_atoms": [
      {
        "atom_type": "decision",
        "content": "{domain-specific decision}",
        "occurred_at": "2025-09-09T15:30:00Z",
        "source_url": "/{module}/123",
        "score": 100
      }
    ],
    "last_built_at": "2025-09-09T15:35:00Z",
    "etag": "W/\"1-1725897300000\"",
    "empty": false
  }
}
```

### Memory-Enhanced Operations

All {module} actions automatically create relevant memory atoms:

### {Entity} Actions
```typescript
// Automatic memory capture
POST /{module}/{entities} → {entity}Memory.created()
PUT /{module}/{entities}/{id} → {entity}Memory.{action}()
```

### Memory Query Examples

```bash
# Get context for {domain} decision
curl -H "Authorization: Bearer $TOKEN" \
  "/api/memory/card?org_id=1&entity_type={entity}&entity_id=123"

# Create custom memory atom
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_type":"{entity}","entity_id":456,"atom_type":"preference","content":"{domain-specific preference}","source":{"system":"app","origin_id":"{entity}:456:{action}","url":"/{module}/{entities}/456"}}' \
  "/api/memory/atoms?org_id=1"
```
```

### Endpoint Documentation Template

```markdown
#### {HTTP_METHOD} /{endpoint}
{Purpose description}

**Query Parameters:**
- `{param}` ({type}, {required}): {Description}
- `{param}` ({type}, {required}): {Description}

**Request Body:**
```json
{
  "{field}": "{type}",
  "{field}": "{type}"
}
```

**Response:**
```json
{
  "data": [{...}],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100
  }
}
```

**Error Responses:**
- `400` - Bad Request: {Condition}
- `404` - Not Found: {Condition}
- `409` - Conflict: {Condition}
```

## 5. Backend-Implementation.md - Technical Details

### Required Sections

#### File Structure
- Source code organization
- Key files and their purposes
- Import/export patterns

#### Route Handlers
- Handler patterns and conventions
- Middleware usage
- Error handling approaches
- Validation strategies

#### Business Logic
- Service layer organization
- Domain models and entities
- Business rules implementation
- State management

#### Memory Integration
- Memory helper usage patterns
- Automatic context capture
- Event-driven memory processing
- Memory-informed decision logic

#### Database Operations
- Query patterns and optimization
- Transaction management
- Connection pooling
- Migration handling

#### Workers and Background Processing
- Worker architecture
- Queue management
- Retry and error handling
- Monitoring and alerting

#### State Guards
- State machine implementation
- Transition validation
- Business rule enforcement
- Error handling

#### Testing
- Unit test patterns
- Integration test setup
- Test data management
- CI/CD integration

### Memory Integration Implementation Templates

#### Route Handler with Memory
```typescript
import { {entity}Memory } from '../utils/memory';

router.post('/{entities}', asyncHandler(async (req, res) => {
  const { org_id, ...data } = req.body;
  if (!org_id) return badRequest(res, 'org_id required');

  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, org_id)
    // ... other inputs
    .query(`
      INSERT INTO app.{entity} (org_id, ...)
      OUTPUT INSERTED.*
      VALUES (@orgId, ...)
    `);

  const created = result.recordset[0];
  
  // Automatic memory capture
  await {entity}Memory.created(org_id, created.{entity}_id, created.name);
  
  ok(res, created, 201);
}));
```

#### Memory-Informed Business Logic
```typescript
export async function make{Entity}Decision(orgId: number, entityId: number, context: any) {
  // Get memory context
  const memoryResponse = await fetch(`/api/memory/card?org_id=${orgId}&entity_type={entity}&entity_id=${entityId}`);
  const memoryCard = await memoryResponse.json();
  
  // Apply memory-informed logic
  const riskFactors = memoryCard.data.top_atoms
    .filter(atom => atom.atom_type === 'risk')
    .map(atom => atom.content);
    
  if (riskFactors.includes('{specific_risk_pattern}')) {
    // Adjust decision based on historical context
    return { decision: 'proceed_with_caution', risk_factors: riskFactors };
  }
  
  return { decision: 'proceed', confidence: 'high' };
}
```

#### Memory Event Processing
```typescript
// In workers/outbox.ts or dedicated memory processor
case '{module}.{action}':
  // Capture memory for domain-specific actions
  await {entity}Memory.{action}(org_id, item_id, payload.context);
  console.log(`{Module} {action} memory captured for ${item_id}`);
  break;
```

### Code Example Templates

#### Route Handler
```typescript
router.get('/{endpoint}', asyncHandler(async (req, res) => {
  const { param } = req.query;
  if (!param) return badRequest(res, 'param required');

  const pool = await getPool();
  const result = await pool.request()
    .input('param', sql.Type, param)
    .query('SELECT * FROM table WHERE param = @param');

  ok(res, result.recordset);
}));
```

#### State Guard
```typescript
export async function ensureValidTransition(orgId: number, entityId: number, newState: string, pool: any) {
  const result = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('entityId', sql.BigInt, entityId)
    .query('SELECT current_state FROM entity WHERE entity_id = @entityId AND org_id = @orgId');

  const row = result.recordset[0];
  if (!row) throw new Error('Entity not found');

  assertTx(STATE_MACHINE, row.current_state, newState, 'entity state');
}
```

## 6. Feature-Specific Documentation

### When to Create
- Complex features with multiple components
- Integration-heavy features
- Features with unique business logic
- Features requiring special configuration

### Content Guidelines
- Feature overview and purpose
- Architecture and components
- Configuration options
- Usage examples
- Troubleshooting guide
- Performance considerations

## Documentation Process

### 1. Information Gathering
- Review source code and database schema
- Analyze API endpoints and request/response patterns
- Examine business logic and state machines
- Review integration points and dependencies
- Check existing tests and usage examples

### 2. Content Creation
- Start with overview and high-level concepts
- Document database schema and relationships
- Detail API endpoints and contracts
- Explain backend implementation patterns
- Cover integration and deployment aspects

### 3. Review and Validation
- Cross-reference with actual code
- Validate examples against running system
- Check for consistency with other modules
- Ensure completeness and accuracy

### 4. Maintenance
- Update documentation with code changes
- Add new features and capabilities
- Review and refresh regularly
- Archive outdated information

## Best Practices

### Writing Style
- Use clear, concise language
- Include practical examples
- Provide context for business logic
- Use consistent terminology
- Include code snippets where helpful

### Organization
- Logical flow from overview to details
- Cross-references between documents
- Consistent formatting and structure
- Version control for documentation

### Maintenance
- Keep documentation in sync with code
- Regular review and updates
- Version documentation with releases
- Archive deprecated features

### Tools and Techniques

#### Code Analysis
```bash
# Find all routes for a module
grep -r "router\." api/src/routes/{module}/

# Find database tables
grep -r "CREATE TABLE" api/scripts/*{module}*

# Find API endpoints
grep -r "/api/{module}" api/openapi.snapshot.json
```

#### Documentation Generation
```bash
# Generate API docs from OpenAPI spec
npm run gen:api:snapshot

# Check database schema
npm run db:ping

# Validate TypeScript types
npm run type-check
```

#### Content Validation
- Test all API examples
- Verify database queries
- Check state transitions
- Validate integration points

## Quality Checklist

### Completeness
- [ ] All endpoints documented
- [ ] Database schema fully described
- [ ] State machines documented
- [ ] Integration points covered
- [ ] Error scenarios handled

### Accuracy
- [ ] Code examples tested
- [ ] API responses verified
- [ ] Database queries validated
- [ ] Business logic correctly explained

### Usability
- [ ] Clear navigation structure
- [ ] Consistent formatting
- [ ] Practical examples provided
- [ ] Troubleshooting guides included

### Maintenance
- [ ] Version information current
- [ ] Links functional
- [ ] Cross-references accurate
- [ ] Regular review scheduled

## Examples from Workstream Module

### Memory Layer Philosophy Documentation
- **Problem-Solution Framework**: Clear articulation of institutional knowledge challenges
- **Evolution Narrative**: From manual tracking to intelligent context capture
- **Business Value Focus**: ROI through improved decision making and knowledge retention
- **Technical Philosophy**: Event-driven intelligence with privacy-first design

### Database Schema Documentation
- Comprehensive table descriptions
- Index and constraint documentation
- Relationship mapping
- Migration script references
- **Memory Table Integration**: memory.atom, memory.summary schema documentation

### API Reference Structure
- Consistent endpoint documentation
- Request/response examples
- Error code documentation
- State machine integration
- **Memory Endpoint Coverage**: Memory card retrieval, atom creation, redaction APIs

### Backend Implementation Details
- Code organization explanation
- Pattern documentation
- Error handling approaches
- Performance considerations
- **Memory Integration Patterns**: Helper usage, event processing, context-aware logic

### Memory-Specific Documentation Patterns

#### Philosophy Section Structure
```markdown
## 📖 Memory Layer Philosophy

### From {Current} to {Enhanced}
### The {Domain} Problem  
### Our Memory Solution
### Why This Matters
### Core Memory Philosophy
```

#### Memory Integration Coverage
```markdown
## Memory Integration
### Automatic Context Capture
### Memory-Enhanced Decision Making  
### Event-Driven Processing
### Governance and Privacy
```

#### Technical Implementation Examples
```typescript
// Memory helper patterns
await {entity}Memory.{action}(orgId, entityId, context);

// Memory-informed business logic
const memoryCard = await getMemoryCard(entityType, entityId);
const decision = makeInformedDecision(context, memoryCard);

// Event processing
case 'memory.atom.created': await processMemoryEvents();
```

This guide ensures consistent, comprehensive documentation across all FlowLedger modules, making the codebase more maintainable and accessible to all team members.
