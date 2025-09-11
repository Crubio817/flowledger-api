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
    const r = await pool.request().input('id', sql.Int, id).query(`SELECT engagement_id as audit_id, client_id, name as title, start_at as created_utc, updated_at, type FROM app.engagement WHERE engagement_id=@id AND type='audit'`);
    return r.recordset[0] || null;
  }
  if (name === 'get_engagement') {
    const id = Number(args.engagement_id);
    const r = await pool.request().input('id', sql.Int, id).query(`SELECT engagement_id, client_id, name AS title, start_at AS start_date, due_at AS end_date, status, type FROM app.engagement WHERE engagement_id=@id`);
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

