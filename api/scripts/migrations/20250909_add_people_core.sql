-- Migration: 20250909_add_people_core.sql
-- Adds core tables for People module: skill, person, role_template, staffing_request, assignment
-- Includes multi-tenant org_id, audit fields, and constraints

-- Skills taxonomy
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='skill' AND xtype='U')
BEGIN
    CREATE TABLE app.skill (
      skill_id bigint IDENTITY(1,1) PRIMARY KEY,
      org_id int NOT NULL,
      name nvarchar(100) NOT NULL,
      type varchar(10) NOT NULL CHECK (type IN ('hard', 'soft', 'cert')),
      description nvarchar(500),
      expires_at datetime2,
      evidence_refs nvarchar(MAX), -- JSON array of evidence references
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      row_version timestamp NOT NULL
    );
END
GO

-- People (staff)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='person' AND xtype='U')
BEGIN
    CREATE TABLE app.person (
      person_id bigint IDENTITY(1,1) PRIMARY KEY,
      org_id int NOT NULL,
      name nvarchar(200) NOT NULL,
      base_role_template_id bigint, -- FK to role_template
      level varchar(5) NOT NULL CHECK (level IN ('L1', 'L2', 'L3', 'L4', 'L5')),
      cost_rate decimal(10,2) NOT NULL,
      availability_pct decimal(5,2) NOT NULL DEFAULT 100.0 CHECK (availability_pct BETWEEN 0 AND 100),
      timezone varchar(50) NOT NULL,
      location nvarchar(100),
      reliability_score decimal(3,2) DEFAULT 0.8 CHECK (reliability_score BETWEEN 0 AND 1),
      client_history nvarchar(MAX), -- JSON array of past clients
      industry_history nvarchar(MAX), -- JSON array of industries
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      row_version timestamp NOT NULL
    );
END
GO

-- Person skills with levels and recency
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='person_skill' AND xtype='U')
BEGIN
    CREATE TABLE app.person_skill (
      person_id bigint NOT NULL,
      skill_id bigint NOT NULL,
      level int NOT NULL CHECK (level BETWEEN 1 AND 5),
      last_used_at datetime2,
      confidence decimal(3,2) DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
      evidence nvarchar(MAX), -- JSON evidence details
      PRIMARY KEY (person_id, skill_id),
      FOREIGN KEY (person_id) REFERENCES app.person(person_id) ON DELETE CASCADE,
      FOREIGN KEY (skill_id) REFERENCES app.skill(skill_id) ON DELETE CASCADE
    );
END
GO

-- Role templates
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='role_template' AND xtype='U')
BEGIN
    CREATE TABLE app.role_template (
      role_template_id bigint IDENTITY(1,1) PRIMARY KEY,
      org_id int NOT NULL,
      name nvarchar(100) NOT NULL,
      level varchar(5) NOT NULL CHECK (level IN ('L1', 'L2', 'L3', 'L4', 'L5')),
      description nvarchar(500),
      requirements nvarchar(MAX), -- JSON: [{skill_id, min_level, weight, must_have}]
      soft_targets nvarchar(MAX), -- JSON: [{skill_id, weight}]
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      row_version timestamp NOT NULL
    );
END
GO

-- Staffing requests
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='staffing_request' AND xtype='U')
BEGIN
    CREATE TABLE app.staffing_request (
      staffing_request_id bigint IDENTITY(1,1) PRIMARY KEY,
      org_id int NOT NULL,
      parent_type varchar(20) NOT NULL CHECK (parent_type IN ('pursuit', 'engagement')),
      parent_id bigint NOT NULL,
      role_template_id bigint NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      effort_hours decimal(8,2) NOT NULL,
      target_alloc_pct decimal(5,2),
      must_have_skills nvarchar(MAX), -- JSON array of skill_ids
      nice_to_have_skills nvarchar(MAX), -- JSON array of skill_ids
      timezone_window varchar(50),
      continuity_preference varchar(20), -- 'high', 'medium', 'low'
      budget_cap decimal(12,2),
      status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'on_hold', 'filled', 'cancelled')),
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      row_version timestamp NOT NULL,
      FOREIGN KEY (role_template_id) REFERENCES app.role_template(role_template_id)
    );
END
GO

-- Assignments with immutable snapshots
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='assignment' AND xtype='U')
BEGIN
    CREATE TABLE app.assignment (
      assignment_id bigint IDENTITY(1,1) PRIMARY KEY,
      org_id int NOT NULL,
      person_id bigint NOT NULL,
      engagement_id bigint NOT NULL, -- Assuming engagement table exists
      role_template_id bigint NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      alloc_pct decimal(5,2) NOT NULL DEFAULT 100.0 CHECK (alloc_pct BETWEEN 0 AND 100),
      status varchar(20) NOT NULL DEFAULT 'tentative' CHECK (status IN ('tentative', 'firm')),
      bill_rate_snapshot decimal(10,2) NOT NULL,
      cost_rate_snapshot decimal(10,2) NOT NULL,
      currency varchar(3) NOT NULL DEFAULT 'USD',
      continuity_index decimal(3,2) DEFAULT 0.0 CHECK (continuity_index BETWEEN 0 AND 1),
      performance_note nvarchar(500),
      actual_hours decimal(8,2),
      created_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      updated_at datetime2 NOT NULL DEFAULT GETUTCDATE(),
      row_version timestamp NOT NULL,
      FOREIGN KEY (person_id) REFERENCES app.person(person_id),
      FOREIGN KEY (role_template_id) REFERENCES app.role_template(role_template_id)
    );
END
GO

-- Indices for performance
DROP INDEX IF EXISTS uq_skill_org_name ON app.skill;
CREATE UNIQUE INDEX uq_skill_org_name ON app.skill(org_id, name);

DROP INDEX IF EXISTS uq_role_template_org_name_level ON app.role_template;
CREATE UNIQUE INDEX uq_role_template_org_name_level ON app.role_template(org_id, name, level);

DROP INDEX IF EXISTS ix_person_org_id ON app.person;
CREATE INDEX ix_person_org_id ON app.person(org_id);

DROP INDEX IF EXISTS ix_person_skill_person ON app.person_skill;
CREATE INDEX ix_person_skill_person ON app.person_skill(person_id);

DROP INDEX IF EXISTS ix_person_skill_skill ON app.person_skill;
CREATE INDEX ix_person_skill_skill ON app.person_skill(skill_id);

DROP INDEX IF EXISTS ix_role_template_org_id ON app.role_template;
CREATE INDEX ix_role_template_org_id ON app.role_template(org_id);

DROP INDEX IF EXISTS ix_staffing_request_org_parent ON app.staffing_request;
CREATE INDEX ix_staffing_request_org_parent ON app.staffing_request(org_id, parent_type, parent_id);

DROP INDEX IF EXISTS ix_assignment_org_person ON app.assignment;
CREATE INDEX ix_assignment_org_person ON app.assignment(org_id, person_id);

DROP INDEX IF EXISTS ix_assignment_dates ON app.assignment;
CREATE INDEX ix_assignment_dates ON app.assignment(start_date, end_date);
GO

-- Trigger to prevent snapshot updates (must be in its own batch)
DROP TRIGGER IF EXISTS app.trg_prevent_assignment_snapshot_update;
GO

CREATE TRIGGER app.trg_prevent_assignment_snapshot_update
ON app.assignment
AFTER UPDATE
AS
BEGIN
  IF UPDATE(bill_rate_snapshot) OR UPDATE(cost_rate_snapshot)
  BEGIN
    RAISERROR('Assignment snapshots are immutable', 16, 1);
    ROLLBACK TRANSACTION;
  END;
END;
GO
