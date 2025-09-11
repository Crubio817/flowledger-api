import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound, getPagination } from '../utils/http';

// Simple outbox event emitter for spotlights
async function emitSpotlightEvent(eventName: string, payload: any) {
  const pool = await getPool();
  await pool.request()
    .input('eventName', sql.VarChar(40), eventName)
    .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .query(`
      INSERT INTO app.work_event (event_name, payload_json, item_type, item_id, org_id)
      VALUES (@eventName, @payload, 'spotlight', JSON_VALUE(@payload, '$.spotlight_id'), JSON_VALUE(@payload, '$.org_id'))
    `);
}

const router = Router();

/**
 * @openapi
 * /api/spotlights:
 *   get:
 *     summary: List spotlights
 *     tags: [Spotlights]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: domain
 *         schema: { type: string }
 *       - in: query
 *         name: active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, offset } = getPagination(req);
  const orgId = Number(req.query.org_id);
  const domain = req.query.domain as string;
  const active = req.query.active !== undefined ? req.query.active === 'true' : undefined;

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  let query = `
    SELECT s.*, 
           (SELECT COUNT(*) FROM app.spotlight_values sv WHERE sv.spotlight_id = s.spotlight_id) as field_count
    FROM app.spotlights s 
    WHERE s.org_id = @orgId
  `;
  const conditions = [];
  const request = pool.request().input('orgId', sql.Int, orgId);

  if (domain) {
    conditions.push('s.domain = @domain');
    request.input('domain', sql.NVarChar(100), domain);
  }

  if (active !== undefined) {
    conditions.push('s.active = @active');
    request.input('active', sql.Bit, active);
  }

  if (conditions.length > 0) {
    query += ' AND ' + conditions.join(' AND ');
  }

  query += ' ORDER BY s.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
  request.input('offset', sql.Int, offset).input('limit', sql.Int, limit);

  const r = await request.query(query);
  listOk(res, r.recordset, { page, limit });
}));

/**
 * @openapi
 * /api/spotlights:
 *   post:
 *     summary: Create a new spotlight
 *     tags: [Spotlights]
 */
router.post('/', asyncHandler(async (req, res) => {
  const { org_id, name, domain, description } = req.body;

  if (!org_id || !name || !domain) {
    return badRequest(res, 'org_id, name, and domain are required');
  }

  const pool = await getPool();
  const r = await pool.request()
    .input('orgId', sql.Int, org_id)
    .input('name', sql.NVarChar(255), name)
    .input('domain', sql.NVarChar(100), domain)
    .input('description', sql.NVarChar(1000), description || null)
    .query(`
      INSERT INTO app.spotlights (org_id, name, domain, description)
      OUTPUT INSERTED.*
      VALUES (@orgId, @name, @domain, @description)
    `);

  const spotlight = r.recordset[0];
  await emitSpotlightEvent('spotlight.created', { spotlight_id: spotlight.spotlight_id, org_id });

  ok(res, spotlight);
}));

/**
 * @openapi
 * /api/spotlights/domains:
 *   get:
 *     summary: List unique domains for spotlights
 *     tags: [Spotlights]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 */
router.get('/domains', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id);

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  const r = await pool.request()
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT DISTINCT domain
      FROM app.spotlights
      WHERE org_id = @orgId AND domain IS NOT NULL AND domain != ''
      ORDER BY domain
    `);

  ok(res, r.recordset.map(row => row.domain));
}));

/**
 * @openapi
 * /api/spotlights/fields:
 *   get:
 *     summary: List spotlight fields
 *     tags: [Spotlights]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: domain
 *         schema: { type: string }
 */
router.get('/fields', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id);
  const domain = req.query.domain as string;

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  let query = `
    SELECT f.*
    FROM app.spotlight_fields f
    WHERE f.org_id = @orgId
  `;
  const conditions = [];
  const request = pool.request().input('orgId', sql.Int, orgId);

  if (domain) {
    conditions.push('(f.domain = @domain OR f.domain IS NULL)');
    request.input('domain', sql.NVarChar(100), domain);
  }

  if (conditions.length > 0) {
    query += ' AND ' + conditions.join(' AND ');
  }

  query += ' ORDER BY f.display_order';
  const r = await request.query(query);
  ok(res, r.recordset);
}));

/**
 * @openapi
 * /api/spotlights/fields:
 *   post:
 *     summary: Create a new spotlight field
 *     tags: [Spotlights]
 */
router.post('/fields', asyncHandler(async (req, res) => {
  const { org_id, domain, field_name, field_type, is_required, display_order, enum_values } = req.body;

  if (!org_id || !field_name || !field_type) {
    return badRequest(res, 'org_id, field_name, and field_type are required');
  }

  const pool = await getPool();
  const r = await pool.request()
    .input('orgId', sql.Int, org_id)
    .input('domain', sql.NVarChar(100), domain || null)
    .input('fieldName', sql.NVarChar(255), field_name)
    .input('fieldType', sql.NVarChar(50), field_type)
    .input('isRequired', sql.Bit, is_required || false)
    .input('displayOrder', sql.Int, display_order || 0)
    .input('enumValues', sql.NVarChar(sql.MAX), enum_values ? JSON.stringify(enum_values) : null)
    .query(`
      INSERT INTO app.spotlight_fields (org_id, domain, field_name, field_type, is_required, display_order, enum_values)
      OUTPUT INSERTED.*
      VALUES (@orgId, @domain, @fieldName, @fieldType, @isRequired, @displayOrder, @enumValues)
    `);

  ok(res, r.recordset[0]);
}));

/**
 * @openapi
 * /api/spotlights/analytics:
 *   get:
 *     summary: Get spotlight analytics
 *     tags: [Spotlights]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 */
router.get('/analytics', asyncHandler(async (req, res) => {
  const orgId = Number(req.query.org_id);

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  const r = await pool.request()
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT domain, COUNT(*) as count
      FROM app.spotlights
      WHERE org_id = @orgId AND domain IS NOT NULL
      GROUP BY domain
      ORDER BY count DESC
    `);

  ok(res, r.recordset);
}));

/**
 * @openapi
 * /api/spotlights/{id}:
 *   get:
 *     summary: Get spotlight details
 *     tags: [Spotlights]
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const spotlightId = Number(req.params.id);
  const orgId = Number(req.query.org_id);

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  const r = await pool.request()
    .input('spotlightId', sql.BigInt, spotlightId)
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT s.*,
             f.field_id, f.field_name, f.field_type, f.is_required, f.display_order, f.enum_values,
             sv.field_value
      FROM app.spotlights s
      LEFT JOIN app.spotlight_values sv ON s.spotlight_id = sv.spotlight_id
      LEFT JOIN app.spotlight_fields f ON sv.field_id = f.field_id
      WHERE s.spotlight_id = @spotlightId AND s.org_id = @orgId
      ORDER BY f.display_order
    `);

  if (r.recordset.length === 0) return notFound(res, 'Spotlight not found');

  const spotlight = {
    ...r.recordset[0],
    fields: r.recordset.map(row => ({
      field_id: row.field_id,
      field_name: row.field_name,
      field_type: row.field_type,
      is_required: row.is_required,
      display_order: row.display_order,
      enum_values: row.enum_values ? JSON.parse(row.enum_values) : null,
      value: row.field_value
    })).filter(f => f.field_id)
  };

  ok(res, spotlight);
}));

/**
 * @openapi
 * /api/spotlights/{id}:
 *   put:
 *     summary: Update spotlight
 *     tags: [Spotlights]
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const spotlightId = Number(req.params.id);
  const { org_id, name, domain, description, active, field_values } = req.body;

  if (!org_id) return badRequest(res, 'org_id required');

  const pool = await getPool();
  
  // Build dynamic update query - only update fields that are provided
  const updates = [];
  const request = pool.request()
    .input('spotlightId', sql.BigInt, spotlightId)
    .input('orgId', sql.Int, org_id);

  if (name !== undefined) {
    updates.push('name = @name');
    request.input('name', sql.NVarChar(255), name);
  }
  if (domain !== undefined) {
    updates.push('domain = @domain');
    request.input('domain', sql.NVarChar(100), domain);
  }
  if (description !== undefined) {
    updates.push('description = @description');
    request.input('description', sql.NVarChar(1000), description);
  }
  if (active !== undefined) {
    updates.push('active = @active');
    request.input('active', sql.Bit, active);
  }

  if (updates.length > 0) {
    updates.push('updated_at = SYSUTCDATETIME()');
    await request.query(`
      UPDATE app.spotlights 
      SET ${updates.join(', ')}
      WHERE spotlight_id = @spotlightId AND org_id = @orgId
    `);
  }

  // Update field values if provided
  if (field_values && typeof field_values === 'object') {
    for (const [fieldId, value] of Object.entries(field_values)) {
      await pool.request()
        .input('spotlightId', sql.BigInt, spotlightId)
        .input('fieldId', sql.BigInt, Number(fieldId))
        .input('value', sql.NVarChar(sql.MAX), String(value))
        .query(`
          MERGE app.spotlight_values AS target
          USING (SELECT @spotlightId as spotlight_id, @fieldId as field_id, @value as field_value) AS source
          ON target.spotlight_id = source.spotlight_id AND target.field_id = source.field_id
          WHEN MATCHED THEN UPDATE SET field_value = source.field_value, updated_at = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (spotlight_id, field_id, field_value, org_id) VALUES (source.spotlight_id, source.field_id, source.field_value, @orgId);
        `);
    }
  }

  await emitSpotlightEvent('spotlight.updated', { spotlight_id: spotlightId, org_id });

  ok(res, { message: 'Spotlight updated successfully' });
}));

/**
 * @openapi
 * /api/spotlights/{id}/evaluate:
 *   post:
 *     summary: Evaluate signal against spotlight
 *     tags: [Spotlights]
 */
router.post('/:id/evaluate', asyncHandler(async (req, res) => {
  const spotlightId = Number(req.params.id);
  const { org_id, signal_data } = req.body;

  if (!org_id || !signal_data) return badRequest(res, 'org_id and signal_data required');

  const pool = await getPool();
  
  // Get spotlight fields and values
  const fieldsResult = await pool.request()
    .input('spotlightId', sql.BigInt, spotlightId)
    .input('orgId', sql.Int, org_id)
    .query(`
      SELECT f.field_name, f.field_type, sv.field_value
      FROM app.spotlight_fields f
      JOIN app.spotlight_values sv ON f.field_id = sv.field_id
      WHERE sv.spotlight_id = @spotlightId AND f.org_id = @orgId
    `);

  const fields = fieldsResult.recordset;
  let matched = 0;
  const total = fields.length;

  for (const field of fields) {
    const signalValue = signal_data[field.field_name];
    if (signalValue && matchesCriteria(signalValue, field.field_value, field.field_type)) {
      matched++;
    }
  }

  const matchScore = total > 0 ? matched / total : 0;
  const recommendation = getRecommendation(matchScore);

  // Store evaluation result (could be in a separate table)
  await pool.request()
    .input('spotlightId', sql.BigInt, spotlightId)
    .input('orgId', sql.Int, org_id)
    .input('payload', sql.NVarChar, JSON.stringify({ match_score: matchScore }))
    .query(`
      INSERT INTO app.work_event (event_name, payload_json, item_type, item_id, org_id)
      VALUES ('spotlight.evaluated', @payload, 'spotlight', @spotlightId, @orgId)
    `);

  ok(res, {
    match_score: matchScore,
    matched_fields: matched,
    total_fields: total,
    recommendation
  });
}));

/**
 * @openapi
 * /api/spotlights/{id}/score-components:
 *   get:
 *     summary: Get score components for a spotlight
 *     tags: [Spotlights]
 */
router.get('/:id/score-components', asyncHandler(async (req, res) => {
  const spotlightId = Number(req.params.id);
  const orgId = Number(req.query.org_id);

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  const r = await pool.request()
    .input('spotlightId', sql.BigInt, spotlightId)
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT ssc.*, sf.field_type, sf.is_required, sf.enum_values
      FROM app.spotlight_score_components ssc
      LEFT JOIN app.spotlight_fields sf ON ssc.component_name = sf.field_name AND ssc.org_id = sf.org_id
      WHERE ssc.spotlight_id = @spotlightId AND ssc.org_id = @orgId
      ORDER BY ssc.component_name
    `);

  ok(res, r.recordset);
}));

/**
 * @openapi
 * /api/spotlights/{id}/score-components:
 *   post:
 *     summary: Add score component to spotlight
 *     tags: [Spotlights]
 */
router.post('/:id/score-components', asyncHandler(async (req, res) => {
  const spotlightId = Number(req.params.id);
  const { org_id, component_name, component_weight, max_possible_score } = req.body;

  if (!org_id || !component_name) return badRequest(res, 'org_id and component_name required');

  const pool = await getPool();
  const r = await pool.request()
    .input('spotlightId', sql.BigInt, spotlightId)
    .input('orgId', sql.Int, org_id)
    .input('componentName', sql.NVarChar(255), component_name)
    .input('componentWeight', sql.Decimal(5,2), component_weight || 1.0)
    .input('maxPossibleScore', sql.Decimal(5,2), max_possible_score || 1.0)
    .query(`
      INSERT INTO app.spotlight_score_components 
      (org_id, item_type, item_id, spotlight_id, component_name, component_score, component_weight, component_reason, max_possible_score, algorithm_version)
      VALUES (@orgId, 'spotlight', @spotlightId, @spotlightId, @componentName, 0, @componentWeight, 'Component added', @maxPossibleScore, 'v1.0')
    `);

  ok(res, { message: 'Score component added successfully' });
}));

/**
 * @openapi
 * /api/spotlights/{id}/performance:
 *   get:
 *     summary: Get spotlight performance metrics
 *     tags: [Spotlights]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 */
router.get('/:id/performance', asyncHandler(async (req, res) => {
  const spotlightId = Number(req.params.id);
  const orgId = Number(req.query.org_id);

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  
  // Get basic spotlight info
  const spotlightResult = await pool.request()
    .input('spotlightId', sql.BigInt, spotlightId)
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT s.spotlight_id, s.name, s.domain, s.active,
             COUNT(DISTINCT sv.field_id) as configured_fields,
             COUNT(DISTINCT CASE WHEN sv.field_value IS NOT NULL THEN sv.field_id END) as populated_fields
      FROM app.spotlights s
      LEFT JOIN app.spotlight_values sv ON s.spotlight_id = sv.spotlight_id
      WHERE s.spotlight_id = @spotlightId AND s.org_id = @orgId
      GROUP BY s.spotlight_id, s.name, s.domain, s.active
    `);

  if (spotlightResult.recordset.length === 0) return notFound(res, 'Spotlight not found');

  const spotlight = spotlightResult.recordset[0];

  // Get evaluation history (from work_event)
  const evaluationResult = await pool.request()
    .input('spotlightId', sql.BigInt, spotlightId)
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT TOP 10 
             JSON_VALUE(payload_json, '$.match_score') as match_score,
             happened_at
      FROM app.work_event
      WHERE item_type = 'spotlight' 
        AND item_id = @spotlightId 
        AND org_id = @orgId
        AND event_name = 'spotlight.evaluated'
      ORDER BY happened_at DESC
    `);

  const evaluations = evaluationResult.recordset.map(row => ({
    match_score: parseFloat(row.match_score) || 0,
    evaluated_at: row.happened_at
  }));

  // Calculate performance metrics
  const avgMatchScore = evaluations.length > 0 
    ? evaluations.reduce((sum, e) => sum + e.match_score, 0) / evaluations.length 
    : 0;

  const completionRate = spotlight.configured_fields > 0 
    ? (spotlight.populated_fields / spotlight.configured_fields) * 100 
    : 0;

  ok(res, {
    spotlight_id: spotlight.spotlight_id,
    name: spotlight.name,
    domain: spotlight.domain,
    active: spotlight.active,
    performance: {
      completion_rate: Math.round(completionRate * 100) / 100,
      average_match_score: Math.round(avgMatchScore * 100) / 100,
      total_evaluations: evaluations.length,
      configured_fields: spotlight.configured_fields,
      populated_fields: spotlight.populated_fields
    },
    recent_evaluations: evaluations
  });
}));

/**
 * @openapi
 * /api/spotlights/{id}:
 *   delete:
 *     summary: Delete a spotlight
 *     tags: [Spotlights]
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const spotlightId = Number(req.params.id);
  const orgId = Number(req.query.org_id);

  if (!orgId) return badRequest(res, 'org_id required');
  if (!Number.isInteger(spotlightId) || spotlightId <= 0) return badRequest(res, 'id must be a positive integer');

  const pool = await getPool();

  // Remove any spotlight values first
  await pool.request()
    .input('spotlightId', sql.BigInt, spotlightId)
    .input('orgId', sql.Int, orgId)
    .query(`DELETE FROM app.spotlight_values WHERE spotlight_id = @spotlightId AND org_id = @orgId`);

  // Delete the spotlight itself
  const r = await pool.request()
    .input('spotlightId', sql.BigInt, spotlightId)
    .input('orgId', sql.Int, orgId)
    .query(`DELETE FROM app.spotlights WHERE spotlight_id = @spotlightId AND org_id = @orgId`);

  if (r.rowsAffected[0] === 0) return notFound(res, 'Spotlight not found');

  await emitSpotlightEvent('spotlight.deleted', { spotlight_id: spotlightId, org_id: orgId });

  ok(res, { deleted: r.rowsAffected[0] });
}));

// Helper functions
function matchesCriteria(signalValue: any, spotlightValue: any, fieldType: string): boolean {
  if (!signalValue || !spotlightValue) return false;
  
  switch (fieldType) {
    case 'text':
      return String(signalValue).toLowerCase().includes(String(spotlightValue).toLowerCase());
    case 'number':
      return Number(signalValue) === Number(spotlightValue);
    case 'boolean':
      return Boolean(signalValue) === Boolean(spotlightValue);
    case 'enum':
      return String(signalValue) === String(spotlightValue);
    case 'date':
      return new Date(signalValue).getTime() === new Date(spotlightValue).getTime();
    default:
      return false;
  }
}

function getRecommendation(score: number): string {
  if (score >= 0.8) return 'high_match';
  if (score >= 0.6) return 'medium_match';
  if (score >= 0.4) return 'low_match';
  return 'no_match';
}

export default router;