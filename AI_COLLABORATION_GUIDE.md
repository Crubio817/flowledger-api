# AI Assistant Collaboration Guide for FlowLedger API

## 🤖 Instructions for AI Assistants Working on FlowLedger API

This guide helps AI assistants understand the project structure, conventions, and expected behavior when working with the FlowLedger API codebase.

## 📋 Project Overview

FlowLedger API is a **multi-tenant, event-driven** Node.js/TypeScript enterprise platform for managing client relationships, sales workflows, and operational intelligence. Key characteristics:

- **Multi-tenant**: All data scoped by `org_id` with database-level isolation
- **Event-driven**: Outbox pattern with atomic claiming and exponential backoff retry
- **State machines**: Hard-enforced transitions with guard functions
- **MCP integration**: AI tools via Model Context Protocol
- **Real-time**: WebSocket server for live updates

## 🏗️ Critical Architecture Patterns

### 1. Multi-Tenancy Enforcement
**ALWAYS** include `org_id` filtering in database queries:
```sql
-- ✅ CORRECT - Always filter by org_id
SELECT * FROM app.clients WHERE org_id = @orgId AND client_id = @clientId

-- ❌ WRONG - Missing org_id filter (data leakage risk)
SELECT * FROM app.clients WHERE client_id = @clientId
```

### 2. API Response Patterns
**Success responses:**
```typescript
{ status: 'ok', data: result, meta?: { page, limit, total } }
```

**Error responses:**
```typescript
{ error: { code: 'ErrorCode', message: 'Description' } }
```

### 3. Route Handler Pattern
```typescript
router.get('/endpoint', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('orgId', sql.Int, req.query.org_id)
    .query('SELECT * FROM table WHERE org_id = @orgId');
  ok(res, result.recordset);
}));
```

### 4. State Machine Validation
```typescript
// In src/state/guards.ts
export const ENTITY_TX = {
  state1: ['allowed_transition1', 'allowed_transition2'],
  state2: ['allowed_transition3']
};

// Always validate transitions
assertTx(ENTITY_TX, currentState, newState, 'entity');
```

## 📁 Project Structure Understanding

```
flowledger-api/
├── api/                          # Backend API (YOUR MAIN WORK AREA)
│   ├── src/
│   │   ├── routes/              # API endpoints (add new routes here)
│   │   ├── workers/             # Background processing
│   │   ├── state/guards.ts      # Business rule validation
│   │   ├── validation/schemas.ts # Zod input validation
│   │   ├── utils/http.ts        # Response helpers
│   │   └── mcp-tools.ts         # AI integration tools
│   ├── scripts/                 # Database migrations
│   └── test/                    # Test suites
├── docs/                        # Organized documentation
├── frontend-integration-package/ # TypeScript SDK
├── archive/                     # Old files (DON'T MODIFY)
└── scripts/                     # Utility scripts
```

## 🚫 Critical DON'Ts

1. **Never take `org_id` from request body** - Only from authenticated session
2. **Never use direct SQL concatenation** - Always use parameterized queries
3. **Never skip state transition validation** - Use `assertTx` for business rules
4. **Never modify files in `archive/`** - These are historical/cleanup
5. **Never return large unfiltered datasets** - Always paginate with `OFFSET/FETCH`
6. **Never ignore error handling** - Wrap routes with `asyncHandler`

## ✅ Required Behaviors

### When Creating New Endpoints:
1. **Use Zod validation** for all inputs
2. **Include org_id filtering** in all queries
3. **Use response helpers** (`ok`, `badRequest`, etc.)
4. **Add audit logging** for state changes
5. **Implement pagination** for list endpoints
6. **Test multi-tenant isolation**

### When Modifying Database:
1. **Always include migration scripts** in `api/scripts/`
2. **Use `org_id` in all table schemas**
3. **Create proper indexes** with `org_id` as leading column
4. **Use `OUTPUT INSERTED.*`** for create operations
5. **Maintain referential integrity**

### When Adding Business Logic:
1. **Define state transitions** in `src/state/guards.ts`
2. **Use guard functions** to enforce rules
3. **Log activities** for audit trail
4. **Consider event implications** for outbox processing
5. **Test edge cases** and error conditions

## 🎯 Specific Module Behaviors

### Workstream (Sales)
- Enforce pursuit stage transitions
- Validate qualification criteria
- Log all stage changes
- Calculate SLA metrics

### People (Staffing)
- Maintain immutable rate snapshots
- Track availability conflicts
- Calculate utilization metrics
- Enforce skill prerequisites

### Billing & Contracts
- Ensure financial data integrity
- Calculate accurate billing amounts
- Handle multi-currency scenarios
- Maintain audit trails

### MCP (AI Integration)
- Validate tool inputs/outputs
- Handle API rate limits
- Log enrichment activities
- Cache expensive operations

## 🧪 Testing Requirements

### Always Test:
```typescript
// Multi-tenant isolation
test('should only return data for specified org_id', async () => {
  // Create data for org 1 and org 2
  // Query for org 1 data
  // Verify org 2 data not returned
});

// State transitions
test('should reject invalid state transitions', async () => {
  // Try invalid transition
  // Expect error with specific message
});

// Input validation
test('should validate required fields', async () => {
  // Send invalid input
  // Expect 400 with validation errors
});
```

## 📊 Database Query Patterns

### Correct Patterns:
```sql
-- List with pagination
SELECT COUNT(*) OVER() as total_count, *
FROM app.entity 
WHERE org_id = @orgId
ORDER BY created_at DESC
OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY

-- Create with output
INSERT INTO app.entity (org_id, name)
OUTPUT INSERTED.entity_id, INSERTED.name, INSERTED.created_at
VALUES (@orgId, @name)

-- Update with validation
UPDATE app.entity 
SET status = @newStatus, updated_at = SYSUTCDATETIME()
WHERE org_id = @orgId AND entity_id = @entityId
```

## 🔧 Development Workflow

### Before Making Changes:
1. **Understand the module** you're working in
2. **Read existing code patterns** in similar endpoints
3. **Check state machine rules** if modifying workflows
4. **Identify integration points** with other modules

### When Implementing:
1. **Start with validation schemas**
2. **Implement database operations**
3. **Add business logic with guards**
4. **Include audit logging**
5. **Write comprehensive tests**
6. **Update API documentation**

### After Implementation:
1. **Test multi-tenant scenarios**
2. **Verify state machine compliance**
3. **Check performance implications**
4. **Update relevant documentation**
5. **Consider integration impacts**

## 🆘 When You Need Help

### Check These First:
1. **Architecture overview**: `docs/architecture/overview.md`
2. **Development guide**: `docs/development/guide.md`
3. **Module documentation**: `docs/modules/[module-name].md`
4. **Existing similar code** in the same module
5. **State machine definitions**: `src/state/guards.ts`

### Ask About:
- Business rule clarifications
- State transition requirements
- Integration patterns
- Performance optimization
- Testing strategies

## 📝 Code Style & Conventions

### TypeScript:
- Use strict type checking
- Prefer interfaces over types
- Use Zod for runtime validation
- Include JSDoc for complex functions

### Database:
- Use parameterized queries only
- Include proper error handling
- Use connection pooling
- Implement proper indexing

### API Design:
- RESTful endpoint patterns
- Consistent response formats
- Proper HTTP status codes
- Comprehensive error messages

## 🎯 Success Criteria

You're following the patterns correctly when:
1. **All database queries include org_id filtering**
2. **State transitions are validated with guard functions**
3. **API responses follow the standard format**
4. **Input validation uses Zod schemas**
5. **Tests cover multi-tenant scenarios**
6. **Audit logging captures important events**
7. **Performance is optimized with pagination**
8. **Error handling is comprehensive**

---

**Remember**: This is an enterprise-grade, multi-tenant system. Security, data isolation, and business rule enforcement are paramount. When in doubt, err on the side of caution and ask for clarification.
