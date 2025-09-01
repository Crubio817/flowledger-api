-- 0004-fix-audit-clientid-refs.sql
-- Replace/repair stored procedures and views that reference app.audits.client_id
-- This file contains safe CREATE OR ALTER statements that avoid direct references to a.client_id
-- Run in dev first, then staging/production after testing.
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
/*
  1) Safe view: app.v_audit_recent_touch
     - Derive client_id from client_engagements only (avoid referencing a.client_id which may be absent)
     - Optionally include last_touch_utc from app.client_activity if present (LEFT JOIN)
*/
CREATE OR ALTER VIEW app.v_audit_recent_touch AS
SELECT
  a.audit_id,
  MAX(ce.client_id) AS client_id,
  MAX(a.title) AS title,
  NULL AS status,
  MAX(ca.created_utc) AS last_touch_utc
FROM app.audits a
LEFT JOIN app.client_engagements ce ON ce.engagement_id = a.engagement_id
LEFT JOIN app.client_activity ca ON ca.client_id = ce.client_id
GROUP BY a.audit_id;
GO

/*
  2) Safe stored procedure: app.usp_audit_last_recent
     - Use the view's derived client_id
*/
CREATE OR ALTER PROCEDURE app.usp_audit_last_recent AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP 1
    a.audit_id,
    v.client_id,
    a.title,
    a.[state],
    v.last_touch_utc
  FROM app.v_audit_recent_touch v
  JOIN app.audits a ON a.audit_id = v.audit_id
  ORDER BY v.last_touch_utc DESC;
END;
GO

/*
  3) Safe stored procedure: app.usp_sipoc_upsert
     - No direct references to a.client_id; derive client_id via client_engagements
     - Use dynamic inserts for available activity tables (activity_log, client_activity)
*/
CREATE OR ALTER PROCEDURE app.usp_sipoc_upsert
  @audit_id INT,
  @suppliers NVARCHAR(MAX) = NULL,
  @inputs NVARCHAR(MAX) = NULL,
  @process NVARCHAR(MAX) = NULL,
  @outputs NVARCHAR(MAX) = NULL,
  @customers NVARCHAR(MAX) = NULL,
  @metrics NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (SELECT 1 FROM app.audits WHERE audit_id = @audit_id)
    THROW 51000, 'Audit not found', 1;

  MERGE app.audit_sipoc AS t
  USING (SELECT @audit_id AS audit_id) AS s
  ON (t.audit_id = s.audit_id)
  WHEN MATCHED THEN UPDATE SET
    suppliers_json = @suppliers,
    inputs_json    = @inputs,
    process_json   = @process,
    outputs_json   = @outputs,
    customers_json = @customers,
    metrics_json   = @metrics,
    updated_utc    = SYSUTCDATETIME()
  WHEN NOT MATCHED THEN
    INSERT (audit_id, suppliers_json, inputs_json, process_json, outputs_json, customers_json, metrics_json, updated_utc)
    VALUES (s.audit_id, @suppliers, @inputs, @process, @outputs, @customers, @metrics, SYSUTCDATETIME());

  -- Try to log an activity to whichever activity table exists. Use client_engagements to derive client_id.
  DECLARE @has_activity_log BIT = CASE WHEN OBJECT_ID(N'app.activity_log','U') IS NOT NULL THEN 1 ELSE 0 END;
  DECLARE @has_client_activity BIT = CASE WHEN OBJECT_ID(N'app.client_activity','U') IS NOT NULL THEN 1 ELSE 0 END;
  DECLARE @sql NVARCHAR(MAX);

  IF @has_activity_log = 1
  BEGIN
    SET @sql = N'
      INSERT INTO app.activity_log(audit_id, client_id, type, title)
      SELECT a.audit_id, ce.client_id, N''SIPOC'', N''Updated SIPOC''
      FROM app.audits a
      LEFT JOIN app.client_engagements ce ON ce.engagement_id = a.engagement_id
      WHERE a.audit_id = @aid;';
    EXEC sp_executesql @sql, N'@aid INT', @aid = @audit_id;
    RETURN;
  END

  IF @has_client_activity = 1
  BEGIN
    SET @sql = N'
      INSERT INTO app.client_activity(client_id, actor_user_id, verb, summary, meta_json, created_utc)
      SELECT ce.client_id, NULL, N''SIPOC'', N''Updated SIPOC'', N''{"' + N'audit_id' + N'":'' + CONVERT(NVARCHAR(20), a.audit_id) + N''}'' , SYSUTCDATETIME()
      FROM app.audits a
      LEFT JOIN app.client_engagements ce ON ce.engagement_id = a.engagement_id
      WHERE a.audit_id = @aid;';
    EXEC sp_executesql @sql, N'@aid INT', @aid = @audit_id;
    RETURN;
  END

  -- nothing to log if no activity tables exist
END;
GO

/*
  4) Safe stored procedure: app.sp_audit_get
     - Replace SELECT a.* with an explicit column list to avoid referencing removed columns
*/
CREATE OR ALTER PROCEDURE app.sp_audit_get
  @audit_id INT
AS
BEGIN
  SET NOCOUNT ON;

  ;WITH steps AS (
    SELECT path_id, COUNT(*) AS total_steps
    FROM app.path_steps
    WHERE path_id = (SELECT path_id FROM app.audits WHERE audit_id=@audit_id)
    GROUP BY path_id
  ),
  done_steps AS (
    SELECT COUNT(*) AS done_steps
    FROM app.audit_step_progress
    WHERE audit_id=@audit_id AND status='done'
  )
  SELECT
    a.audit_id,
    a.engagement_id,
    a.title,
    a.phase,
    a.percent_complete,
    a.created_utc,
    a.updated_utc,
    a.[state],
    a.domain,
    a.audit_type,
    a.path_id,
    a.current_step_id,
    a.start_utc,
    a.end_utc,
    a.owner_contact_id,
    a.notes,
    ps.title          AS current_step_title,
    ps.seq            AS current_step_seq,
    ps.state_gate     AS current_step_state_gate,
    ISNULL(s.total_steps,0) AS total_steps,
    ISNULL(d.done_steps,0) AS done_steps_count
  FROM app.audits a
  LEFT JOIN app.path_steps ps ON ps.step_id=a.current_step_id
  LEFT JOIN steps s ON s.path_id = a.path_id
  LEFT JOIN done_steps d ON 1=1
  WHERE a.audit_id=@audit_id;

  SELECT p.progress_id, p.audit_id, p.step_id, ps.seq, ps.title, ps.state_gate,
         p.status, p.started_utc, p.completed_utc, p.output_json, p.notes,
         p.created_utc, p.updated_utc
  FROM app.audit_step_progress p
  JOIN app.path_steps ps ON ps.step_id=p.step_id
  WHERE p.audit_id=@audit_id
  ORDER BY ps.seq;
END;
GO

/*
  5) Safe view: app.v_dashboard_stats
     - Avoid referencing any removed audit columns; use explicit expressions
*/
CREATE OR ALTER VIEW app.v_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM app.clients WHERE is_active = 1) AS active_clients,
  (SELECT COUNT(*) FROM app.audits a JOIN app.client_engagements ce ON a.engagement_id = ce.engagement_id WHERE a.phase IN ('discovery','mapping','findings')) AS audits_in_progress,
  CAST(0 AS INT) AS sipocs_completed,
  CAST(0 AS INT) AS pending_interviews;
GO

-- End of script
