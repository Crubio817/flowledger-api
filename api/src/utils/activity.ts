import { getPool, sql } from '../db/pool';

export type ActivityType =
  | 'ClientCreated'
  | 'ClientUpdated'
  | 'ClientDeleted'
  | 'ClientLocationCreated'
  | 'ClientLocationUpdated'
  | 'ClientLocationDeleted'
  | 'ClientDocumentCreated'
  | 'ClientDocumentUpdated'
  | 'ClientDocumentDeleted'
  | 'ClientIntegrationCreated'
  | 'ClientIntegrationUpdated'
  | 'ClientIntegrationDeleted'
  | 'OnboardingTaskCreated'
  | 'OnboardingTaskUpdated'
  | 'OnboardingTaskDeleted'
  | 'ClientTagMapCreated'
  | 'ClientTagMapDeleted'
  | 'ClientTagCreated'
  | 'ClientTagUpdated'
  | 'ClientTagDeleted'
  | 'ContactSocialProfileCreated'
  | 'ContactSocialProfileUpdated'
  | 'ContactSocialProfileDeleted'
  | 'AuditSipocCreated'
  | 'AuditSipocUpdated'
  | 'ClientLocationUpdated'
  | 'ClientLocationDeleted'
  | 'AuditCreated'
  | 'AuditUpdated'
  | 'AuditDeleted'
  | 'IndustryCreated'
  | 'IndustryUpdated'
  | 'IndustryDeleted'
  | 'ClientIndustryAdded'
  | 'ClientIndustryUpdated'
  | 'ClientIndustryRemoved'
  | 'ClientNoteCreated'
  | 'ClientNoteUpdated'
  | 'ClientNoteDeleted'
  | 'TaskPackCreated'
  | 'TaskPackUpdated'
  | 'TaskPackDeleted'
  | 'PackTaskCreated'
  | 'PackTaskUpdated'
  | 'PackTaskDeleted';

export async function logActivity(params: {
  type: ActivityType;
  title: string;
  audit_id?: number | null;
  client_id?: number | null;
  industry_id?: number | null;
  pack_id?: number | null;
  pack_task_id?: number | null;
}) {
  const pool = await getPool();
  const req = pool.request()
    .input('type', sql.NVarChar(40), params.type)
    .input('title', sql.NVarChar(300), params.title)
    .input('audit_id', sql.Int, params.audit_id ?? null)
    .input('client_id', sql.Int, params.client_id ?? null)
    .input('industry_id', sql.Int, params.industry_id ?? null)
    .input('pack_id', sql.Int, params.pack_id ?? null)
    .input('pack_task_id', sql.Int, params.pack_task_id ?? null);
  // Try inserting into app.activity_log if it exists; otherwise try app.client_activity.
  try {
    await req.query(
      `INSERT INTO app.activity_log (activity_id, audit_id, client_id, industry_id, pack_id, pack_task_id, type, title, created_utc)
       VALUES (CAST((DATEDIFF_BIG(MILLISECOND,'1970-01-01', SYSUTCDATETIME())) AS BIGINT), @audit_id, @client_id, @industry_id, @pack_id, @pack_task_id, @type, @title, SYSUTCDATETIME())`
    );
    return;
  } catch (e: any) {
    const msg = String(e && e.message ? e.message : e || '');
    // If activity_log is missing or other schema issue, try client_activity fallback
    if (msg.includes("Invalid object name 'app.activity_log'") || msg.includes('Invalid object name \"app.activity_log\"') || msg.includes('Invalid column name')) {
      try {
        const req2 = pool.request()
          .input('client_id', sql.Int, params.client_id ?? null)
          .input('actor_user_id', sql.Int, null)
          .input('verb', sql.NVarChar(40), params.type)
          .input('summary', sql.NVarChar(300), params.title)
          .input('meta_json', sql.NVarChar(sql.MAX), JSON.stringify({
            audit_id: params.audit_id,
            industry_id: params.industry_id,
            pack_id: params.pack_id,
            pack_task_id: params.pack_task_id
          }));
        await req2.query(`INSERT INTO app.client_activity(client_id, actor_user_id, verb, summary, meta_json, created_utc)
                          VALUES (@client_id, @actor_user_id, @verb, @summary, @meta_json, SYSUTCDATETIME())`);
        return;
      } catch (e2: any) {
        // Swallow errors from activity logging to avoid breaking the main API flow
        console.warn('logActivity: activity table(s) missing or schema mismatch — skipping activity log');
        return;
      }
    }
    // If another unexpected error, rethrow so caller can observe it
    throw e;
  }
}
