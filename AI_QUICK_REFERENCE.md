# 🤖 AI Quick Reference - FlowLedger API

## Copy-Paste This When Working with AI on FlowLedger:

```
IMPORTANT: You are working on FlowLedger API - a multi-tenant enterprise platform. 

KEY REQUIREMENTS:
1. ALWAYS filter database queries by org_id (multi-tenant isolation)
2. Use parameterized queries ONLY (security)
3. Validate state transitions with guard functions (business rules)
4. Use Zod schemas for input validation
5. Wrap routes with asyncHandler() and use ok()/badRequest() response helpers
6. Include audit logging for important events
7. Test multi-tenant data isolation

CRITICAL PATTERNS:
- Database: WHERE org_id = @orgId (ALWAYS)
- Responses: { status: 'ok', data: result } or { error: { code, message } }
- Routes: router.get('/', asyncHandler(async (req, res) => { ... }))
- Validation: const parsed = Schema.safeParse(req.body);
- State: assertTx(STATE_MAP, fromState, toState, 'entity');

PROJECT STRUCTURE:
- api/src/routes/ - API endpoints
- api/src/state/guards.ts - State transition rules  
- api/src/validation/schemas.ts - Input validation
- api/src/utils/http.ts - Response helpers
- docs/ - Documentation

DON'Ts:
- Never take org_id from request body (security risk)
- Never skip state transition validation
- Never use SQL string concatenation
- Never return unfiltered large datasets
- Never modify archive/ folder

For details: Read /workspaces/flowledger-api/AI_COLLABORATION_GUIDE.md
```

## Usage Instructions:

1. **Copy the above block** when starting work with any AI assistant
2. **Paste it at the beginning** of your conversation 
3. **Reference specific files** mentioned in the guide as needed
4. **Point to documentation** in docs/ folder for deeper understanding

This ensures any AI assistant understands:
- The multi-tenant architecture requirements
- Security and data isolation needs  
- Code patterns and conventions
- Project structure and key files
- Common pitfalls to avoid
