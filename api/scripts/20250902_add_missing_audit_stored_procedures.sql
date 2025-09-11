-- 20250902_add_missing_audit_stored_procedures.sql
-- Add missing stored procedures for audit operations using unified engagement table

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*
  Stored procedures for audit operations using unified engagement table
*/

-- List audits by client
CREATE OR ALTER PROCEDURE app.sp_audit_list_by_client
  @client_id INT,
  @offset INT = 0,
  @limit INT = 50
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
  WHERE e.client_id = @client_id AND e.type = 'audit'
  ORDER BY e.created_at DESC
  OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
END;
GO

-- List audits by engagement
CREATE OR ALTER PROCEDURE app.sp_audit_list_by_engagement
  @engagement_id INT,
  @offset INT = 0,
  @limit INT = 50
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
  WHERE e.engagement_id = @engagement_id AND e.type = 'audit'
  ORDER BY e.created_at DESC
  OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
END;
GO

-- Upsert audit step progress (Updated for new schema)
CREATE OR ALTER PROCEDURE app.sp_audit_progress_upsert
  @audit_id INT,
  @step_id INT,
  @status NVARCHAR(30),
  @output_json NVARCHAR(MAX) = NULL,
  @notes NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  -- Map status to state values
  DECLARE @state NVARCHAR(12) = CASE
    WHEN @status = 'done' THEN 'done'
    WHEN @status = 'in_progress' THEN 'in_progress'
    WHEN @status = 'blocked' THEN 'blocked'
    ELSE 'todo'
  END;

  -- Update the audit step state
  UPDATE app.audit_step
  SET state = @state,
      updated_at = SYSUTCDATETIME()
  WHERE audit_step_id = @step_id;

  -- Return the updated record
  SELECT audit_step_id, audit_path_id, title, desc, owner_id, state, severity, due_at, created_at, updated_at
  FROM app.audit_step
  WHERE audit_step_id = @step_id;
END;
GO

-- Mark step done and advance (Updated for new schema)
CREATE OR ALTER PROCEDURE app.sp_audit_mark_step_done_and_advance
  @audit_id INT,
  @step_id INT,
  @advance BIT = 1
AS
BEGIN
  SET NOCOUNT ON;

  -- Mark current step as done
  UPDATE app.audit_step
  SET state = 'done',
      updated_at = SYSUTCDATETIME()
  WHERE audit_step_id = @step_id;

  IF @advance = 1
  BEGIN
    -- Find next step in sequence within the same audit path
    DECLARE @current_path_id BIGINT;
    DECLARE @next_step_id BIGINT;

    SELECT @current_path_id = audit_path_id
    FROM app.audit_step
    WHERE audit_step_id = @step_id;

    -- For now, just mark the next step by audit_step_id order
    -- In a more complete implementation, you'd have a proper sequence field
    SELECT TOP 1 @next_step_id = audit_step_id
    FROM app.audit_step
    WHERE audit_path_id = @current_path_id
      AND audit_step_id > @step_id
      AND state != 'done'
    ORDER BY audit_step_id;

    IF @next_step_id IS NOT NULL
    BEGIN
      -- Mark next step as in progress
      UPDATE app.audit_step
      SET state = 'in_progress',
          updated_at = SYSUTCDATETIME()
      WHERE audit_step_id = @next_step_id;
    END
  END
END;
GO

-- Advance directly to a step (Updated for new schema)
CREATE OR ALTER PROCEDURE app.sp_audit_advance_to_step
  @audit_id INT,
  @step_id INT
AS
BEGIN
  SET NOCOUNT ON;

  -- Mark target step as in progress
  UPDATE app.audit_step
  SET state = 'in_progress',
      updated_at = SYSUTCDATETIME()
  WHERE audit_step_id = @step_id;
END;
GO
