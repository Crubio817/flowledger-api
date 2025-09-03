import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { ClientCreateBody, ClientUpdateBody, CreateProcBody, ClientSetupBody } from '../validation/schemas';
import { orchestrateClientSetup } from '../utils/clientSetup';
import { logActivity } from '../utils/activity';

const router = Router();

/**
 * @openapi
 * /api/clients:
 *   get:
 *     summary: List clients
 *     tags: [Clients]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Clients list
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
 *                       client_id: { type: integer }
 *                       name: { type: string }
 *                       is_active: { type: boolean }
 *                       created_utc: { type: string, format: date-time }
 *                 meta: { $ref: '#/components/schemas/PageMeta' }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
  const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
    const pool = await getPool();
    const result = await pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(
        `SELECT client_id, name, is_active, created_utc
         FROM app.clients
         ORDER BY client_id
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
    listOk(res, result.recordset, { page, limit });
  })
);

router.get(
  '/:client_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, clientId).query(
      `SELECT client_id, name, is_active, created_utc
       FROM app.clients WHERE client_id = @id`
    );
  const row = result.recordset[0];
  if (!row) return notFound(res);
    ok(res, row);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = ClientCreateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const { name, is_active = true } = parsed.data;
    const pool = await getPool();
    const result = await pool.request()
      .input('name', sql.NVarChar(200), name)
      .input('active', sql.Bit, is_active ? 1 : 0)
      .query(`
        INSERT INTO app.clients (name, is_active) 
        OUTPUT INSERTED.client_id, INSERTED.name, INSERTED.is_active, INSERTED.created_utc
        VALUES (@name, @active)
      `);
    const created = result.recordset[0];
    await logActivity({ type: 'ClientCreated', title: `Client ${name} created`, client_id: created.client_id });
    ok(res, created, 201);
  })
);

router.put(
  '/:client_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    const parsed = ClientUpdateBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const data = parsed.data;
    const sets: string[] = [];
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, clientId);
    if (data.name !== undefined) { sets.push('name = @name'); request.input('name', sql.NVarChar(200), data.name); }
    if (data.is_active !== undefined) { sets.push('is_active = @active'); request.input('active', sql.Bit, data.is_active ? 1 : 0); }
    if (!sets.length) return badRequest(res, 'No fields to update');
    const result = await request.query(`UPDATE app.clients SET ${sets.join(', ')} WHERE client_id = @id`);
    if (result.rowsAffected[0] === 0) return notFound(res);
    const read = await pool.request().input('id', sql.Int, clientId).query(`SELECT client_id, name, is_active, created_utc FROM app.clients WHERE client_id = @id`);
    const updated = read.recordset[0];
    await logActivity({ type: 'ClientUpdated', title: `Client ${clientId} updated`, client_id: clientId });
    ok(res, updated);
  })
);

router.delete(
  '/:client_id',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (!Number.isInteger(clientId) || clientId <= 0) return badRequest(res, 'client_id must be a positive integer');
    const pool = await getPool();
    try {
      const result = await pool.request().input('id', sql.Int, clientId).query(
        `DELETE FROM app.clients WHERE client_id = @id`
      );
  if (result.rowsAffected[0] === 0) return notFound(res);
  await logActivity({ type: 'ClientDeleted', title: `Client ${clientId} deleted`, client_id: clientId });
  ok(res, { deleted: result.rowsAffected[0] });
    } catch (e: any) {
      // Likely FK violation
      res.status(409).json({ error: { code: 'Conflict', message: e?.message || 'Conflict' } });
    }
  })
);

/**
 * @openapi
 * /api/clients/create-proc:
 *   post:
 *     summary: Create client via stored procedure sp_create_client
 *     description: Dynamically inspects parameters of app.sp_create_client and binds matching JSON body fields (strip leading @). Any OUTPUT params returned if present along with first recordset row.
 *     tags: [Clients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *             description: Keys must match stored procedure parameter names without the leading @ symbol.
 *     responses:
 *       200:
 *         description: Client created (procedure result)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     client: { type: object, additionalProperties: true }
 *                     proc_result: { type: object, additionalProperties: true }
 */
router.post(
  '/create-proc',
  asyncHandler(async (req, res) => {
    const parsed = CreateProcBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const pool = await getPool();
    // Introspect proc parameters
    const paramMeta = await pool.request().query(`
      SELECT p.name AS param_name, t.name AS type_name, p.max_length, p.is_output, p.has_default_value
      FROM sys.parameters p
      JOIN sys.procedures s ON p.object_id = s.object_id
      JOIN sys.schemas sc ON s.schema_id = sc.schema_id
      JOIN sys.types t ON p.user_type_id = t.user_type_id
      WHERE sc.name='app' AND s.name='sp_create_client'
      ORDER BY p.parameter_id`);
    const params = paramMeta.recordset as { param_name: string; type_name: string; max_length: number; is_output: boolean; has_default_value: boolean }[];
    if (!params.length) return badRequest(res, 'Stored procedure sp_create_client not found');
  const body = parsed.data as Record<string, unknown>;
    const request = pool.request();
    // Bind inputs
    // Bind inputs and outputs where possible so driver populates result.output
    for (const p of params) {
      const key = p.param_name.replace(/^@/, '');
      const typeName = p.type_name;
      // helper to map SQL type name -> mssql type
      const mapType = (tn: string) => {
        switch (tn) {
          case 'bit': return sql.Bit;
          case 'int': return sql.Int;
          case 'bigint': return sql.BigInt;
          case 'nvarchar': return p.max_length === -1 ? sql.NVarChar(sql.MAX) : sql.NVarChar(p.max_length);
          case 'varchar': return p.max_length === -1 ? sql.VarChar(sql.MAX) : sql.VarChar(p.max_length);
          case 'datetime2': return sql.DateTime2;
          case 'datetimeoffset': return sql.DateTimeOffset;
          default: return undefined as any;
        }
      };

      const mapped = mapType(typeName);
      if (p.is_output) {
        // register as output param if type known, otherwise register without explicit type
        if (mapped) request.output(key, mapped as any);
        else request.output(key, sql.NVarChar(sql.MAX));
        continue;
      }

      // requiredness check - be more lenient for stored procedure parameters
      // since they might have defaults even if metadata doesn't reflect it
      if (body[key] === undefined && !p.has_default_value) {
        // For known optional parameters, don't require them
        const optionalParams = ['PackCode', 'PrimaryContactId', 'OwnerUserId'];
        if (!optionalParams.includes(key)) {
          return badRequest(res, `Missing required field: ${key}`);
        }
      }

      if (body[key] !== undefined) {
        const val = body[key];
        if (typeName === 'bit') {
          request.input(key, sql.Bit, !!val ? 1 : 0);
        } else if (typeName === 'int' || typeName === 'bigint') {
          if (val === null || val === undefined || val === '') return badRequest(res, `Param ${key} must be number`);
          request.input(key, typeName === 'bigint' ? sql.BigInt : sql.Int, Number(val));
        } else if (typeName === 'nvarchar' || typeName === 'varchar') {
          // Special handling for PackCode: pass NULL if empty string
          if (key === 'PackCode' && (val === '' || val === null)) {
            request.input(key, mapped || sql.VarChar(p.max_length), null);
          } else {
            request.input(key, mapped || sql.NVarChar(p.max_length === -1 ? sql.MAX : p.max_length), String(val));
          }
        } else if (typeName === 'datetime2' || typeName === 'datetimeoffset') {
          request.input(key, mapped || sql.DateTime2, val as any);
        } else {
          request.input(key, body[key] as any);
        }
      }
    }
    // helper to (re)build a request from params and body, optionally skipping some keys
    const buildRequest = (skipKeys: string[] = []) => {
      const req = pool.request();
      for (const p of params) {
        const key = p.param_name.replace(/^@/, '');
        if (skipKeys.includes(key)) continue;
        const typeName = p.type_name;
        const mapped = (() => {
          switch (typeName) {
            case 'bit': return sql.Bit;
            case 'int': return sql.Int;
            case 'bigint': return sql.BigInt;
            case 'nvarchar': return p.max_length === -1 ? sql.NVarChar(sql.MAX) : sql.NVarChar(p.max_length);
            case 'varchar': return p.max_length === -1 ? sql.VarChar(sql.MAX) : sql.VarChar(p.max_length);
            case 'datetime2': return sql.DateTime2;
            case 'datetimeoffset': return sql.DateTimeOffset;
            default: return undefined as any;
          }
        })();

        if (p.is_output) {
          if (mapped) req.output(key, mapped as any);
          else req.output(key, sql.NVarChar(sql.MAX));
          continue;
        }

        if (body[key] === undefined && !p.has_default_value) {
          const optionalParams = ['PackCode', 'PrimaryContactId', 'OwnerUserId'];
          if (!optionalParams.includes(key)) {
            // don't throw here; let missing required params surface on execution if proc enforces them
          }
        }

        if (body[key] !== undefined) {
          const val = body[key];
          if (typeName === 'bit') {
            req.input(key, sql.Bit, !!val ? 1 : 0);
          } else if (typeName === 'int' || typeName === 'bigint') {
            req.input(key, typeName === 'bigint' ? sql.BigInt : sql.Int, val === null || val === undefined || val === '' ? null : Number(val));
          } else if (typeName === 'nvarchar' || typeName === 'varchar') {
            if (key === 'PackCode' && (val === '' || val === null)) {
              req.input(key, mapped || sql.VarChar(p.max_length), null);
            } else {
              req.input(key, mapped || sql.NVarChar(p.max_length === -1 ? sql.MAX : p.max_length), String(val));
            }
          } else if (typeName === 'datetime2' || typeName === 'datetimeoffset') {
            req.input(key, mapped || sql.DateTime2, val as any);
          } else {
            req.input(key, body[key] as any);
          }
        }
      }
      return req;
    };

    // Execute proc; if it fails due to PackCode incompatibility, retry without PackCode
    let result: any;
    try {
      const initialReq = buildRequest([]);
      result = await initialReq.execute('app.sp_create_client');
    } catch (procErr: any) {
      // If stored proc complains about PackCode incompatibility, try again without PackCode
      const msg = String(procErr?.message || '').toLowerCase();
      if ((procErr && procErr.code === 'EREQUEST') || msg.includes('packcode')) {
        try {
          const retryReq = buildRequest(['PackCode']);
          result = await retryReq.execute('app.sp_create_client');
        } catch (retryErr: any) {
          // rethrow the original or retry error to surface failure
          throw retryErr || procErr;
        }
      } else {
        throw procErr;
      }
    }
    let clientRow: any = null;

    // Include driver-populated output params in proc_result
    const proc_result: any = { recordset: result.recordset, returnValue: result.returnValue, output: result.output };

    // Try to infer client_id from multiple places: first recordset row, output params, returnValue
    const first = result.recordset && result.recordset[0];
    let clientId: any = first && (first.client_id || first.new_client_id || first.id);
    if (!clientId && result.output) {
      // common output names
      clientId = result.output.new_client_id || result.output.client_id || result.output.id;
    }
    if (!clientId && typeof result.returnValue === 'number') clientId = result.returnValue;
    if (typeof clientId === 'string' && /^\d+$/.test(clientId)) clientId = Number(clientId);

    // Choose appropriate SQL type for reading the client row
    if (typeof clientId === 'number') {
      // prefer bigint if metadata says so
      const idParamMeta = params.find(p => p.param_name.replace(/^@/, '') === 'client_id' || p.param_name.replace(/^@/, '') === 'new_client_id');
      const idSqlType = idParamMeta && idParamMeta.type_name === 'bigint' ? sql.BigInt : sql.Int;
      const read = await pool.request().input('id', idSqlType, clientId).query(`SELECT client_id, name, is_active, created_utc FROM app.clients WHERE client_id=@id`);
      clientRow = read.recordset[0] || null;
    }

    // If additional child arrays were provided in the request body, insert them now.
    // These are optional and best-effort; we wrap them in a transaction so either
    // all child inserts succeed or they are rolled back (the stored proc itself
    // may have already created the client and is not rolled back here).
    const childResults: any = {};
    try {
      let childTx: any = null;
      childTx = pool.transaction();
      await childTx.begin();
      const insertedContacts: any[] = [];

      // Helper to safely read arrays from body
      const takeArray = (k: string) => Array.isArray((body as any)[k]) ? (body as any)[k] as any[] : null;
      const contacts = takeArray('contacts');
      const notes = takeArray('notes');
      const locations = takeArray('locations');
      const tag_map = takeArray('client_tag_map');
      const socialProfiles = takeArray('contact_social_profiles');
      const industries = takeArray('client_industries');

      // Insert contacts and collect created rows
      if (contacts && contacts.length) {
        for (const c of contacts) {
          const req = childTx.request();
          req.input('client_id', sql.Int, clientId)
            .input('first_name', sql.NVarChar(100), c.first_name ?? null)
            .input('last_name', sql.NVarChar(100), c.last_name ?? null)
            .input('email', sql.NVarChar(200), c.email ?? null)
            .input('phone', sql.NVarChar(60), c.phone ?? null)
            .input('title', sql.NVarChar(200), c.title ?? null)
            .input('is_primary', sql.Bit, c.is_primary ? 1 : 0)
            .input('is_active', sql.Bit, c.is_active === undefined ? 1 : (c.is_active ? 1 : 0));
          const r = await req.query(`INSERT INTO app.client_contacts (client_id, first_name, last_name, email, phone, title, is_primary, is_active)
            OUTPUT INSERTED.contact_id, INSERTED.client_id, INSERTED.first_name, INSERTED.last_name, INSERTED.email, INSERTED.phone, INSERTED.title, INSERTED.is_primary, INSERTED.is_active, INSERTED.created_utc, INSERTED.updated_utc
            VALUES (@client_id, @first_name, @last_name, @email, @phone, @title, @is_primary, @is_active)`);
          insertedContacts.push(r.recordset[0]);
        }
        childResults.contacts = insertedContacts;
      }

      // Insert notes
      if (notes && notes.length) {
        const insertedNotes: any[] = [];
        for (const n of notes) {
          const req = childTx.request();
          req.input('client_id', sql.Int, clientId)
            .input('title', sql.NVarChar(200), n.title ?? null)
            .input('content', sql.NVarChar(sql.MAX), n.content ?? null)
            .input('note_type', sql.NVarChar(50), n.note_type ?? null)
            .input('is_important', sql.Bit, n.is_important ? 1 : 0)
            .input('is_active', sql.Bit, n.is_active === undefined ? 1 : (n.is_active ? 1 : 0))
            .input('created_by', sql.NVarChar(100), n.created_by ?? null);
          const r = await req.query(`INSERT INTO app.client_notes (client_id, title, content, note_type, is_important, is_active, created_by)
            OUTPUT INSERTED.note_id, INSERTED.client_id, INSERTED.title, INSERTED.content, INSERTED.note_type, INSERTED.is_important, INSERTED.is_active, INSERTED.created_utc, INSERTED.updated_utc, INSERTED.created_by, INSERTED.updated_by
            VALUES (@client_id, @title, @content, @note_type, @is_important, @is_active, @created_by)`);
          insertedNotes.push(r.recordset[0]);
        }
        childResults.notes = insertedNotes;
      }

      // Insert locations
      if (locations && locations.length) {
        const insertedLocations: any[] = [];
        for (const loc of locations) {
          const req = childTx.request();
          req.input('client_id', sql.Int, clientId)
            .input('label', sql.NVarChar(200), loc.label ?? null)
            .input('line1', sql.NVarChar(200), loc.line1 ?? null)
            .input('line2', sql.NVarChar(200), loc.line2 ?? null)
            .input('city', sql.NVarChar(200), loc.city ?? null)
            .input('state_province', sql.NVarChar(100), loc.state_province ?? null)
            .input('postal_code', sql.NVarChar(50), loc.postal_code ?? null)
            .input('country', sql.NVarChar(100), loc.country ?? null)
            .input('is_primary', sql.Bit, loc.is_primary ? 1 : 0);
          const r = await req.query(`INSERT INTO app.client_locations (client_id, label, line1, line2, city, state_province, postal_code, country, is_primary)
            OUTPUT INSERTED.location_id, INSERTED.client_id, INSERTED.label, INSERTED.line1, INSERTED.line2, INSERTED.city, INSERTED.state_province, INSERTED.postal_code, INSERTED.country, INSERTED.is_primary, INSERTED.created_utc
            VALUES (@client_id, @label, @line1, @line2, @city, @state_province, @postal_code, @country, @is_primary)`);
          insertedLocations.push(r.recordset[0]);
        }
        childResults.locations = insertedLocations;
      }

      // Insert client industries
      if (industries && industries.length) {
        const insertedIndustries: any[] = [];
        for (const ind of industries) {
          const req = childTx.request();
          req.input('client_id', sql.Int, clientId).input('industry_id', sql.Int, ind.industry_id).input('is_primary', sql.Bit, ind.is_primary ? 1 : 0);
          const r = await req.query(`INSERT INTO app.client_industries (client_id, industry_id, is_primary)
            OUTPUT INSERTED.client_id, INSERTED.industry_id, INSERTED.is_primary, INSERTED.created_utc
            VALUES (@client_id, @industry_id, @is_primary)`);
          insertedIndustries.push(r.recordset[0]);
        }
        childResults.client_industries = insertedIndustries;
      }

      // Insert tag map (requires engagement_id and tag_id)
      if (tag_map && tag_map.length) {
        const insertedTagMap: any[] = [];
        for (const t of tag_map) {
          if (!t.engagement_id || !t.tag_id) continue;
          const req = childTx.request();
          req.input('engagement_id', sql.Int, t.engagement_id).input('tag_id', sql.Int, t.tag_id);
          const r = await req.query(`INSERT INTO app.client_tag_map (engagement_id, tag_id) OUTPUT INSERTED.tag_id, INSERTED.engagement_id VALUES (@engagement_id, @tag_id)`);
          insertedTagMap.push(r.recordset[0]);
        }
        childResults.client_tag_map = insertedTagMap;
      }

      // Insert contact social profiles. These can reference newly inserted contacts by email or by index.
      if (socialProfiles && socialProfiles.length) {
        const insertedProfiles: any[] = [];
        // Build email->id map from insertedContacts
        const emailMap: Record<string, number> = {};
        for (const ic of insertedContacts) if (ic.email) emailMap[String(ic.email).toLowerCase()] = ic.contact_id;

        for (const p of socialProfiles) {
          let targetContactId: number | null = null;
          if (p.contact_id) targetContactId = Number(p.contact_id);
          else if (p.contact_email && emailMap[p.contact_email.toLowerCase()]) targetContactId = emailMap[p.contact_email.toLowerCase()];
          else if (typeof p.contact_index === 'number' && insertedContacts[p.contact_index]) targetContactId = insertedContacts[p.contact_index].contact_id;
          if (!targetContactId) continue; // skip profiles without a contact mapping
          const req = childTx.request();
          req.input('contact_id', sql.BigInt, targetContactId)
            .input('provider', sql.NVarChar(50), p.provider ?? null)
            .input('profile_url', sql.NVarChar(512), p.profile_url ?? null)
            .input('is_primary', sql.Bit, p.is_primary ? 1 : 0);
          const r = await req.query(`INSERT INTO app.contact_social_profiles (contact_id, provider, profile_url, is_primary)
            OUTPUT INSERTED.id, INSERTED.contact_id, INSERTED.provider, INSERTED.profile_url, INSERTED.is_primary, INSERTED.created_utc, INSERTED.updated_utc
            VALUES (@contact_id, @provider, @profile_url, @is_primary)`);
          insertedProfiles.push(r.recordset[0]);
        }
        childResults.contact_social_profiles = insertedProfiles;
      }

      await childTx.commit();
    } catch (childErr: any) {
      try {
        // Prefer calling rollback on the transaction object if available
        // childTx is declared inside try; attempt to access via closure by name
        // (if not present, fallback to a raw ROLLBACK)
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        if (typeof childTx !== 'undefined' && childTx) await childTx.rollback();
        else await pool.request().query('IF @@TRANCOUNT>0 ROLLBACK');
      } catch (rbErr) { /* ignore */ }
      // Attach child error info to proc_result for easier debugging
      (proc_result as any).child_error = { message: childErr?.message || String(childErr), stack: childErr?.stack };
      // Return success with proc_result but include child_error and 500 status to indicate failure in child processing
      return res.status(500).json({ status: 'error', error: { code: 'ChildInsertFailed', message: childErr?.message || 'Failed inserting child records' }, data: { client: clientRow, proc_result } });
    }

    ok(res, { client: clientRow, proc_result, child_results: Object.keys(childResults).length ? childResults : undefined });
  })
);

/**
 * @openapi
 * /api/clients/{client_id}/setup:
 *   post:
 *     summary: Orchestrate post-creation client setup (idempotent)
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: client_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [playbook_code, owner_user_id]
 *             properties:
 *               client_name: { type: string }
 *               playbook_code: { type: string }
 *               owner_user_id: { type: integer }
 *     responses:
 *       200:
 *         description: Setup executed (idempotent)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     client_slug: { type: string }
 *                     folders:
 *                       type: array
 *                       items: { type: string }
 */
router.post(
  '/:client_id/setup',
  asyncHandler(async (req, res) => {
    const clientId = Number(req.params.client_id);
    if (Number.isNaN(clientId)) return badRequest(res, 'client_id must be int');
    const parsed = ClientSetupBody.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues.map(i=>i.message).join('; '));
    const pool = await getPool();
    const exists = await pool.request().input('id', sql.Int, clientId).query('SELECT client_id, name FROM app.clients WHERE client_id=@id');
    const row = exists.recordset[0];
    if (!row) return notFound(res);
    const result = await orchestrateClientSetup({ client_id: clientId, client_name: parsed.data.client_name || row.name, playbook_code: parsed.data.playbook_code, owner_user_id: parsed.data.owner_user_id });
    ok(res, result);
  })
);

export default router;
