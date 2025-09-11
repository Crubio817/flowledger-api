import { getPool, sql } from '../db/pool';
import crypto from 'crypto';

/**
 * Memory Layer Processor
 * Handles memory.atom.created, memory.summary.rebuild, and memory.atom.redact events
 * Integrates with FlowLedger's existing outbox pattern
 */

export async function processMemoryEvents() {
  const pool = await getPool();

  // Process memory.atom.created events
  const atomEvents = await pool.request()
    .input('batchSize', sql.Int, 10)
    .query(`
      UPDATE TOP(@batchSize) e
      SET e.processed_at = SYSUTCDATETIME()
      OUTPUT DELETED.*
      FROM app.work_event e
      WHERE e.event_name = 'memory.atom.created'
        AND e.processed_at IS NULL
        AND e.retry_count < 3
    `);

  for (const event of atomEvents.recordset) {
    await processAtom(pool, event);
  }

  // Process memory.summary.rebuild events
  const rebuildEvents = await pool.request()
    .input('batchSize', sql.Int, 5)
    .query(`
      UPDATE TOP(@batchSize) e
      SET e.processed_at = SYSUTCDATETIME()
      OUTPUT DELETED.*
      FROM app.work_event e
      WHERE e.event_name = 'memory.summary.rebuild'
        AND e.processed_at IS NULL
        AND e.retry_count < 3
    `);

  for (const event of rebuildEvents.recordset) {
    await rebuildSummary(pool, event);
  }

  // Process memory.atom.redact events
  const redactEvents = await pool.request()
    .input('batchSize', sql.Int, 5)
    .query(`
      UPDATE TOP(@batchSize) e
      SET e.processed_at = SYSUTCDATETIME()
      OUTPUT DELETED.*
      FROM app.work_event e
      WHERE e.event_name = 'memory.atom.redact'
        AND e.processed_at IS NULL
        AND e.retry_count < 3
    `);

  for (const event of redactEvents.recordset) {
    await processRedaction(pool, event);
  }
}

async function processAtom(pool: sql.ConnectionPool, event: any) {
  try {
    const payload = JSON.parse(event.payload_json);

    // Generate content hash for deduplication
    const contentHash = crypto.createHash('sha256')
      .update(payload.content.toLowerCase().trim())
      .digest();

    // Calculate score based on atom type
    const score = calculateMemoryScore(payload);

    // Calculate expiry based on atom type
    const expiresAt = calculateExpiry(payload.atom_type);

    // Insert atom (idempotent via unique constraint)
    await pool.request()
      .input('orgId', sql.Int, event.org_id)
      .input('entityType', sql.VarChar, payload.entity_type)
      .input('entityId', sql.Int, payload.entity_id)
      .input('atomType', sql.VarChar, payload.atom_type)
      .input('content', sql.NVarChar, payload.content)
      .input('contentHash', sql.Binary, contentHash)
      .input('sourceSystem', sql.VarChar, payload.source?.system || 'app')
      .input('sourceId', sql.NVarChar, payload.source?.origin_id || 'unknown')
      .input('sourceUrl', sql.NVarChar, payload.source?.url)
      .input('authorId', sql.NVarChar, payload.source?.author_id)
      .input('occurredAt', sql.DateTime2, new Date(payload.occurred_at))
      .input('score', sql.Decimal(5,2), score)
      .input('expiresAt', sql.DateTime2, expiresAt)
      .input('tags', sql.NVarChar, Array.isArray(payload.tags) ? payload.tags.join(',') : payload.tags)
      .query(`
        INSERT INTO memory.atom (
          org_id, entity_type, entity_id, atom_type, content, content_hash,
          source_system, source_id, source_url, author_id, occurred_at,
          score, expires_at, tags
        )
        SELECT @orgId, @entityType, @entityId, @atomType, @content, @contentHash,
               @sourceSystem, @sourceId, @sourceUrl, @authorId, @occurredAt,
               @score, @expiresAt, @tags
        WHERE NOT EXISTS (
          SELECT 1 FROM memory.atom
          WHERE org_id = @orgId
            AND entity_type = @entityType
            AND entity_id = @entityId
            AND content_hash = @contentHash
        )
      `);

    // Queue summary rebuild
    await pool.request()
      .input('orgId', sql.Int, event.org_id)
      .input('itemType', sql.VarChar, 'memory')
      .input('itemId', sql.BigInt, payload.entity_id)
      .input('eventName', sql.VarChar, 'memory.summary.rebuild')
      .input('payloadJson', sql.NVarChar, JSON.stringify({
        entity_type: payload.entity_type,
        entity_id: payload.entity_id
      }))
      .query(`
        INSERT INTO app.work_event (org_id, item_type, item_id, event_name, payload_json)
        VALUES (@orgId, @itemType, @itemId, @eventName, @payloadJson)
      `);

    console.log(`[MEMORY] Processed atom for ${payload.entity_type}:${payload.entity_id}`);

  } catch (error) {
    console.error(`[MEMORY] Failed to process atom:`, error);
    throw error;
  }
}

async function rebuildSummary(pool: sql.ConnectionPool, event: any) {
  try {
    const payload = JSON.parse(event.payload_json);

    // Get top atoms for this entity
    const atoms = await pool.request()
      .input('orgId', sql.Int, event.org_id)
      .input('entityType', sql.VarChar, payload.entity_type)
      .input('entityId', sql.Int, payload.entity_id)
      .query(`
        SELECT TOP 20
          atom_type, content, occurred_at, source_url, score
        FROM memory.atom
        WHERE org_id = @orgId
          AND entity_type = @entityType
          AND entity_id = @entityId
          AND is_redacted = 0
          AND (expires_at IS NULL OR expires_at > SYSUTCDATETIME())
        ORDER BY score DESC, occurred_at DESC
      `);

    // Build summary (simple categorization for MVP)
    const summary = {
      key_facts: atoms.recordset
        .filter(a => a.atom_type === 'preference' || a.atom_type === 'decision')
        .slice(0, 5)
        .map(a => a.content),
      recent_activity: atoms.recordset
        .slice(0, 3)
        .map(a => `${a.atom_type}: ${a.content}`),
      decisions: atoms.recordset
        .filter(a => a.atom_type === 'decision')
        .slice(0, 3)
        .map(a => a.content)
    };

    // Upsert summary
    await pool.request()
      .input('orgId', sql.Int, event.org_id)
      .input('entityType', sql.VarChar, payload.entity_type)
      .input('entityId', sql.Int, payload.entity_id)
      .input('summaryJson', sql.NVarChar, JSON.stringify(summary))
      .input('topAtomsJson', sql.NVarChar, JSON.stringify(atoms.recordset.slice(0, 10)))
      .query(`
        MERGE memory.summary AS target
        USING (SELECT @orgId org_id, @entityType entity_type, @entityId entity_id) AS source
        ON target.org_id = source.org_id
          AND target.entity_type = source.entity_type
          AND target.entity_id = source.entity_id
        WHEN MATCHED THEN
          UPDATE SET
            summary_json = @summaryJson,
            top_atoms_json = @topAtomsJson,
            last_built_at = SYSUTCDATETIME(),
            version = version + 1
        WHEN NOT MATCHED THEN
          INSERT (org_id, entity_type, entity_id, summary_json, top_atoms_json)
          VALUES (source.org_id, source.entity_type, source.entity_id, @summaryJson, @topAtomsJson);
      `);

    console.log(`[MEMORY] Rebuilt summary for ${payload.entity_type}:${payload.entity_id}`);

  } catch (error) {
    console.error(`[MEMORY] Failed to rebuild summary:`, error);
    throw error;
  }
}

async function processRedaction(pool: sql.ConnectionPool, event: any) {
  try {
    const payload = JSON.parse(event.payload_json);

    // Record the redaction
    await pool.request()
      .input('orgId', sql.Int, event.org_id)
      .input('atomId', sql.Int, payload.atom_id)
      .input('action', sql.VarChar, payload.action)
      .input('reason', sql.NVarChar, payload.reason)
      .input('actorUserId', sql.NVarChar, payload.actor_user_id)
      .query(`
        INSERT INTO memory.redaction (org_id, atom_id, action, reason, actor_user_id)
        VALUES (@orgId, @atomId, @action, @reason, @actorUserId)
      `);

    if (payload.action === 'redact') {
      // Mark atom as redacted
      await pool.request()
        .input('atomId', sql.Int, payload.atom_id)
        .input('orgId', sql.Int, event.org_id)
        .query(`
          UPDATE memory.atom
          SET is_redacted = 1
          WHERE atom_id = @atomId AND org_id = @orgId
        `);
    } else if (payload.action === 'correct' && payload.new_content) {
      // Create new corrected atom
      const contentHash = crypto.createHash('sha256')
        .update(payload.new_content.toLowerCase().trim())
        .digest();

      // Get original atom details
      const original = await pool.request()
        .input('atomId', sql.Int, payload.atom_id)
        .input('orgId', sql.Int, event.org_id)
        .query(`
          SELECT entity_type, entity_id, atom_type, source_system, source_id, source_url, author_id
          FROM memory.atom
          WHERE atom_id = @atomId AND org_id = @orgId
        `);

      if (original.recordset[0]) {
        const orig = original.recordset[0];

        // Insert corrected atom
        await pool.request()
          .input('orgId', sql.Int, event.org_id)
          .input('entityType', sql.VarChar, orig.entity_type)
          .input('entityId', sql.Int, orig.entity_id)
          .input('atomType', sql.VarChar, orig.atom_type)
          .input('content', sql.NVarChar, payload.new_content)
          .input('contentHash', sql.Binary, contentHash)
          .input('sourceSystem', sql.VarChar, orig.source_system)
          .input('sourceId', sql.NVarChar, `${orig.source_id}_corrected`)
          .input('sourceUrl', sql.NVarChar, orig.source_url)
          .input('authorId', sql.NVarChar, payload.actor_user_id)
          .input('occurredAt', sql.DateTime2, new Date())
          .input('score', sql.Decimal(5,2), 90.0) // High score for corrections
          .query(`
            INSERT INTO memory.atom (
              org_id, entity_type, entity_id, atom_type, content, content_hash,
              source_system, source_id, source_url, author_id, occurred_at, score
            ) VALUES (
              @orgId, @entityType, @entityId, @atomType, @content, @contentHash,
              @sourceSystem, @sourceId, @sourceUrl, @authorId, @occurredAt, @score
            )
          `);
      }
    }

    // Queue summary rebuild
    const atomDetails = await pool.request()
      .input('atomId', sql.Int, payload.atom_id)
      .input('orgId', sql.Int, event.org_id)
      .query(`
        SELECT entity_type, entity_id FROM memory.atom WHERE atom_id = @atomId AND org_id = @orgId
      `);

    if (atomDetails.recordset[0]) {
      await pool.request()
        .input('orgId', sql.Int, event.org_id)
        .input('itemType', sql.VarChar, 'memory')
        .input('itemId', sql.BigInt, atomDetails.recordset[0].entity_id)
        .input('eventName', sql.VarChar, 'memory.summary.rebuild')
        .input('payloadJson', sql.NVarChar, JSON.stringify({
          entity_type: atomDetails.recordset[0].entity_type,
          entity_id: atomDetails.recordset[0].entity_id
        }))
        .query(`
          INSERT INTO app.work_event (org_id, item_type, item_id, event_name, payload_json)
          VALUES (@orgId, @itemType, @itemId, @eventName, @payloadJson)
        `);
    }

    console.log(`[MEMORY] Processed ${payload.action} for atom ${payload.atom_id}`);

  } catch (error) {
    console.error(`[MEMORY] Failed to process redaction:`, error);
    throw error;
  }
}

function calculateMemoryScore(payload: any): number {
  const typeWeights: Record<string, number> = {
    decision: 1.0,
    risk: 0.9,
    preference: 0.8,
    note: 0.6,
    status: 0.4
  };

  const baseScore = typeWeights[payload.atom_type] || 0.5;
  const trustWeight = payload.source?.trust_weight || 1.0;

  return Math.min(baseScore * trustWeight * 100, 100);
}

function calculateExpiry(atomType: string): Date | null {
  const ttlDays: Record<string, number> = {
    preference: 365,
    decision: 365,
    risk: 365,
    status: 30,
    note: 90
  };

  const days = ttlDays[atomType];
  if (!days) return null;

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}
