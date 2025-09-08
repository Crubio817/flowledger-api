-- Migration: 20250909_add_constraints_triggers.sql
-- Adds additional constraints, triggers, and views for People module

-- Availability calendar for daily allocations
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='person_calendar' AND xtype='U')
BEGIN
    CREATE TABLE app.person_calendar (
      person_id bigint NOT NULL,
      calendar_date date NOT NULL,
      working_hours decimal(4,2) DEFAULT 8.0,
      is_holiday bit DEFAULT 0,
      holiday_name nvarchar(100),
      PRIMARY KEY (person_id, calendar_date),
      FOREIGN KEY (person_id) REFERENCES app.person(person_id) ON DELETE CASCADE
    );
END
GO

-- Daily allocation tracking
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='person_daily_allocation' AND xtype='U')
BEGIN
    CREATE TABLE app.person_daily_allocation (
      person_id bigint NOT NULL,
      allocation_date date NOT NULL,
      total_hours_allocated decimal(5,2) NOT NULL DEFAULT 0,
      total_hours_available decimal(4,2) NOT NULL DEFAULT 8.0,
      utilization_pct AS (CASE WHEN total_hours_available > 0 THEN (total_hours_allocated / total_hours_available) * 100 ELSE 0 END) PERSISTED,
      is_overallocated AS (CASE WHEN total_hours_allocated > total_hours_available THEN 1 ELSE 0 END) PERSISTED,
      PRIMARY KEY (person_id, allocation_date),
      FOREIGN KEY (person_id) REFERENCES app.person(person_id) ON DELETE CASCADE
    );
END
GO

-- Skill evidence chain
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='skill_evidence' AND xtype='U')
BEGIN
    CREATE TABLE app.skill_evidence (
      evidence_id bigint IDENTITY(1,1) PRIMARY KEY,
      person_id bigint NOT NULL,
      skill_id bigint NOT NULL,
      evidence_type varchar(20) NOT NULL CHECK (evidence_type IN ('certification', 'project', 'training', 'peer_review', 'self_assessment')),
      evidence_date date NOT NULL,
      expiry_date date,
      verifier_id int, -- User who verified
      verification_date datetime2,
      source_url nvarchar(500),
      notes nvarchar(1000),
      confidence_score decimal(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
      UNIQUE (person_id, skill_id, evidence_type, evidence_date),
      FOREIGN KEY (person_id) REFERENCES app.person(person_id) ON DELETE CASCADE,
      FOREIGN KEY (skill_id) REFERENCES app.skill(skill_id) ON DELETE CASCADE
    );
END
GO

-- Audit log for rate and staffing decisions
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='audit_log' AND xtype='U')
BEGIN
    CREATE TABLE app.audit_log (
      audit_id bigint IDENTITY(1,1) PRIMARY KEY,
      org_id int NOT NULL,
      table_name varchar(50) NOT NULL,
      record_id bigint NOT NULL,
      action varchar(10) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
      old_values nvarchar(MAX),
      new_values nvarchar(MAX),
      changed_by int,
      changed_at datetime2 NOT NULL DEFAULT GETUTCDATE()
    );
END
GO

-- Trigger for assignment audit (must be in its own batch)
DROP TRIGGER IF EXISTS app.trg_assignment_audit;
GO

CREATE TRIGGER app.trg_assignment_audit
ON app.assignment
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
  DECLARE @action varchar(10);
  DECLARE @old_values nvarchar(MAX);
  DECLARE @new_values nvarchar(MAX);

  IF EXISTS (SELECT * FROM inserted) AND EXISTS (SELECT * FROM deleted)
    SET @action = 'UPDATE';
  ELSE IF EXISTS (SELECT * FROM inserted)
    SET @action = 'INSERT';
  ELSE
    SET @action = 'DELETE';

  IF @action IN ('UPDATE', 'INSERT')
    SELECT @new_values = (SELECT * FROM inserted FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
  IF @action IN ('UPDATE', 'DELETE')
    SELECT @old_values = (SELECT * FROM deleted FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

  INSERT INTO app.audit_log (org_id, table_name, record_id, action, old_values, new_values, changed_by)
  SELECT i.org_id, 'assignment', i.assignment_id, @action, @old_values, @new_values, NULL
  FROM inserted i;
END;
GO

-- Materialized view for availability (refresh manually or via job)
IF EXISTS (SELECT 1 FROM sys.views WHERE object_id = OBJECT_ID('app.v_person_availability'))
BEGIN
    DROP VIEW app.v_person_availability;
END
GO

CREATE VIEW app.v_person_availability AS
SELECT
  p.person_id,
  p.org_id,
  pc.calendar_date,
  pc.working_hours - ISNULL(pda.total_hours_allocated, 0) as hours_available,
  pda.utilization_pct,
  pda.is_overallocated
FROM app.person p
CROSS APPLY (
  SELECT TOP 90 DATEADD(day, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, GETDATE()) as calendar_date
  FROM (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15),(16),(17),(18),(19),(20),(21),(22),(23),(24),(25),(26),(27),(28),(29),(30),(31),(32),(33),(34),(35),(36),(37),(38),(39),(40),(41),(42),(43),(44),(45),(46),(47),(48),(49),(50),(51),(52),(53),(54),(55),(56),(57),(58),(59),(60),(61),(62),(63),(64),(65),(66),(67),(68),(69),(70),(71),(72),(73),(74),(75),(76),(77),(78),(79),(80),(81),(82),(83),(84),(85),(86),(87),(88),(89),(90)) AS Numbers(n)
) dates
LEFT JOIN app.person_calendar pc ON pc.person_id = p.person_id AND pc.calendar_date = dates.calendar_date
LEFT JOIN app.person_daily_allocation pda ON pda.person_id = p.person_id AND pda.allocation_date = dates.calendar_date
WHERE pc.is_holiday = 0 OR pc.is_holiday IS NULL;
GO

-- Scarcity multiplier table (updated by background job)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='scarcity_multiplier' AND xtype='U')
BEGIN
    CREATE TABLE app.scarcity_multiplier (
      scarcity_id bigint IDENTITY(1,1) PRIMARY KEY,
      org_id int NOT NULL,
      skill_id bigint,
      role_template_id bigint,
      multiplier decimal(4,2) NOT NULL DEFAULT 1.0 CHECK (multiplier BETWEEN 0.8 AND 1.3),
      calculated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      FOREIGN KEY (skill_id) REFERENCES app.skill(skill_id),
      FOREIGN KEY (role_template_id) REFERENCES app.role_template(role_template_id)
    );
END
GO

-- Indices for performance
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.person_calendar') AND name = 'ix_person_calendar_person_date')
    CREATE INDEX ix_person_calendar_person_date ON app.person_calendar(person_id, calendar_date);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.person_daily_allocation') AND name = 'ix_person_daily_allocation_person_date')
    CREATE INDEX ix_person_daily_allocation_person_date ON app.person_daily_allocation(person_id, allocation_date);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.skill_evidence') AND name = 'ix_skill_evidence_person_skill')
    CREATE INDEX ix_skill_evidence_person_skill ON app.skill_evidence(person_id, skill_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.audit_log') AND name = 'ix_audit_log_org_table')
    CREATE INDEX ix_audit_log_org_table ON app.audit_log(org_id, table_name, record_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('app.scarcity_multiplier') AND name = 'ix_scarcity_multiplier_org_skill')
    CREATE INDEX ix_scarcity_multiplier_org_skill ON app.scarcity_multiplier(org_id, skill_id);
