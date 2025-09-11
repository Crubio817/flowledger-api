-- 0003-fix-v_audit_recent_touch.sql
-- Make app.v_audit_recent_touch work with unified engagement table
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
-- Drop existing view if it exists
IF OBJECT_ID('app.v_audit_recent_touch', 'V') IS NOT NULL
    DROP VIEW app.v_audit_recent_touch;
GO

-- Check if app.client_activity exists and has a created_utc column we can use for last_touch_utc
DECLARE @has_client_activity BIT = CASE WHEN OBJECT_ID(N'app.client_activity','U') IS NOT NULL AND COL_LENGTH(N'app.client_activity','created_utc') IS NOT NULL THEN 1 ELSE 0 END;
DECLARE @sql NVARCHAR(MAX);

DECLARE @activity_join NVARCHAR(MAX) = N'';
DECLARE @last_touch_expr NVARCHAR(MAX) = N'NULL AS last_touch_utc';
IF @has_client_activity = 1
BEGIN
  SET @last_touch_expr = N'MAX(ca.created_utc) AS last_touch_utc';
  SET @activity_join = N'LEFT JOIN app.client_activity ca ON ca.client_id = e.client_id';
END

SET @sql = N'CREATE VIEW app.v_audit_recent_touch AS
SELECT
  e.engagement_id as audit_id,
  e.client_id,
  e.name as title,
  e.status,
  ' + @last_touch_expr + N'
FROM app.engagement e
' + @activity_join + N'
WHERE e.type = ''audit''
GROUP BY e.engagement_id, e.client_id, e.name, e.status;';

EXEC sp_executesql @sql;
GO

-- Notes:
-- 1) Updated to use unified engagement table with engagement_type = 'audit'
-- 2) Simplified since engagement table has consistent schema
-- 3) Run this in dev first, then staging/production after testing.
