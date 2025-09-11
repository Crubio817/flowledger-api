# FlowLedger Memory Layer

## Overview

The Memory Layer is FlowLedger's institutional memory system that captures, stores, and surfaces time-stamped facts ("memory atoms") about entities like pursuits, engagements, candidates, and communications. It provides explainable AI-assisted insights without hallucinations.

## Architecture

### Core Components

1. **Memory Atoms** - Individual facts with provenance
2. **Memory Summaries** - Cached rollups for fast reads
3. **Memory Processor** - Background worker for atom processing
4. **Memory API** - REST endpoints for reading/writing memory
5. **Memory Events** - Integration with FlowLedger's event system

### Data Flow

```
User Action → work_event → Memory Processor → Memory Atom → Summary Rebuild → Cached Summary
```

## Setup Instructions

### 1. Database Migration

Run the memory layer migration:

```bash
# Apply the migration
sqlcmd -S your-server -d flowledger -i migrations/memory-layer.sql
```

### 2. Install Dependencies

The memory layer uses existing FlowLedger dependencies (crypto for hashing).

### 3. Start the Memory Processor

The memory processor runs as part of the existing outbox worker. No additional services needed.

## API Reference

### Get Memory Card

```http
GET /api/memory/card?org_id=1&entity_type=pursuit&entity_id=123
```

**Response:**
```json
{
  "summary": {
    "key_facts": ["Pursuit submitted with proposal v2 sent to client"],
    "recent_activity": ["Pursuit created for candidate 456 in qual stage"],
    "decisions": ["Pursuit won - contract secured with client"]
  },
  "top_atoms": [
    {
      "atom_type": "decision",
      "content": "Pursuit won - contract secured with client",
      "occurred_at": "2024-09-08T10:30:00Z",
      "source_url": "/pursuits/123",
      "score": 100.0
    }
  ],
  "last_built_at": "2024-09-08T10:35:00Z",
  "etag": "W/\"1-1694168100000\"",
  "empty": false
}
```

### Create Memory Atom

```http
POST /api/memory/atoms?org_id=1
Content-Type: application/json

{
  "entity_type": "pursuit",
  "entity_id": 123,
  "atom_type": "decision",
  "content": "Client prefers morning meetings",
  "source": {
    "system": "app",
    "origin_id": "pursuit:123:note",
    "url": "/pursuits/123"
  },
  "occurred_at": "2024-09-08T10:30:00Z",
  "tags": ["communication", "preference"]
}
```

### Redact Memory Atom

```http
POST /api/memory/redactions?org_id=1
Content-Type: application/json

{
  "atom_id": 456,
  "action": "redact",
  "reason": "Contains sensitive pricing information"
}
```

## Atom Types

- **decision** - Business decisions, approvals, rejections
- **risk** - Issues, blockers, concerns
- **preference** - Client preferences, requirements
- **status** - State changes, progress updates
- **note** - General observations, comments

## Integration Examples

### Automatic Memory Capture

The memory layer automatically captures atoms from key FlowLedger events:

```typescript
// In pursuits.ts - When pursuit is created
await pool.request()
  .input('orgId', sql.Int, orgId)
  .input('entityType', sql.VarChar, 'memory')
  .input('entityId', sql.Int, pursuitId)
  .input('eventType', sql.NVarChar, 'memory.atom.created')
  .input('payload', sql.NVarChar, JSON.stringify({
    entity_type: 'pursuit',
    entity_id: pursuitId,
    atom_type: 'status',
    content: `Pursuit created for candidate ${candidateId} in ${stage} stage`,
    source: {
      system: 'app',
      origin_id: `pursuit:${pursuitId}:created`,
      url: `/pursuits/${pursuitId}`
    },
    occurred_at: new Date().toISOString()
  }))
  .query(`
    INSERT INTO app.work_event (org_id, entity_type, entity_id, event_type, payload)
    VALUES (@orgId, @entityType, @entityId, @eventType, @payload)
  `);
```

### Manual Memory Capture

```typescript
// In any route - Capture user observations
router.post('/notes', asyncHandler(async (req, res) => {
  // ... save note ...
  
  // Capture as memory atom
  await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('entityType', sql.VarChar, 'memory')
    .input('entityId', sql.Int, entityId)
    .input('eventType', sql.NVarChar, 'memory.atom.created')
    .input('payload', sql.NVarChar, JSON.stringify({
      entity_type: 'pursuit',
      entity_id: entityId,
      atom_type: 'note',
      content: req.body.content,
      source: {
        system: 'app',
        origin_id: `note:${noteId}`,
        url: `/pursuits/${entityId}/notes/${noteId}`
      },
      occurred_at: new Date().toISOString()
    }))
    .query(`
      INSERT INTO app.work_event (org_id, entity_type, entity_id, event_type, payload)
      VALUES (@orgId, @entityType, @entityId, @eventType, @payload)
    `);
}));
```

## Performance Characteristics

### Latency Targets
- **Memory Card (warm cache)**: <120ms p95
- **Memory Card (cold cache)**: <400ms p95
- **Atom creation**: <50ms
- **Summary rebuild**: <250ms per entity

### Scaling
- **Concurrent users**: Thousands supported
- **Atoms per entity**: Soft limit 10k
- **Summary size**: <4KB for fast reads
- **Cache TTL**: 60 seconds

## Governance & Security

### Multi-Tenant Isolation
- All queries filtered by `org_id`
- No cross-tenant data access
- Audit trail for all redactions

### Data Retention
- **Decision/Risk atoms**: 365 days
- **Preference atoms**: 365 days
- **Status atoms**: 30 days
- **Note atoms**: 90 days

### Redaction & Correction
- Immutable original atoms
- Soft deletion from summaries
- Audit trail with reasons
- Correction creates new atoms

## Monitoring & Observability

### Key Metrics
- Memory card response time
- Atom creation rate
- Summary rebuild latency
- Redaction/correction frequency
- Cache hit ratio

### Health Checks
```typescript
// Memory layer health
router.get('/health/memory', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .query('SELECT COUNT(*) as atom_count FROM memory.atom');
  
  ok(res, {
    status: 'healthy',
    atom_count: result.recordset[0].atom_count,
    timestamp: new Date().toISOString()
  });
}));
```

## Troubleshooting

### Common Issues

1. **Memory cards not loading**
   - Check if memory processor is running
   - Verify work_event table has memory events
   - Check memory schema exists

2. **Atoms not appearing**
   - Verify event processing in outbox worker
   - Check for duplicate content_hash (expected behavior)
   - Review memory processor logs

3. **Slow performance**
   - Check indexes on memory tables
   - Verify summary caching is working
   - Monitor work_event backlog

### Debug Commands

```sql
-- Check memory events
SELECT * FROM app.work_event
WHERE event_type LIKE 'memory%'
ORDER BY created_at DESC;

-- Check atom processing
SELECT * FROM memory.atom
WHERE org_id = 1 AND entity_type = 'pursuit'
ORDER BY created_at DESC;

-- Check summary freshness
SELECT * FROM memory.summary
WHERE org_id = 1 AND entity_type = 'pursuit';
```

## Future Extensions

### Phase 2 Features
- **Semantic search** with embeddings
- **Cross-entity memory** (client across all pursuits)
- **Memory sharing** between team members
- **Automated insights** from atom patterns
- **Integration** with email/Slack/Teams

### API Extensions
- **Bulk operations** for data migration
- **Memory export** for compliance
- **Memory diff** between time periods
- **Memory search** across entities

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review memory processor logs
3. Verify database schema matches migration
4. Check work_event processing is working

The memory layer is designed to be **additive** - it enhances FlowLedger without breaking existing functionality.
