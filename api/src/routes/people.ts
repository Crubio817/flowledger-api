import { Router, Request, Response } from 'express';
import { asyncHandler, ok, badRequest } from '../utils/http';
import { createAssignmentHandler, updateAssignmentHandler } from '../api/people/assignmentHandler';
import { FitScoreCalculator } from '../services/people/fitScore';
import { RateResolver } from '../services/people/rateResolver';
import { getPool, sql } from '../db/pool';

const router = Router();
const fitScore = new FitScoreCalculator();
const rateResolver = new RateResolver();

/**
 * @openapi
 * /api/staffing-requests/{id}/rank:
 *   post:
 *     summary: Rank candidates for a staffing request
 *     tags: [People]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: include_rate_preview
 *         schema: { type: boolean, default: true }
 *     responses:
 *       200:
 *         description: Ranked candidates with optional rate preview
 */
router.post('/staffing-requests/:id/rank', asyncHandler(async (req: Request, res: Response) => {
  const orgId = Number(req.query.org_id);
  const requestId = Number(req.params.id);
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const includeRate = String(req.query.include_rate_preview ?? 'true') === 'true';

  if (!orgId || !requestId) return badRequest(res, 'org_id and staffing request id required');

  const ranked = await fitScore.calculateForRequest({ org_id: orgId, staffing_request_id: requestId, limit });

  if (includeRate) {
    for (const fit of ranked) {
      try {
        const r = await rateResolver.resolve({ org_id: orgId, person_id: fit.person_id, engagement_id: undefined, as_of_date: new Date() });
        (fit as any).modeled_rate = {
          currency: r.final_currency,
          base: r.base_amount,
          abs_premiums: r.premiums.absolute,
          pct_premiums: r.premiums.percentage,
          scarcity: r.scarcity_multiplier,
          total: r.final_amount,
          override_source: r.precedence_applied
        };
      } catch {
        (fit as any).modeled_rate = null;
      }
    }
  }

  return require('../utils/http').listOk(res, ranked, { page: 1, limit, total: ranked.length });
}));

/**
 * @openapi
 * /api/assignments:
 *   post:
 *     summary: Create assignment with rate snapshot
 *     tags: [People]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       201:
 *         description: Assignment created
 */
router.post('/assignments', asyncHandler(createAssignmentHandler));

/**
 * @openapi
 * /api/assignments/{assignment_id}:
 *   patch:
 *     summary: Update assignment (non-snapshot fields)
 *     tags: [People]
 *     parameters:
 *       - in: path
 *         name: assignment_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200:
 *         description: Assignment updated
 *   delete:
 *     summary: Cancel assignment
 *     tags: [People]
 *     parameters:
 *       - in: path
 *         name: assignment_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Assignment cancelled
 */
router.patch('/assignments/:assignment_id', asyncHandler(updateAssignmentHandler));

// Alias to support /assignments/:id
router.patch('/assignments/:id', asyncHandler(async (req, res) => {
  (req as any).params.assignment_id = req.params.id;
  return updateAssignmentHandler(req, res);
}));

router.delete('/assignments/:assignment_id', asyncHandler(async (req, res) => {
  const assignmentId = Number(req.params.assignment_id);
  if (!assignmentId) return badRequest(res, 'assignment_id required');
  const pool = await getPool();
  const result = await pool.request()
    .input('assignmentId', sql.BigInt, assignmentId)
    .query(`
      UPDATE app.assignment
      SET status = 'cancelled', updated_at = SYSUTCDATETIME()
      WHERE assignment_id = @assignmentId;
      SELECT assignment_id, status FROM app.assignment WHERE assignment_id = @assignmentId;
    `);
  if (result.recordset.length === 0) return res.status(404).json({ error: 'Assignment not found' });
  ok(res, result.recordset[0]);
}));

router.delete('/assignments/:id', asyncHandler(async (req, res) => {
  (req as any).params.assignment_id = req.params.id;
  const assignmentId = Number(req.params.assignment_id);
  if (!assignmentId) return badRequest(res, 'assignment_id required');
  const pool = await getPool();
  const result = await pool.request()
    .input('assignmentId', sql.BigInt, assignmentId)
    .query(`
      UPDATE app.assignment
      SET status = 'cancelled', updated_at = SYSUTCDATETIME()
      WHERE assignment_id = @assignmentId;
      SELECT assignment_id, status FROM app.assignment WHERE assignment_id = @assignmentId;
    `);
  if (result.recordset.length === 0) return res.status(404).json({ error: 'Assignment not found' });
  ok(res, result.recordset[0]);
}));

/**
 * @openapi
 * /api/rates/preview:
 *   get:
 *     summary: Resolve effective rate with breakdown
 *     tags: [People]
 *     parameters:
 *       - in: query
 *         name: org_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: role_template_id
 *         schema: { type: integer }
 *       - in: query
 *         name: level
 *         schema: { type: string }
 *       - in: query
 *         name: skills
 *         schema: { type: string, description: 'Comma-separated skill IDs' }
 *       - in: query
 *         name: engagement_id
 *         schema: { type: integer }
 *       - in: query
 *         name: client_id
 *         schema: { type: integer }
 *       - in: query
 *         name: person_id
 *         schema: { type: integer }
 *       - in: query
 *         name: target_currency
 *         schema: { type: string }
 *       - in: query
 *         name: as_of
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Rate preview
 */
router.get('/rates/preview', asyncHandler(async (req: Request, res: Response) => {
  const orgId = Number(req.query.org_id);
  if (!orgId) return badRequest(res, 'org_id required');

  const skills = typeof req.query.skills === 'string' && req.query.skills.length
    ? (req.query.skills as string).split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n))
    : undefined;

  const result = await rateResolver.resolve({
    org_id: orgId,
    role_template_id: req.query.role_template_id ? Number(req.query.role_template_id) : undefined,
    level: req.query.level as string | undefined,
    skills,
    engagement_id: req.query.engagement_id ? Number(req.query.engagement_id) : undefined,
    client_id: req.query.client_id ? Number(req.query.client_id) : undefined,
    person_id: req.query.person_id ? Number(req.query.person_id) : undefined,
    target_currency: req.query.target_currency as string | undefined,
    as_of_date: req.query.as_of ? new Date(String(req.query.as_of)) : new Date()
  });

  res.json(result);
}));

export default router;
