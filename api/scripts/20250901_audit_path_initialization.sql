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
    FROM app.client_engagements
    WHERE client_id = @client_id
    ORDER BY created_utc DESC;
  END

  -- If audit_id is NULL, create new audit
  IF @audit_id IS NULL
  BEGIN
    INSERT INTO app.audits (engagement_id, title, phase, percent_complete, created_utc, updated_utc, state, domain, audit_type, path_id, current_step_id, owner_contact_id)
    VALUES (@engagement_id, @title, 'InProgress', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), 'not_started', @domain, 'standard', @path_id, NULL, @owner_contact_id);

    SET @new_audit_id = SCOPE_IDENTITY();
    SET @audit_id = @new_audit_id;
  END
  ELSE
  BEGIN
    -- Update existing audit with path
    UPDATE app.audits
    SET path_id = @path_id,
        current_step_id = NULL,
        state = 'not_started',
        phase = 'InProgress',
        percent_complete = 0,
        updated_utc = SYSUTCDATETIME()
    WHERE audit_id = @audit_id;
  END

  -- Delete existing progress for this audit
  DELETE FROM app.audit_step_progress WHERE audit_id = @audit_id;

  -- Get the first step of the path
  SELECT TOP 1 @first_step_id = step_id
  FROM app.path_steps
  WHERE path_id = @path_id
  ORDER BY seq;

  -- Update current_step_id to first step
  UPDATE app.audits
  SET current_step_id = @first_step_id
  WHERE audit_id = @audit_id;

  -- Insert progress rows for all steps
  INSERT INTO app.audit_step_progress (audit_id, step_id, status, started_utc, created_utc, updated_utc)
  SELECT @audit_id, ps.step_id,
         CASE WHEN ps.seq = 1 THEN 'in_progress' ELSE 'not_started' END,
         CASE WHEN ps.seq = 1 THEN SYSUTCDATETIME() ELSE NULL END,
         SYSUTCDATETIME(), SYSUTCDATETIME()
  FROM app.path_steps ps
  WHERE ps.path_id = @path_id;

  -- Return audit header
  SELECT a.audit_id, a.engagement_id, a.title, a.phase, a.percent_complete, a.created_utc, a.updated_utc,
         a.state, a.domain, a.audit_type, a.path_id, a.current_step_id, a.start_utc, a.end_utc,
         a.owner_contact_id, a.notes
  FROM app.audits a
  WHERE a.audit_id = @audit_id;

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
