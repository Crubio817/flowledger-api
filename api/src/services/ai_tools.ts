import { getPool, sql } from '../db/pool';

export const toolsSpec = [
  {
    type: 'function',
    function: {
      name: 'get_client',
      description: 'Fetch a client by client_id',
      parameters: {
        type: 'object',
        properties: { client_id: { type: 'integer' } },
        required: ['client_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_audit',
      description: 'Fetch an audit by audit_id',
      parameters: {
        type: 'object',
        properties: { audit_id: { type: 'integer' } },
        required: ['audit_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_engagement',
      description: 'Fetch a client engagement by engagement_id',
      parameters: {
        type: 'object',
        properties: { engagement_id: { type: 'integer' } },
        required: ['engagement_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_clients',
      description: 'List clients with pagination',
      parameters: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
        },
      },
    },
  },
];

export async function callTool(name: string, rawArgs: any) {
  const pool = await getPool();
  const args = rawArgs || {};
  if (name === 'get_client') {
    const id = Number(args.client_id);
    const r = await pool.request().input('id', sql.Int, id).query(
      `SELECT client_id, name, is_active, created_utc FROM app.clients WHERE client_id=@id`
    );
    return r.recordset[0] || null;
  }
  if (name === 'get_audit') {
    const id = Number(args.audit_id);
  const colsRes = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='app' AND TABLE_NAME='audits'`);
  const exists = new Set(colsRes.recordset.map((r: any) => r.COLUMN_NAME));
  const selectCols: string[] = ['audit_id', 'client_id'];
  selectCols.push(exists.has('title') ? 'title' : 'NULL AS title');
  selectCols.push(exists.has('scope') ? 'scope' : 'NULL AS scope');
  selectCols.push(exists.has('status') ? 'status' : 'NULL AS status');
  selectCols.push(exists.has('state') ? 'state' : 'NULL AS state');
  selectCols.push(exists.has('created_utc') ? 'created_utc' : 'NULL AS created_utc');
  selectCols.push(exists.has('updated_utc') ? 'updated_utc' : 'NULL AS updated_utc');
  const sel = selectCols.join(', ');
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT ${sel} FROM app.audits WHERE audit_id=@id`);
  return r.recordset[0] || null;
  }
  if (name === 'get_engagement') {
    const id = Number(args.engagement_id);
  // inspect columns and build select list to avoid referencing missing columns
  const colsRes = await pool.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='app' AND TABLE_NAME='client_engagements'`);
  const exists = new Set(colsRes.recordset.map((r: any) => r.COLUMN_NAME));
  const selectCols: string[] = ['engagement_id', 'client_id', 'title'];
  if (exists.has('start_date')) selectCols.push(`COALESCE(start_date, start_utc) AS start_date`);
  else selectCols.push(`start_utc AS start_date`);
  if (exists.has('end_date')) selectCols.push(`COALESCE(end_date, end_utc) AS end_date`);
  else selectCols.push(`end_utc AS end_date`);
  if (exists.has('status')) selectCols.push('status');
  const sel = selectCols.join(', ');
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT ${sel} FROM app.client_engagements WHERE engagement_id=@id`);
    return r.recordset[0] || null;
  }
  if (name === 'list_clients') {
    const page = Math.max(1, Number(args.page || 1));
    const limit = Math.min(200, Math.max(1, Number(args.limit || 20)));
    const offset = (page - 1) * limit;
    const r = await pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(
        `SELECT client_id, name, is_active, created_utc, COUNT(*) OVER() AS total
         FROM app.clients
         ORDER BY client_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
    const total = r.recordset[0]?.total ?? 0;
    const items = r.recordset.map(({ total: _t, ...row }: any) => row);
    return { items, page, limit, total };
  }
  throw new Error(`Unknown tool: ${name}`);
}

