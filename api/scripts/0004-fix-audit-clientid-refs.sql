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
     - Derive client_id from engagement table (avoid referencing old audit table)
     - Optionally include last_touch_utc from app.client_activity if present (LEFT JOIN)
*/
CREATE OR ALTER VIEW app.v_audit_recent_touch AS
SELECT
  e.engagement_id as audit_id,
  e.client_id,
  e.title,
  NULL AS status,
  MAX(ca.created_utc) AS last_touch_utc
FROM app.engagement e
LEFT JOIN app.client_activity ca ON ca.client_id = e.client_id
WHERE e.engagement_type = 'audit'
GROUP BY e.engagement_id, e.client_id, e.title;
GO

/*
  2) Safe stored procedure: app.usp_audit_last_recent
     - Use the view's derived client_id
*/
CREATE OR ALTER PROCEDURE app.usp_audit_last_recent AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP 1
    v.audit_id,
    v.client_id,
    e.name as title,
    e.status,
    v.last_touch_utc
  FROM app.v_audit_recent_touch v
  JOIN app.engagement e ON e.engagement_id = v.audit_id AND e.type = 'audit'
  ORDER BY v.last_touch_utc DESC;
END;
GO

/*
  3) Safe stored procedure: app.usp_sipoc_upsert
     - No direct references to old audit table; derive client_id via engagement table
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

  IF NOT EXISTS (SELECT 1 FROM app.engagement WHERE engagement_id = @audit_id AND type = 'audit')
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

  -- Try to log an activity to whichever activity table exists. Use engagement table to derive client_id.
  DECLARE @has_activity_log BIT = CASE WHEN OBJECT_ID(N'app.activity_log','U') IS NOT NULL THEN 1 ELSE 0 END;
  DECLARE @has_client_activity BIT = CASE WHEN OBJECT_ID(N'app.client_activity','U') IS NOT NULL THEN 1 ELSE 0 END;
  DECLARE @sql NVARCHAR(MAX);

  IF @has_activity_log = 1
  BEGIN
    SET @sql = N'
      INSERT INTO app.activity_log(audit_id, client_id, type, title)
      SELECT e.engagement_id, e.client_id, N''SIPOC'', N''Updated SIPOC''
      FROM app.engagement e
      WHERE e.engagement_id = @aid AND e.type = ''audit'';';
    EXEC sp_executesql @sql, N'@aid INT', @aid = @audit_id;
    RETURN;
  END

  IF @has_client_activity = 1
  BEGIN
    SET @sql = N'
      INSERT INTO app.client_activity(client_id, actor_user_id, verb, summary, meta_json, created_utc)
      SELECT e.client_id, NULL, N''SIPOC'', N''Updated SIPOC'', N''{"' + N'audit_id' + N'":'' + CONVERT(NVARCHAR(20), e.engagement_id) + N''}'' , SYSUTCDATETIME()
      FROM app.engagement e
      WHERE e.engagement_id = @aid AND e.type = ''audit'';';
    EXEC sp_executesql @sql, N'@aid INT', @aid = @audit_id;
    RETURN;
  END

  -- nothing to log if no activity tables exist
END;
GO

/*
  4) Safe stored procedure: app.sp_audit_get
     - Replace SELECT with unified engagement table
*/
CREATE OR ALTER PROCEDURE app.sp_audit_get
  @audit_id INT
AS
BEGIN
  SET NOCOUNT ON;

  ;WITH steps AS (
    SELECT path_id, COUNT(*) AS total_steps
    FROM app.path_steps
    WHERE path_id = (SELECT path_id FROM app.engagement WHERE engagement_id=@audit_id AND type = 'audit')
    GROUP BY path_id
  ),
  done_steps AS (
    SELECT COUNT(*) AS done_steps
    FROM app.audit_step_progress
    WHERE audit_id=@audit_id AND status='done'
  )
  SELECT
    e.engagement_id as audit_id,
    e.client_id,
    e.name as title,
    e.status,
    e.percent_complete,
    e.created_at as created_utc,
    e.updated_at as updated_utc,
    NULL AS [state],
    NULL AS domain,
    NULL AS audit_type,
    e.path_id,
    e.current_step_id,
    e.start_at as start_utc,
    e.due_at as end_utc,
    e.owner_id as owner_contact_id,
    NULL AS notes,
    ps.title          AS current_step_title,
    ps.seq            AS current_step_seq,
    ps.state_gate     AS current_step_state_gate,
    ISNULL(s.total_steps,0) AS total_steps,
    ISNULL(d.done_steps,0) AS done_steps_count
  FROM app.engagement e
  LEFT JOIN app.path_steps ps ON ps.step_id=e.current_step_id
  LEFT JOIN steps s ON s.path_id = e.path_id
  LEFT JOIN done_steps d ON 1=1
  WHERE e.engagement_id=@audit_id AND e.type = 'audit';

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
     - Use unified engagement table for audit counts
*/
CREATE OR ALTER VIEW app.v_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM app.clients WHERE is_active = 1) AS active_clients,
  (SELECT COUNT(*) FROM app.engagement WHERE type = 'audit' AND status IN ('discovery','mapping','findings')) AS audits_in_progress,
  CAST(0 AS INT) AS sipocs_completed,
  CAST(0 AS INT) AS pending_interviews;
GO

-- End of script
