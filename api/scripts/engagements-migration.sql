-- Engagements Module Database Migration
-- Run after core modules migration: npm run db:migrate:core-modules

-- Core engagement table (extends existing if present)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='engagement' AND xtype='U')
CREATE TABLE app.engagement (
  engagement_id BIGINT IDENTITY PRIMARY KEY,
  org_id INT NOT NULL,
  client_id BIGINT NOT NULL,
  [type] VARCHAR(10) NOT NULL CHECK ([type] IN ('audit','project','job')),
  [name] NVARCHAR(200) NOT NULL,
  owner_id BIGINT NOT NULL,
  [status] VARCHAR(12) NOT NULL CHECK ([status] IN ('active','paused','complete','cancelled')),
  health VARCHAR(6) NOT NULL CHECK (health IN ('green','yellow','red')),
  start_at DATETIME2 NOT NULL,
  due_at DATETIME2 NULL,
  contract_id BIGINT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_engagement_client FOREIGN KEY (client_id) REFERENCES app.clients(client_id)
);
CREATE INDEX IX_engagement_org_status ON app.engagement(org_id, status, due_at);
CREATE INDEX IX_engagement_client ON app.engagement(org_id, client_id);

-- Projects: features and story tasks
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='feature' AND xtype='U')
CREATE TABLE app.feature (
  feature_id BIGINT IDENTITY PRIMARY KEY,
  org_id INT NOT NULL,
  engagement_id BIGINT NOT NULL,
  title NVARCHAR(200) NOT NULL,
  priority VARCHAR(12) NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  [state] VARCHAR(12) NOT NULL CHECK ([state] IN ('todo','in_progress','blocked','done')),
  order_index INT NOT NULL DEFAULT 0,
  due_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_feature_engagement FOREIGN KEY (engagement_id) REFERENCES app.engagement(engagement_id)
);
CREATE INDEX IX_feature_org_eng_state ON app.feature(org_id, engagement_id, state, due_at);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='story_task' AND xtype='U')
CREATE TABLE app.story_task (
  story_task_id BIGINT IDENTITY PRIMARY KEY,
  org_id INT NOT NULL,
  feature_id BIGINT NOT NULL,
  title NVARCHAR(200) NOT NULL,
  [desc] NVARCHAR(1000) NULL,
  assignee_id BIGINT NULL,
  estimate_pts DECIMAL(5,2) NULL,
  estimate_hours DECIMAL(6,2) NULL,
  [state] VARCHAR(12) NOT NULL CHECK ([state] IN ('todo','in_progress','blocked','review','done')),
  due_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_story_task_feature FOREIGN KEY (feature_id) REFERENCES app.feature(feature_id)
);
CREATE INDEX IX_story_task_org_feature_state ON app.story_task(org_id, feature_id, state, due_at);

-- Audits: paths and steps
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='audit_path' AND xtype='U')
CREATE TABLE app.audit_path (
  audit_path_id BIGINT IDENTITY PRIMARY KEY,
  org_id INT NOT NULL,
  engagement_id BIGINT NOT NULL,
  [name] NVARCHAR(200) NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_audit_path_engagement FOREIGN KEY (engagement_id) REFERENCES app.engagement(engagement_id)
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='audit_step' AND xtype='U')
CREATE TABLE app.audit_step (
  audit_step_id BIGINT IDENTITY PRIMARY KEY,
  org_id INT NOT NULL,
  audit_path_id BIGINT NOT NULL,
  title NVARCHAR(200) NOT NULL,
  [desc] NVARCHAR(1000) NULL,
  owner_id BIGINT NULL,
  [state] VARCHAR(12) NOT NULL CHECK ([state] IN ('todo','in_progress','blocked','done')),
  severity VARCHAR(6) NOT NULL CHECK (severity IN ('low','med','high')),
  due_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_audit_step_path FOREIGN KEY (audit_path_id) REFERENCES app.audit_path(audit_path_id)
);
CREATE INDEX IX_audit_step_org_path_state ON app.audit_step(org_id, audit_path_id, state, due_at);

-- Jobs: simple tasks
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='job_task' AND xtype='U')
CREATE TABLE app.job_task (
  job_task_id BIGINT IDENTITY PRIMARY KEY,
  org_id INT NOT NULL,
  engagement_id BIGINT NOT NULL,
  title NVARCHAR(200) NOT NULL,
  [desc] NVARCHAR(1000) NULL,
  assignee_id BIGINT NULL,
  estimate_hours DECIMAL(6,2) NULL,
  [state] VARCHAR(12) NOT NULL CHECK ([state] IN ('todo','in_progress','blocked','done')),
  due_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_job_task_engagement FOREIGN KEY (engagement_id) REFERENCES app.engagement(engagement_id)
);
CREATE INDEX IX_job_task_org_eng_state ON app.job_task(org_id, engagement_id, state, due_at);

-- V2 Extensions: Milestones, Dependencies, Change Requests, etc.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='milestone' AND xtype='U')
CREATE TABLE app.milestone (
  milestone_id BIGINT IDENTITY PRIMARY KEY,
  org_id INT NOT NULL,
  engagement_id BIGINT NOT NULL,
  [name] NVARCHAR(200) NOT NULL,
  [type] VARCHAR(16) NOT NULL CHECK ([type] IN ('kickoff','phase','delivery','signoff')),
  [status] VARCHAR(12) NOT NULL CHECK ([status] IN ('planned','in_progress','done','cancelled')),
  due_at DATETIME2 NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_milestone_engagement FOREIGN KEY (engagement_id) REFERENCES app.engagement(engagement_id)
);
CREATE INDEX IX_milestone_org_eng_status ON app.milestone(org_id, engagement_id, status, due_at);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='dependency' AND xtype='U')
CREATE TABLE app.dependency (
  dependency_id BIGINT IDENTITY PRIMARY KEY,
  org_id INT NOT NULL,
  from_type VARCHAR(16) NOT NULL CHECK (from_type IN ('task','step','feature')),
  from_id BIGINT NOT NULL,
  to_type VARCHAR(16) NOT NULL CHECK (to_type IN ('task','step','feature')),
  to_id BIGINT NOT NULL,
  dep_type CHAR(2) NOT NULL CHECK (dep_type IN ('FS','SS','FF','SF')),
  lag_days INT NOT NULL DEFAULT 0,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_dependency UNIQUE (org_id, from_type, from_id, to_type, to_id, dep_type)
);
CREATE INDEX IX_dependency_org_to ON app.dependency(org_id, to_type, to_id);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='change_request' AND xtype='U')
CREATE TABLE app.change_request (
  change_request_id BIGINT IDENTITY PRIMARY KEY,
  org_id INT NOT NULL,
  engagement_id BIGINT NOT NULL,
  origin VARCHAR(10) NOT NULL CHECK (origin IN ('comms','client','internal')),
  scope_delta NVARCHAR(MAX) NULL,
  hours_delta DECIMAL(18,2) NULL,
  value_delta DECIMAL(18,2) NULL,
  [status] VARCHAR(12) NOT NULL CHECK ([status] IN ('draft','review','approved','rejected')),
  created_by BIGINT NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  decided_at DATETIME2 NULL,
  CONSTRAINT FK_change_request_engagement FOREIGN KEY (engagement_id) REFERENCES app.engagement(engagement_id)
);
CREATE INDEX IX_change_request_org_eng_status ON app.change_request(org_id, engagement_id, status);

-- Evidence links for audit steps
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='evidence_link' AND xtype='U')
CREATE TABLE app.evidence_link (
  evidence_link_id BIGINT IDENTITY PRIMARY KEY,
  org_id INT NOT NULL,
  audit_step_id BIGINT NOT NULL,
  doc_id BIGINT NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_evidence_step FOREIGN KEY (audit_step_id) REFERENCES app.audit_step(audit_step_id),
  CONSTRAINT FK_evidence_doc FOREIGN KEY (doc_id) REFERENCES app.client_documents(doc_id)
);

-- Extend existing tables for v2 features
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app.story_task') AND name = 'story_points')
ALTER TABLE app.story_task ADD story_points DECIMAL(5,2) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app.story_task') AND name = 'blocked_by')
ALTER TABLE app.story_task ADD blocked_by NVARCHAR(MAX) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('app.story_task') AND name = 'depends_on')
ALTER TABLE app.story_task ADD depends_on NVARCHAR(MAX) NULL;

-- Sample data for testing
INSERT INTO app.engagement (org_id, client_id, type, name, owner_id, status, health, start_at, due_at)
SELECT 1, c.client_id, 'project', 'Sample Project', 1, 'active', 'green', '2025-09-08', '2025-12-08'
FROM app.clients c WHERE c.org_id = 1 AND c.client_id = (SELECT TOP 1 client_id FROM app.clients WHERE org_id = 1);

PRINT 'Engagements module database migration completed successfully';</content>
<parameter name="filePath">/workspaces/flowledger-api/api/scripts/engagements-migration.sql
