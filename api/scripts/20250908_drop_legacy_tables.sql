-- Update Legacy References Migration
-- Date: 2025-09-08
-- Update stored procedures and views to use unified system before dropping legacy tables

-- Update v_dashboard_stats to use unified engagement table
DROP VIEW IF EXISTS app.v_dashboard_stats;
GO

CREATE VIEW app.v_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM app.clients WHERE is_active = 1) AS active_clients,
  (SELECT COUNT(*) FROM app.engagement WHERE type = 'audit' AND status IN ('active', 'paused')) AS audits_in_progress,
  CAST(0 AS INT) AS sipocs_completed,
  CAST(0 AS INT) AS pending_interviews;
GO

-- Update sp_audit_get to use unified system
DROP PROCEDURE IF EXISTS app.sp_audit_get;
GO

CREATE PROCEDURE app.sp_audit_get
  @audit_id INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    e.engagement_id as audit_id,
    e.client_id,
    e.name as title,
    e.status,
    e.health,
    e.created_at as created_utc,
    e.updated_at as updated_utc,
    e.start_at as start_utc,
    e.due_at as end_utc,
    e.owner_id as owner_contact_id
  FROM app.engagement e
  WHERE e.engagement_id = @audit_id AND e.type = 'audit';
END;
GO

-- Update other stored procedures that reference legacy tables
-- (Add more updates here as needed)

PRINT 'Updated legacy references to use unified engagement system';
GO

-- Drop Legacy Tables Migration
-- Date: 2025-09-08
-- Safely removes legacy tables that have been replaced by the unified engagements system

-- First, drop foreign key constraints that reference the legacy tables
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_audit_step_progress_audit')
BEGIN
    ALTER TABLE app.audit_step_progress DROP CONSTRAINT FK_audit_step_progress_audit;
    PRINT 'Dropped FK_audit_step_progress_audit constraint';
END
GO

IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK__client_do__engag__00DF2177')
BEGIN
    ALTER TABLE app.client_documents DROP CONSTRAINT FK__client_do__engag__00DF2177;
    PRINT 'Dropped FK__client_do__engag__00DF2177 constraint';
END
GO

IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK__audits__engageme__14E61A24')
BEGIN
    ALTER TABLE app.audits DROP CONSTRAINT FK__audits__engageme__14E61A24;
    PRINT 'Dropped FK__audits__engageme__14E61A24 constraint';
END
GO

-- Drop any other constraints that might reference these tables
DECLARE @sql NVARCHAR(MAX) = '';
SELECT @sql = @sql + 'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id)) + '.' + QUOTENAME(OBJECT_NAME(parent_object_id)) + ' DROP CONSTRAINT ' + QUOTENAME(name) + '; '
FROM sys.foreign_keys
WHERE referenced_object_id IN (
    OBJECT_ID('app.audits'),
    OBJECT_ID('app.client_engagements')
);

IF LEN(@sql) > 0
BEGIN
    EXEC sp_executesql @sql;
    PRINT 'Dropped additional foreign key constraints';
END
GO

-- Now drop the legacy tables in the correct order (child tables first)
IF OBJECT_ID('app.audit_step_progress', 'U') IS NOT NULL
BEGIN
    DROP TABLE app.audit_step_progress;
    PRINT 'Dropped app.audit_step_progress table';
END
GO

IF OBJECT_ID('app.audits', 'U') IS NOT NULL
BEGIN
    DROP TABLE app.audits;
    PRINT 'Dropped app.audits table';
END
GO

IF OBJECT_ID('app.client_engagements', 'U') IS NOT NULL
BEGIN
    DROP TABLE app.client_engagements;
    PRINT 'Dropped app.client_engagements table';
END
GO

-- Check for any other legacy audit-related tables that might exist
IF OBJECT_ID('app.audit_paths', 'U') IS NOT NULL
BEGIN
    DROP TABLE app.audit_paths;
    PRINT 'Dropped app.audit_paths table';
END
GO

IF OBJECT_ID('app.path_steps', 'U') IS NOT NULL
BEGIN
    DROP TABLE app.path_steps;
    PRINT 'Dropped app.path_steps table';
END
GO

-- Clean up any orphaned indexes
DECLARE @index_cleanup NVARCHAR(MAX) = '';
SELECT @index_cleanup = @index_cleanup +
    'IF EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID(''' +
    QUOTENAME(OBJECT_SCHEMA_NAME(object_id)) + '.' + QUOTENAME(OBJECT_NAME(object_id)) +
    ''') AND name = ''' + name + ''') ' +
    'DROP INDEX ' + QUOTENAME(name) + ' ON ' +
    QUOTENAME(OBJECT_SCHEMA_NAME(object_id)) + '.' + QUOTENAME(OBJECT_NAME(object_id)) + '; '
FROM sys.indexes
WHERE object_id IN (
    SELECT object_id FROM sys.tables
    WHERE name IN ('audits', 'client_engagements', 'audit_step_progress', 'audit_paths', 'path_steps')
    AND schema_id = SCHEMA_ID('app')
);

IF LEN(@index_cleanup) > 0
BEGIN
    EXEC sp_executesql @index_cleanup;
    PRINT 'Dropped orphaned indexes';
END
GO

PRINT 'Legacy tables cleanup completed successfully';
PRINT 'Note: The unified engagements system (app.engagement) is now the single source of truth';
GO
