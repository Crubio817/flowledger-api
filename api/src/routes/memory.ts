import { Router } from 'express';
import { asyncHandler, ok, badRequest, notFound } from '../utils/http';
import { getPool, sql } from '../db/pool';

const router = Router();

/**
 * @openapi
 * /api/memory/card:
 *   get:
 *     tags: [Memory]
 *     summary: Get memory card for an entity
 *     parameters:
 *       - name: org_id
 *         in: query
 *         required: true
 *         schema:
 *           type: integer
 *       - name: entity_type
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           enum: [pursuit, candidate, engagement, comms_thread]
 *       - name: entity_id
 *         in: query
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Memory card with summary and top atoms
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok]
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                     top_atoms:
 *                       type: array
 *                     last_built_at:
 *                       type: string
 *                     etag:
 *                       type: string
 *                     empty:
 *                       type: boolean
 */
router.get('/card', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id);
  const entityType = req.query.entity_type as string;
  const entityId = Number(req.query.entity_id);

  if (!orgId) return badRequest(res, 'org_id required');
  if (!entityType) return badRequest(res, 'entity_type required');
  if (!entityId) return badRequest(res, 'entity_id required');

  const allowedTypes = ['pursuit', 'candidate', 'engagement', 'comms_thread'];
  if (!allowedTypes.includes(entityType)) {
    return badRequest(res, `entity_type must be one of: ${allowedTypes.join(', ')}`);
  }

  const pool = await getPool();

  // Get summary and top atoms
  const summaryResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('entityType', sql.NVarChar, entityType)
    .input('entityId', sql.Int, entityId)
    .query(`
      SELECT summary_json, last_built_at
      FROM memory.summary
      WHERE org_id = @orgId AND entity_type = @entityType AND entity_id = @entityId
    `);

  const atomsResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('entityType', sql.NVarChar, entityType)
    .input('entityId', sql.Int, entityId)
    .query(`
      SELECT TOP 10 
        atom_type, content, occurred_at, source_url, score
      FROM memory.atom
      WHERE org_id = @orgId AND entity_type = @entityType AND entity_id = @entityId
        AND is_redacted = 0
      ORDER BY score DESC, occurred_at DESC
    `);

  const summary = summaryResult.recordset[0];
  const atoms = atomsResult.recordset;

  const lastBuiltAt = summary?.last_built_at || null;
  const etag = lastBuiltAt ? `W/"1-${new Date(lastBuiltAt).getTime()}"` : 'W/"0-0"';

  // Set ETag header for caching
  res.set('ETag', etag);

  // Check if client has current version
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  const memoryCard = {
    summary: summary?.summary_json ? JSON.parse(summary.summary_json) : {
      key_facts: [],
      recent_activity: [],
      decisions: []
    },
    top_atoms: atoms.map(atom => ({
      atom_type: atom.atom_type,
      content: atom.content,
      occurred_at: atom.occurred_at,
      source_url: atom.source_url,
      score: atom.score
    })),
    last_built_at: lastBuiltAt,
    etag,
    empty: !summary && atoms.length === 0
  };

  ok(res, memoryCard);
}));

/**
 * @openapi
 * /api/memory/atoms:
 *   post:
 *     tags: [Memory]
 *     summary: Create a memory atom
 *     parameters:
 *       - name: org_id
 *         in: query
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entity_type, entity_id, atom_type, content, source]
 *             properties:
 *               entity_type:
 *                 type: string
 *               entity_id:
 *                 type: integer
 *               atom_type:
 *                 type: string
 *                 enum: [decision, risk, preference, status, note]
 *               content:
 *                 type: string
 *               source:
 *                 type: object
 *                 properties:
 *                   system:
 *                     type: string
 *                   origin_id:
 *                     type: string
 *                   url:
 *                     type: string
 *               occurred_at:
 *                 type: string
 *                 format: date-time
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Atom created successfully
 */
router.post('/atoms', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id);
  if (!orgId) return badRequest(res, 'org_id required');

  const { entity_type, entity_id, atom_type, content, source, occurred_at, tags } = req.body;

  // Validation
  if (!entity_type) return badRequest(res, 'entity_type required');
  if (!entity_id) return badRequest(res, 'entity_id required');
  if (!atom_type) return badRequest(res, 'atom_type required');
  if (!content) return badRequest(res, 'content required');
  if (!source) return badRequest(res, 'source required');

  const allowedTypes = ['decision', 'risk', 'preference', 'status', 'note'];
  if (!allowedTypes.includes(atom_type)) {
    return badRequest(res, `atom_type must be one of: ${allowedTypes.join(', ')}`);
  }

  // Emit memory event for processing
  const pool = await getPool();
  await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('itemType', sql.VarChar, 'memory')
    .input('itemId', sql.BigInt, entity_id)
    .input('eventName', sql.VarChar, 'memory.atom.created')
    .input('payloadJson', sql.NVarChar, JSON.stringify({
      entity_type,
      entity_id,
      atom_type,
      content,
      source,
      occurred_at: occurred_at || new Date().toISOString(),
      tags: tags || []
    }))
    .query(`
      INSERT INTO app.work_event (org_id, item_type, item_id, event_name, payload_json)
      VALUES (@orgId, @itemType, @itemId, @eventName, @payloadJson)
    `);

  res.status(201).json({
    status: 'ok',
    data: { message: 'Memory atom queued for processing' }
  });
}));

/**
 * @openapi
 * /api/memory/redactions:
 *   post:
 *     tags: [Memory]
 *     summary: Redact or correct a memory atom
 *     parameters:
 *       - name: org_id
 *         in: query
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [atom_id, action, reason]
 *             properties:
 *               atom_id:
 *                 type: integer
 *               action:
 *                 type: string
 *                 enum: [redact, correct]
 *               reason:
 *                 type: string
 *               correction_content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Redaction processed successfully
 */
router.post('/redactions', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id);
  if (!orgId) return badRequest(res, 'org_id required');

  const { atom_id, action, reason, correction_content } = req.body;

  if (!atom_id) return badRequest(res, 'atom_id required');
  if (!action) return badRequest(res, 'action required');
  if (!reason) return badRequest(res, 'reason required');

  if (!['redact', 'correct'].includes(action)) {
    return badRequest(res, 'action must be "redact" or "correct"');
  }

  if (action === 'correct' && !correction_content) {
    return badRequest(res, 'correction_content required for corrections');
  }

  const pool = await getPool();

  // Verify atom exists and belongs to org
  const atomResult = await pool.request()
    .input('atomId', sql.Int, atom_id)
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT atom_id, entity_type, entity_id 
      FROM memory.atom 
      WHERE atom_id = @atomId AND org_id = @orgId
    `);

  if (atomResult.recordset.length === 0) {
    return notFound(res, 'Atom not found');
  }

  const atom = atomResult.recordset[0];

  // Record redaction
  await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('atomId', sql.Int, atom_id)
    .input('action', sql.NVarChar, action)
    .input('reason', sql.NVarChar, reason)
    .input('correctionContent', sql.NVarChar, correction_content || null)
    .query(`
      INSERT INTO memory.redaction (org_id, atom_id, action, reason, correction_content, redacted_at)
      VALUES (@orgId, @atomId, @action, @reason, @correctionContent, GETUTCDATE())
    `);

  // Deactivate atom if redacting
  if (action === 'redact') {
    await pool.request()
      .input('atomId', sql.Int, atom_id)
      .query(`
        UPDATE memory.atom 
        SET is_redacted = 1
        WHERE atom_id = @atomId
      `);
  }

  // Emit event to rebuild summary
  await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('itemType', sql.VarChar, 'memory')
    .input('itemId', sql.BigInt, atom.entity_id)
    .input('eventName', sql.VarChar, 'memory.summary.rebuild')
    .input('payloadJson', sql.NVarChar, JSON.stringify({
      entity_type: atom.entity_type,
      entity_id: atom.entity_id,
      trigger: action === 'redact' ? 'atom_redacted' : 'atom_corrected',
      atom_id
    }))
    .query(`
      INSERT INTO app.work_event (org_id, item_type, item_id, event_name, payload_json)
      VALUES (@orgId, @itemType, @itemId, @eventName, @payloadJson)
    `);

  ok(res, { message: `Atom ${action}ed successfully` });
}));

export default router;
