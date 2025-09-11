-- 20250901_audit_path_initialization.sql
-- Update sp_audit_set_path_initialize to handle audit creation and path seeding

CREATE OR ALTER PROCEDURE app.sp_audit_set_path_initialize
  @audit_id BIGINT = NULL,
  @engagement_id BIGINT = NULL,
  @client_id BIGINT = NULL,
  @title NVARCHAR(200) = NULL,
  @domain NVARCHAR(50) = NULL,
  @owner_contact_id INT = NULL,
  @path_id INT
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @new_audit_id BIGINT;
  DECLARE @first_step_id INT;

  -- If engagement_id is null but client_id is provided, find the most recent engagement for the client
  IF @engagement_id IS NULL AND @client_id IS NOT NULL
  BEGIN
    SELECT TOP 1 @engagement_id = engagement_id
    FROM app.engagement
    WHERE client_id = @client_id AND type = 'audit'
    ORDER BY created_at DESC;
  END

  -- If audit_id is NULL, create new audit
  IF @audit_id IS NULL
  BEGIN
    INSERT INTO app.engagement (org_id, client_id, type, name, owner_id, status, health, start_at, due_at, created_at, updated_at)
    VALUES (1, @client_id, 'audit', @title, @owner_contact_id, 'active', 'green', SYSUTCDATETIME(), DATEADD(day, 30, SYSUTCDATETIME()), SYSUTCDATETIME(), SYSUTCDATETIME());

    SET @new_audit_id = SCOPE_IDENTITY();
    SET @audit_id = @new_audit_id;

    -- Create audit path record
    INSERT INTO app.audit_path (org_id, engagement_id, name, created_at)
    VALUES (1, @new_audit_id, @title + ' Path', SYSUTCDATETIME());
  END
  ELSE
  BEGIN
    -- Update existing audit with path
    UPDATE app.engagement
    SET status = 'active',
        updated_at = SYSUTCDATETIME()
    WHERE engagement_id = @audit_id AND type = 'audit';

    -- Ensure audit path exists
    IF NOT EXISTS (SELECT 1 FROM app.audit_path WHERE engagement_id = @audit_id)
    BEGIN
      INSERT INTO app.audit_path (org_id, engagement_id, name, created_at)
      VALUES (1, @audit_id, @title + ' Path', SYSUTCDATETIME());
    END
  END

  -- Delete existing progress for this audit
  DELETE FROM app.audit_step_progress WHERE audit_id = @audit_id;

  -- Get the first step of the path
  SELECT TOP 1 @first_step_id = step_id
  FROM app.path_steps
  WHERE path_id = @path_id
  ORDER BY seq;

  -- Create audit steps for this engagement
  INSERT INTO app.audit_step (org_id, audit_path_id, title, owner_id, state, severity, due_at, created_at, updated_at)
  SELECT 1, ap.audit_path_id, ps.title, @owner_contact_id, 'todo', 'med',
         DATEADD(day, ps.seq * 7, SYSUTCDATETIME()), SYSUTCDATETIME(), SYSUTCDATETIME()
  FROM app.path_steps ps
  CROSS JOIN (SELECT audit_path_id FROM app.audit_path WHERE engagement_id = @audit_id) ap
  WHERE ps.path_id = @path_id;

  -- Insert progress rows for all steps
  INSERT INTO app.audit_step_progress (audit_id, step_id, status, started_utc, created_utc, updated_utc)
  SELECT @audit_id, ps.step_id,
         CASE WHEN ps.seq = 1 THEN 'in_progress' ELSE 'not_started' END,
         CASE WHEN ps.seq = 1 THEN SYSUTCDATETIME() ELSE NULL END,
         SYSUTCDATETIME(), SYSUTCDATETIME()
  FROM app.path_steps ps
  WHERE ps.path_id = @path_id;

  -- Return audit header
  SELECT e.engagement_id as audit_id, e.client_id, e.name as title, e.status, e.health,
         e.created_at as created_utc, e.updated_at as updated_utc,
         e.start_at as start_utc, e.due_at as end_utc,
         e.owner_id as owner_contact_id
  FROM app.engagement e
  WHERE e.engagement_id = @audit_id AND e.type = 'audit';

  -- Return step list with progress
  SELECT ps.step_id, ps.path_id, ps.seq, ps.title, ps.state_gate, ps.required, ps.agent_key,
         ps.input_contract, ps.output_contract, ps.created_utc,
         asp.status, asp.started_utc, asp.completed_utc, asp.output_json, asp.notes,
         asp.created_utc AS progress_created_utc, asp.updated_utc AS progress_updated_utc
  FROM app.path_steps ps
  LEFT JOIN app.audit_step_progress asp ON asp.step_id = ps.step_id AND asp.audit_id = @audit_id
  WHERE ps.path_id = @path_id
  ORDER BY ps.seq;
END;
