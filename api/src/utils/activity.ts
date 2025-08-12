import { getPool, sql } from '../db/pool';

export type ActivityType =
  | 'ClientCreated'
  | 'ClientUpdated'
  | 'ClientDeleted'
  | 'AuditCreated'
  | 'AuditUpdated'
  | 'AuditDeleted';

export async function logActivity(params: {
  type: ActivityType;
  title: string;
  audit_id?: number | null;
  client_id?: number | null;
}) {
  const pool = await getPool();
  const req = pool.request()
    .input('type', sql.NVarChar(40), params.type)
    .input('title', sql.NVarChar(300), params.title)
    .input('audit_id', sql.Int, params.audit_id ?? null)
    .input('client_id', sql.Int, params.client_id ?? null);

  await req.query(
    `INSERT INTO app.activity_log (activity_id, audit_id, client_id, type, title, created_utc)
     VALUES (CAST((DATEDIFF_BIG(MILLISECOND,'1970-01-01', SYSUTCDATETIME())) AS BIGINT), @audit_id, @client_id, @type, @title, SYSUTCDATETIME())`
  );
}
