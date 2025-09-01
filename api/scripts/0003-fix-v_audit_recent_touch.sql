-- 0003-fix-v_audit_recent_touch.sql
-- Make app.v_audit_recent_touch resilient when app.audits.client_id was removed
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
DECLARE @has_client_col BIT = CASE WHEN COL_LENGTH(N'app.audits','client_id') IS NOT NULL THEN 1 ELSE 0 END;
-- Check if app.client_activity exists and has a created_utc column we can use for last_touch_utc
DECLARE @has_client_activity BIT = CASE WHEN OBJECT_ID(N'app.client_activity','U') IS NOT NULL AND COL_LENGTH(N'app.client_activity','created_utc') IS NOT NULL THEN 1 ELSE 0 END;
DECLARE @sql NVARCHAR(MAX);
-- Build a safe view using available columns. Use aggregations (MAX) for optional non-aggregates
DECLARE @has_title BIT = CASE WHEN COL_LENGTH(N'app.audits','title') IS NOT NULL THEN 1 ELSE 0 END;
DECLARE @has_status BIT = CASE WHEN COL_LENGTH(N'app.audits','status') IS NOT NULL THEN 1 ELSE 0 END;

DECLARE @client_expr NVARCHAR(MAX) = CASE WHEN @has_client_col = 1 THEN N'MAX(COALESCE(a.client_id, ce.client_id)) AS client_id' ELSE N'MAX(ce.client_id) AS client_id' END;
DECLARE @title_expr NVARCHAR(MAX) = CASE WHEN @has_title = 1 THEN N'MAX(a.title) AS title' ELSE N'NULL AS title' END;
DECLARE @status_expr NVARCHAR(MAX) = CASE WHEN @has_status = 1 THEN N'MAX(a.status) AS status' ELSE N'NULL AS status' END;

DECLARE @activity_join NVARCHAR(MAX) = N'';
DECLARE @last_touch_expr NVARCHAR(MAX) = N'NULL AS last_touch_utc';
IF @has_client_activity = 1
BEGIN
  SET @last_touch_expr = N'MAX(ca.created_utc) AS last_touch_utc';
  IF @has_client_col = 1
    SET @activity_join = N'LEFT JOIN app.client_activity ca ON ca.client_id = COALESCE(a.client_id, ce.client_id)';
  ELSE
    SET @activity_join = N'LEFT JOIN app.client_activity ca ON ca.client_id = ce.client_id';
END

SET @sql = N'CREATE OR ALTER VIEW app.v_audit_recent_touch AS
SELECT
  a.audit_id,
  ' + @client_expr + N',
  ' + @title_expr + N',
  ' + @status_expr + N',
  ' + @last_touch_expr + N'
FROM app.audits a
LEFT JOIN app.client_engagements ce ON ce.engagement_id = a.engagement_id
' + @activity_join + N'
GROUP BY a.audit_id;';

EXEC sp_executesql @sql;
GO

-- Notes:
-- 1) Script checks whether app.audits has a 'client_id' column and whether app.activity_log exists.
-- 2) If audits.client_id is present we use COALESCE(a.client_id, ce.client_id), otherwise we fall back to ce.client_id.
-- 3) If activity_log is missing the view sets last_touch_utc to NULL to avoid referencing a missing object.
-- 4) Run this in dev first, then staging/production after testing. After applying, re-run the failing request to confirm the error is resolved.
