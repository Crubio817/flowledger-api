# Module Documentation Guide

## Overview

This guide provides a comprehensive template for documenting modules in the FlowLedger project. It establishes standards for documentation structure, content requirements, and best practices based on the workstream module documentation approach.

## Documentation Structure

Each module should have its own folder under `/docs/modules/` with the following structure:

```
docs/modules/{module-name}/
├── README.md                 # Main navigation and overview
├── overview.md              # High-level module description
├── database-schema.md       # Complete database schema
├── api-reference.md         # REST API documentation
├── backend-implementation.md # Technical implementation details
├── {specific-feature}.md    # Feature-specific documentation
└── frontend-integration.md  # Frontend integration (if applicable)
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

#### Integration Endpoints
- Webhook endpoints
- External API integrations
- Third-party service connections

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

### Database Schema Documentation
- Comprehensive table descriptions
- Index and constraint documentation
- Relationship mapping
- Migration script references

### API Reference Structure
- Consistent endpoint documentation
- Request/response examples
- Error code documentation
- State machine integration

### Backend Implementation Details
- Code organization explanation
- Pattern documentation
- Error handling approaches
- Performance considerations

This guide ensures consistent, comprehensive documentation across all FlowLedger modules, making the codebase more maintainable and accessible to all team members.
