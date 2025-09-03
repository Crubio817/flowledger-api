import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { AuditCreateBody, AuditUpdateBody } from '../validation/schemas';
import { logActivity } from '../utils/activity';

const router = Router();

// Do not cache audit columns across requests. The DB schema can change (migrations),
// and caching INFORMATION_SCHEMA results can cause stale-column errors like
// "Invalid column name 'client_id'" when code builds queries using the old schema.
async function getAuditColumns(): Promise<Set<string>> {
  const pool = await getPool();
  const r = await pool.request()
    .input('schema', sql.NVarChar(128), 'app')
    .input('table', sql.NVarChar(128), 'audits')
    .query(`SELECT column_name FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = @schema AND table_name = @table`);
  return new Set(r.recordset.map((r: any) => (r.COLUMN_NAME || r.column_name)));
}

function colOrNull(cols: Set<string>, name: string) {
  return cols.has(name) ? name : `NULL AS ${name}`;
}

async function clientExists(clientId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, clientId).query(
    `SELECT client_id FROM app.clients WHERE client_id = @id`
  );
  return r.recordset.length > 0;
}

// Normalize audit row fields to ensure numeric IDs and numeric percent_complete where present.
function normalizeAuditRow(row: any) {
  if (!row) return row;
  const toNum = (k: string) => {
    if (row[k] !== undefined && row[k] !== null && typeof row[k] !== 'number') {
      const n = Number(row[k]);
      if (!Number.isNaN(n)) row[k] = n;
    }
  };
  toNum('audit_id');
  toNum('engagement_id');
  toNum('client_id');
  toNum('path_id');
  toNum('current_step_id');
  toNum('owner_contact_id');
  if (row.percent_complete !== undefined && row.percent_complete !== null) {
    const p = Number(row.percent_complete);
    if (!Number.isNaN(p)) row.percent_complete = p;
  }
  return row;
}

async function engagementExists(engagementId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, engagementId).query(
    `SELECT engagement_id FROM app.client_engagements WHERE engagement_id = @id`
  );
  return r.recordset.length > 0;
}

async function pathExists(pathId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, pathId).query(
    `SELECT path_id FROM app.path_templates WHERE path_id = @id`
  );
  return r.recordset.length > 0;
}

async function contactExists(contactId: number) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, contactId).query(
    `SELECT contact_id FROM app.client_contacts WHERE contact_id = @id`
  );
  return r.recordset.length > 0;
}

/**
 * @openapi
 * /api/audits:
 *   get:
 *     summary: List audits
 *     tags: [Audits]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Audits list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       audit_id: { type: integer }
 *                       engagement_id: { type: integer }
 *                       client_id: { type: integer }
 *                       title: { type: string }
 *                       scope: { type: string, nullable: true }
 *                       status: { type: string }
 *                       state: { type: string }
 *                       percent_complete: { type: number }
 *                       created_utc: { type: string, format: date-time }
 *                       updated_utc: { type: string, format: date-time }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Support listing by engagement via stored procedure, else fall back to table scan with pagination
    const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const pool = await getPool();
    const engagementId = req.query.engagement_id ? Number(req.query.engagement_id) : undefined;
    const clientId = req.query.client_id ? Number(req.query.client_id) : undefined;
    // Fast-path: if client_id provided, prefer stored proc sp_audit_list_by_client else table WHERE
    if (clientId && Number.isInteger(clientId) && clientId > 0) {
      try {
        const sp = await pool.request().input('client_id', sql.Int, clientId).input('offset', sql.Int, offset).input('limit', sql.Int, limit).execute('app.sp_audit_list_by_client');
        const rows = (sp.recordset || []).map(normalizeAuditRow);
        listOk(res, rows, { page, limit });
        return;
      } catch {
        // Stored proc may not exist; fall through to WHERE-based query below
        const cols = await getAuditColumns();
        const select = [
          colOrNull(cols, 'audit_id'),
          colOrNull(cols, 'engagement_id'),
          colOrNull(cols, 'client_id'),
          colOrNull(cols, 'title'),
          colOrNull(cols, 'scope'),
          colOrNull(cols, 'status'),
          colOrNull(cols, 'percent_complete'),
          colOrNull(cols, 'state'),
          colOrNull(cols, 'domain'),
          colOrNull(cols, 'audit_type'),
          colOrNull(cols, 'path_id'),
          colOrNull(cols, 'current_step_id'),
          colOrNull(cols, 'start_utc'),
          colOrNull(cols, 'end_utc'),
          colOrNull(cols, 'owner_contact_id'),
          colOrNull(cols, 'notes'),
          colOrNull(cols, 'created_utc'),
          colOrNull(cols, 'updated_utc')
        ].join(', ');
        const order = cols.has('audit_id') ? 'audit_id' : (cols.has('created_utc') ? 'created_utc' : '1');
        const result = await pool.request().input('client_id', sql.Int, clientId).input('offset', sql.Int, offset).input('limit', sql.Int, limit).query(`SELECT ${select} FROM app.audits WHERE client_id = @client_id ORDER BY ${order} OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
        const rows = (result.recordset || []).map(normalizeAuditRow);
        listOk(res, rows, { page, limit });
        return;
      }
    }
    if (engagementId && Number.isInteger(engagementId) && engagementId > 0) {
      // Call stored procedure that returns audits for an engagement
  const sp = await pool.request().input('engagement_id', sql.Int, engagementId).input('offset', sql.Int, offset).input('limit', sql.Int, limit).execute('app.sp_audit_list_by_engagement');
  const rows = (sp.recordset || []).map(normalizeAuditRow);
  listOk(res, rows, { page, limit });
      return;
    }

    // Fallback: return paginated audits from table (schema-aware)
    const cols = await getAuditColumns();
    const select = [
      colOrNull(cols, 'audit_id'),
  colOrNull(cols, 'engagement_id'),
      colOrNull(cols, 'client_id'),
      colOrNull(cols, 'title'),
      colOrNull(cols, 'scope'),
      colOrNull(cols, 'status'),
  colOrNull(cols, 'percent_complete'),
      colOrNull(cols, 'state'),
      colOrNull(cols, 'domain'),
      colOrNull(cols, 'audit_type'),
      colOrNull(cols, 'path_id'),
      colOrNull(cols, 'current_step_id'),
      colOrNull(cols, 'start_utc'),
      colOrNull(cols, 'end_utc'),
      colOrNull(cols, 'owner_contact_id'),
      colOrNull(cols, 'notes'),
      colOrNull(cols, 'created_utc'),
      colOrNull(cols, 'updated_utc')
    ].join(', ');

    const result = await pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(`SELECT ${select} FROM app.audits ORDER BY ${cols.has('audit_id') ? 'audit_id' : (cols.has('created_utc') ? 'created_utc' : '1')} OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  const rows = (result.recordset || []).map(normalizeAuditRow);
  listOk(res, rows, { page, limit });
  })
);

// Temporarily commented out to fix YAML parsing errors
// /**
//  * @openapi
//  * /api/audits/{audit_id}:
//  *   get:
//  *     summary: "Get audit by id"
//  *     tags: [Audits]
//  *     parameters:
//  *       - in: path
//  *         name: audit_id
//  *         required: true
//  *         schema: { type: integer }
//  *     responses:
//  *       200:
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 status: { type: string, enum: [ok] }
//  *                 data:
//  *                   type: object
//  *                   properties:
//  *                     audit_id: { type: integer }
//  *                     engagement_id: { type: integer }
//  *                     client_id: { type: integer }
//  *                     title: { type: string }
//  *                     scope: { type: string, nullable: true }
//  *                     status: { type: string }
//  *                     state: { type: string }
//  *                     percent_complete: { type: number }
//  *                     created_utc: { type: string, format: date-time }
//  *                     updated_utc: { type: string, format: date-time }
//  *   put:
//  *     summary: Update audit
//  *     tags: [Audits]
//  *     parameters:
//  *       - in: path
//  *         name: audit_id
//  *         required: true
//  *         schema: { type: integer }
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 title: { type: string }
//  *                 scope: { type: string, nullable: true }
//  *                 status: { type: string }
//  *   delete:
//  *     summary: Delete audit
//  *     tags: [Audits]
//  *     parameters:
//  *       - in: path
//  *         name: audit_id
//  *         required: true
//  *         schema: { type: integer }
//  *     responses:
//  *       200:
//  *         description: Deleted
//  */
router.get(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (!Number.isInteger(auditId) || auditId <= 0) return badRequest(res, 'audit_id must be a positive integer');
    const pool = await getPool();
    // Prefer stored procedure to fetch audit header + step progress. Fall back to table if SP missing.
    try {
      const sp = await pool.request().input('audit_id', sql.Int, auditId).execute('app.sp_audit_get');
      // sp.recordsets: first recordset header, second recordset progress rows (if the proc returns multiple sets)
      const spAny: any = sp;
      const header = (spAny.recordsets && spAny.recordsets[0] && spAny.recordsets[0][0]) || null;
      const steps = (spAny.recordsets && spAny.recordsets[1]) || [];
      if (!header) return notFound(res);
      ok(res, { header: normalizeAuditRow(header), steps });
      return;
    } catch (e) {
      // If stored proc not found or fails, fall back to direct select
      const cols = await getAuditColumns();
      const select = [
        colOrNull(cols, 'audit_id'),
  colOrNull(cols, 'engagement_id'),
        colOrNull(cols, 'client_id'),
        colOrNull(cols, 'title'),
        colOrNull(cols, 'scope'),
        colOrNull(cols, 'status'),
  colOrNull(cols, 'percent_complete'),
        colOrNull(cols, 'state'),
        colOrNull(cols, 'domain'),
        colOrNull(cols, 'audit_type'),
        colOrNull(cols, 'path_id'),
        colOrNull(cols, 'current_step_id'),
        colOrNull(cols, 'start_utc'),
        colOrNull(cols, 'end_utc'),
        colOrNull(cols, 'owner_contact_id'),
        colOrNull(cols, 'notes'),
        colOrNull(cols, 'created_utc'),
        colOrNull(cols, 'updated_utc')
      ].join(', ');
      const result = await pool.request().input('id', sql.BigInt, auditId).query(`SELECT ${select} FROM app.audits WHERE ${cols.has('audit_id') ? 'audit_id = @id' : '1=0'}`);
      const row = result.recordset[0];
      if (!row) return notFound(res);
      ok(res, { header: normalizeAuditRow(row), steps: [] });
      return;
    }
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = AuditCreateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i => i.message).join('; '));
    const data = parsed.data;
    const pool = await getPool();

    // Validate referenced engagement first to avoid FK errors from the DB
    const engagementId = (data as any).engagement_id;
    if (engagementId !== undefined && engagementId !== null && !(await engagementExists(engagementId))) return badRequest(res, 'engagement_id does not exist');

    // Validate contact; for path we will attempt the proc even if local check fails and let DB enforce
    const pathIdRaw = (data as any).path_id;
    const pathId = (pathIdRaw === undefined || pathIdRaw === null) ? null : Number(pathIdRaw);
    if (Number.isNaN(pathId as any)) return badRequest(res, 'path_id must be a number when provided');
    if ((data as any).owner_contact_id !== undefined && (data as any).owner_contact_id !== null && !(await contactExists((data as any).owner_contact_id))) return badRequest(res, 'owner_contact_id does not exist');
    if (pathId !== null) {
      console.log(`[audits] create request with path_id=${pathId}, engagement_id=${engagementId}, client_id=${(data as any).client_id}`);
    }
    const ownerContactId = (data as any).owner_contact_id;
    if (ownerContactId !== undefined && ownerContactId !== null && !(await contactExists(ownerContactId))) return badRequest(res, 'owner_contact_id does not exist');

    // If path_id is provided, use sp_audit_set_path_initialize for creation and seeding
    if (pathId !== null) {
      try {
        const clientId = (data as any).client_id ?? null;
        const ownerContactId = (data as any).owner_contact_id ?? null;
        const domain = (data as any).domain ?? null;
        const title = data.title;
        console.log(`[audits] invoking sp_audit_set_path_initialize path_id=${pathId} engagement_id=${engagementId} client_id=${clientId}`);
        const sp = await pool.request()
          .input('audit_id', sql.BigInt, null) // NULL to indicate creation
          .input('engagement_id', sql.BigInt, engagementId ?? null)
          .input('client_id', sql.BigInt, clientId)
          .input('title', sql.NVarChar(200), title)
          .input('domain', sql.NVarChar(50), domain)
          .input('owner_contact_id', sql.Int, ownerContactId)
          .input('path_id', sql.Int, pathId)
          .execute('app.sp_audit_set_path_initialize');

        // sp returns two result sets: first is audit header, second is steps
        const spAny: any = sp;
        const header = (spAny.recordsets && spAny.recordsets[0] && spAny.recordsets[0][0]) || null;
        let steps = (spAny.recordsets && spAny.recordsets[1]) || [];

        normalizeAuditRow(header);
        if (header && header.audit_id) res.setHeader('Location', `/audits/${header.audit_id}`);
        // If for some reason the proc did not return steps, do a quick fetch to include in response
        if (header?.audit_id && (!steps || steps.length === 0) && pathId !== null) {
          try {
            const rs = await pool.request()
              .input('aid', sql.BigInt, header.audit_id)
              .query(`SELECT ps.step_id, ps.path_id, ps.seq, ps.title, ps.state_gate, ps.required, ps.agent_key,
                             ps.input_contract, ps.output_contract, ps.created_utc,
                             asp.status, asp.started_utc, asp.completed_utc, asp.output_json, asp.notes,
                             asp.created_utc AS progress_created_utc, asp.updated_utc AS progress_updated_utc
                      FROM app.path_steps ps
                      LEFT JOIN app.audit_step_progress asp ON asp.step_id = ps.step_id AND asp.audit_id = @aid
                      WHERE ps.path_id = ${pathId}
                      ORDER BY ps.seq`);
            steps = rs.recordset || [];
          } catch {}
        }
        await logActivity({ type: 'AuditCreated', title: `Audit ${data.title} created`, audit_id: header?.audit_id, client_id: null });
        ok(res, { header, steps }, 201);
        return;
      } catch (e: any) {
        console.error('[audits] sp_audit_set_path_initialize failed:', e?.message || e);
        badRequest(res, e?.message || 'Failed to create audit with path (proc error)');
        return;
      }
    }

    // No path_id: plain INSERT
    const cols = await getAuditColumns();
    const title = data.title;
    const scope = data.scope ?? null;
    const status = data.status ?? null;
    const state = data.state ?? null;
    const domain = data.domain ?? null;
    const audit_type = data.audit_type ?? null;
    const current_step_id = data.current_step_id ?? null;
    const start_utc = data.start_utc ?? null;
    const end_utc = data.end_utc ?? null;
    const notes = data.notes ?? null;

    const insertCols: string[] = [];
    const insertVals: string[] = [];
    const request = pool.request();
    // Ensure engagement_id is included in INSERT when available (table requires it)
    if (cols.has('engagement_id')) { insertCols.push('engagement_id'); insertVals.push('@engagement_id'); request.input('engagement_id', sql.BigInt, engagementId ?? null); }

    if (cols.has('title')) { insertCols.push('title'); insertVals.push('@title'); request.input('title', sql.NVarChar(200), title); }
    if (cols.has('scope')) { insertCols.push('scope'); insertVals.push('@scope'); request.input('scope', sql.NVarChar(1000), scope); }
    if (cols.has('phase')) { insertCols.push('phase'); insertVals.push('COALESCE(@status, N\'InProgress\')'); request.input('status', sql.NVarChar(40), status); }
    if (cols.has('state')) { insertCols.push('state'); insertVals.push('@state'); request.input('state', sql.NVarChar(30), state); }
    if (cols.has('domain')) { insertCols.push('domain'); insertVals.push('@domain'); request.input('domain', sql.NVarChar(50), domain); }
    if (cols.has('audit_type')) { insertCols.push('audit_type'); insertVals.push('@audit_type'); request.input('audit_type', sql.NVarChar(80), audit_type); }
    if (cols.has('current_step_id')) { insertCols.push('current_step_id'); insertVals.push('@current_step_id'); request.input('current_step_id', sql.Int, current_step_id); }
    if (cols.has('start_utc')) { insertCols.push('start_utc'); insertVals.push('@start_utc'); request.input('start_utc', sql.DateTime2, start_utc); }
    if (cols.has('end_utc')) { insertCols.push('end_utc'); insertVals.push('@end_utc'); request.input('end_utc', sql.DateTime2, end_utc); }
    if (cols.has('owner_contact_id')) { insertCols.push('owner_contact_id'); insertVals.push('@owner_contact_id'); request.input('owner_contact_id', sql.Int, ownerContactId); }
    if (cols.has('notes')) { insertCols.push('notes'); insertVals.push('@notes'); request.input('notes', sql.NVarChar(sql.MAX), notes); }

    await request.query(`INSERT INTO app.audits (${insertCols.join(',')}) VALUES (${insertVals.join(',')})`);
    const read = await pool.request().query(`SELECT ${[
      colOrNull(cols,'audit_id'), colOrNull(cols,'engagement_id'),
      colOrNull(cols,'title'), colOrNull(cols,'scope'), colOrNull(cols,'phase'), colOrNull(cols,'percent_complete'), colOrNull(cols,'state'), colOrNull(cols,'domain'), colOrNull(cols,'audit_type'), colOrNull(cols,'path_id'), colOrNull(cols,'current_step_id'), colOrNull(cols,'start_utc'), colOrNull(cols,'end_utc'), colOrNull(cols,'owner_contact_id'), colOrNull(cols,'notes'),
      colOrNull(cols,'created_utc'), colOrNull(cols,'updated_utc')
    ].join(', ')} FROM app.audits WHERE audit_id = SCOPE_IDENTITY()`);
    const created = read.recordset[0];
    normalizeAuditRow(created);
    if (created && created.audit_id) res.setHeader('Location', `/audits/${created.audit_id}`);
    await logActivity({ type: 'AuditCreated', title: `Audit ${title} created`, audit_id: created?.audit_id, client_id: null });
    ok(res, { header: created, steps: [] }, 201);
  })
);

// Set or change path for an audit (initialize first step) via stored procedure
router.put(
  '/:audit_id/path',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (!Number.isInteger(auditId) || auditId <= 0) return badRequest(res, 'audit_id must be a positive integer');
    const pathId = req.body?.path_id;
    if (!Number.isInteger(pathId) || pathId <= 0) return badRequest(res, 'path_id must be a positive integer');
    const pool = await getPool();
    try {
      const sp = await pool.request().input('audit_id', sql.BigInt, auditId).input('path_id', sql.Int, pathId).execute('app.sp_audit_set_path_initialize');
      const spAny: any = sp;
      const header = (spAny.recordsets && spAny.recordsets[0] && spAny.recordsets[0][0]) || null;
      const steps = (spAny.recordsets && spAny.recordsets[1]) || [];
      if (!header) return notFound(res);
      ok(res, { header: normalizeAuditRow(header), steps });
    } catch (e: any) {
      badRequest(res, e?.message || 'Failed to set path');
    }
  })
);

// Upsert step progress
router.post(
  '/:audit_id/progress',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (!Number.isInteger(auditId) || auditId <= 0) return badRequest(res, 'audit_id must be a positive integer');
    const { step_id, status, output_json, notes } = req.body || {};
    if (!Number.isInteger(step_id) || step_id <= 0) return badRequest(res, 'step_id must be a positive integer');
    const pool = await getPool();
    try {
      const sp = await pool.request()
        .input('audit_id', sql.Int, auditId)
        .input('step_id', sql.Int, step_id)
        .input('status', sql.NVarChar(30), status)
        .input('output_json', sql.NVarChar(sql.MAX), output_json)
        .input('notes', sql.NVarChar(sql.MAX), notes)
        .execute('app.sp_audit_progress_upsert');
      ok(res, sp.recordset && sp.recordset[0] ? sp.recordset[0] : { success: true });
    } catch (e: any) {
      badRequest(res, e?.message || 'Failed to upsert progress');
    }
  })
);

// Mark step done and advance
router.post(
  '/:audit_id/advance-step',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (!Number.isInteger(auditId) || auditId <= 0) return badRequest(res, 'audit_id must be a positive integer');
    const { step_id, advance } = req.body || {};
    if (!Number.isInteger(step_id) || step_id <= 0) return badRequest(res, 'step_id must be a positive integer');
    const pool = await getPool();
    try {
      const sp = await pool.request().input('audit_id', sql.Int, auditId).input('step_id', sql.Int, step_id).input('advance', sql.Bit, !!advance).execute('app.sp_audit_mark_step_done_and_advance');
      ok(res, sp.recordset && sp.recordset[0] ? sp.recordset[0] : { success: true });
    } catch (e: any) {
      badRequest(res, e?.message || 'Failed to advance step');
    }
  })
);

// Advance directly to a step
router.post(
  '/:audit_id/advance-to-step',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (!Number.isInteger(auditId) || auditId <= 0) return badRequest(res, 'audit_id must be a positive integer');
    const { step_id } = req.body || {};
    if (!Number.isInteger(step_id) || step_id <= 0) return badRequest(res, 'step_id must be a positive integer');
    const pool = await getPool();
    try {
      const sp = await pool.request().input('audit_id', sql.Int, auditId).input('step_id', sql.Int, step_id).execute('app.sp_audit_advance_to_step');
      ok(res, sp.recordset && sp.recordset[0] ? sp.recordset[0] : { success: true });
    } catch (e: any) {
      badRequest(res, e?.message || 'Failed to advance to step');
    }
  })
);

// Recalculate percent complete
router.post(
  '/:audit_id/recalc-percent',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (!Number.isInteger(auditId) || auditId <= 0) return badRequest(res, 'audit_id must be a positive integer');
    const pool = await getPool();
    try {
      const sp = await pool.request().input('audit_id', sql.Int, auditId).execute('app.sp_audit_percent_recalc');
      ok(res, sp.recordset && sp.recordset[0] ? sp.recordset[0] : { success: true });
    } catch (e: any) {
      badRequest(res, e?.message || 'Failed to recalc percent');
    }
  })
);

router.put(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (!Number.isInteger(auditId) || auditId <= 0) return badRequest(res, 'audit_id must be a positive integer');
    const parsed = AuditUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const data = parsed.data;
  const sets: string[] = [];
  const pool = await getPool();
  const cols = await getAuditColumns();
  const request = pool.request().input('id', sql.Int, auditId);
  if (data.title !== undefined && cols.has('title')) { sets.push('title = @title'); request.input('title', sql.NVarChar(200), data.title); }
  if (data.scope !== undefined && cols.has('scope')) { sets.push('scope = @scope'); request.input('scope', sql.NVarChar(1000), data.scope); }
  if (data.status !== undefined && cols.has('phase')) { sets.push('phase = @status'); request.input('status', sql.NVarChar(40), data.status); }
  if (data.state !== undefined && cols.has('state')) { sets.push('state = @state'); request.input('state', sql.NVarChar(30), data.state); }
  if (data.domain !== undefined && cols.has('domain')) { sets.push('domain = @domain'); request.input('domain', sql.NVarChar(50), data.domain); }
  if (data.audit_type !== undefined && cols.has('audit_type')) { sets.push('audit_type = @audit_type'); request.input('audit_type', sql.NVarChar(80), data.audit_type); }
  if (data.path_id !== undefined && cols.has('path_id')) { sets.push('path_id = @path_id'); request.input('path_id', sql.Int, data.path_id); }
  if (data.current_step_id !== undefined && cols.has('current_step_id')) { sets.push('current_step_id = @current_step_id'); request.input('current_step_id', sql.Int, data.current_step_id); }
  if (data.start_utc !== undefined && cols.has('start_utc')) { sets.push('start_utc = @start_utc'); request.input('start_utc', sql.DateTime2, data.start_utc); }
  if (data.end_utc !== undefined && cols.has('end_utc')) { sets.push('end_utc = @end_utc'); request.input('end_utc', sql.DateTime2, data.end_utc); }
  if (data.owner_contact_id !== undefined && cols.has('owner_contact_id')) { sets.push('owner_contact_id = @owner_contact_id'); request.input('owner_contact_id', sql.Int, data.owner_contact_id); }
  if (data.notes !== undefined && cols.has('notes')) { sets.push('notes = @notes'); request.input('notes', sql.NVarChar(sql.MAX), data.notes); }
    if (!sets.length) return badRequest(res, 'No fields to update');
    sets.push('updated_utc = SYSUTCDATETIME()');
    const result = await request.query(`UPDATE app.audits SET ${sets.join(', ')} WHERE audit_id = @id`);
    if (result.rowsAffected[0] === 0) return notFound(res);
    const read = await pool.request().input('id', sql.Int, auditId).query(`SELECT ${[
      colOrNull(cols,'audit_id'), colOrNull(cols,'engagement_id'), colOrNull(cols,'client_id'),
      colOrNull(cols,'title'), colOrNull(cols,'scope'), colOrNull(cols,'status'), colOrNull(cols,'percent_complete'), colOrNull(cols,'state'), colOrNull(cols,'domain'), colOrNull(cols,'audit_type'), colOrNull(cols,'path_id'), colOrNull(cols,'current_step_id'), colOrNull(cols,'start_utc'), colOrNull(cols,'end_utc'), colOrNull(cols,'owner_contact_id'), colOrNull(cols,'notes'),
      colOrNull(cols,'created_utc'), colOrNull(cols,'updated_utc')
    ].join(', ')} FROM app.audits WHERE ${cols.has('audit_id') ? 'audit_id = @id' : '1=0'}`);
    const updated = read.recordset[0];
    normalizeAuditRow(updated);
    await logActivity({ type: 'AuditUpdated', title: `Audit ${auditId} updated`, audit_id: auditId, client_id: updated.client_id });
    ok(res, updated);
  })
);

router.delete(
  '/:audit_id',
  asyncHandler(async (req, res) => {
    const auditId = Number(req.params.audit_id);
    if (!Number.isInteger(auditId) || auditId <= 0) return badRequest(res, 'audit_id must be a positive integer');
    const pool = await getPool();
    try {
      const result = await pool.request().input('id', sql.Int, auditId).query(
        `DELETE FROM app.audits WHERE audit_id = @id`
      );
  if (result.rowsAffected[0] === 0) return notFound(res);
  await logActivity({ type: 'AuditDeleted', title: `Audit ${auditId} deleted`, audit_id: auditId });
  ok(res, { deleted: result.rowsAffected[0] });
    } catch (e: any) {
      res.status(409).json({ error: { code: 'Conflict', message: e?.message || 'Conflict' } });
    }
  })
);

export default router;
