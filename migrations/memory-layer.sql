-- Memory Layer for FlowLedger
-- Integrates with existing work_event pattern and multi-tenant architecture
-- Start with existing entities: pursuit, engagement, candidate, comms_thread

CREATE SCHEMA memory;
GO

-- Core memory atom table
CREATE TABLE memory.atom (
  atom_id INT IDENTITY(1,1) PRIMARY KEY,
  org_id INT NOT NULL,
  entity_type VARCHAR(32) NOT NULL, -- 'pursuit'|'engagement'|'candidate'|'comms_thread'
  entity_id INT NOT NULL,
  atom_type VARCHAR(32) NOT NULL,   -- 'decision'|'risk'|'preference'|'status'|'note'
  content NVARCHAR(1000) NOT NULL,
  content_hash BINARY(32) NOT NULL,
  source_system VARCHAR(32) NOT NULL DEFAULT 'app',
  source_id NVARCHAR(200) NOT NULL,
  source_url NVARCHAR(400) NULL,
  author_id NVARCHAR(100) NULL,
  occurred_at DATETIME2 NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  score DECIMAL(5,2) NOT NULL DEFAULT 50.0,
  expires_at DATETIME2 NULL,
  is_redacted BIT NOT NULL DEFAULT 0,
  tags NVARCHAR(400) NULL,
  CONSTRAINT UQ_memory_atom_content UNIQUE (org_id, entity_type, entity_id, content_hash),
  INDEX IX_memory_atom_lookup (org_id, entity_type, entity_id, is_redacted, occurred_at DESC)
);

-- Cached summaries for fast reads
CREATE TABLE memory.summary (
  org_id INT NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id INT NOT NULL,
  summary_json NVARCHAR(4000) NOT NULL,
  top_atoms_json NVARCHAR(4000) NOT NULL,
  last_built_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  version INT NOT NULL DEFAULT 1,
  PRIMARY KEY CLUSTERED (org_id, entity_type, entity_id)
);

-- Track user views for "Since you last viewed" feature
CREATE TABLE memory.view_state (
  org_id INT NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id INT NOT NULL,
  user_id NVARCHAR(100) NOT NULL,
  last_viewed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (org_id, entity_type, entity_id, user_id)
);

-- Governance: redactions and corrections
CREATE TABLE memory.redaction (
  redaction_id INT IDENTITY(1,1) PRIMARY KEY,
  org_id INT NOT NULL,
  atom_id INT NOT NULL,
  action VARCHAR(16) NOT NULL, -- 'redact'|'correct'
  reason NVARCHAR(400) NULL,
  actor_user_id NVARCHAR(100) NOT NULL,
  acted_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  INDEX IX_redaction_atom (atom_id)
);

-- Add to existing work_event table for memory events
-- (work_event table already exists, just documenting the event types we'll use)
-- Event types: 'memory.atom.created', 'memory.summary.rebuild', 'memory.atom.redact'
