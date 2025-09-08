-- Workstream Module v2.1 - Final Tightenings
-- Date: 2025-09-07
-- Audit-safe outbox, idempotency rails, SLA coverage, checklist gating

-- 1a) Outbox: stop deleting; mark processed + track attempts & processor
-- Check if columns exist before adding
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('app.work_event') AND name = 'processed_at')
BEGIN
    ALTER TABLE app.work_event ADD processed_at DATETIME2 NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('app.work_event') AND name = 'processed_by')
BEGIN
    ALTER TABLE app.work_event ADD processed_by VARCHAR(64) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('app.work_event') AND name = 'attempts')
BEGIN
    ALTER TABLE app.work_event ADD attempts INT NOT NULL DEFAULT 0;
END
GO

-- Efficient pull of unprocessed (drop if exists first)
DROP INDEX IF EXISTS IX_event_unprocessed ON app.work_event;
CREATE INDEX IX_event_unprocessed ON app.work_event(processed_at) WHERE processed_at IS NULL;
GO

-- 1b) One pursuit per candidate (per org) - drop if exists first
DROP INDEX IF EXISTS UX_pursuit_once_per_candidate ON app.pursuit;
CREATE UNIQUE INDEX UX_pursuit_once_per_candidate
  ON app.pursuit(org_id, candidate_id);
GO

-- 1c) Exactly-one proposal version (guards v1 & later) - drop if exists first
DROP INDEX IF EXISTS UX_proposal_version_once ON app.proposal;
CREATE UNIQUE INDEX UX_proposal_version_once
  ON app.proposal(org_id, pursuit_id, version);
GO

-- 1d) Candidate↔Signal linking dedupe - drop if exists first
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('app.UX_cand_signal') AND type = 'UQ')
BEGIN
    ALTER TABLE app.candidate_signal
      ADD CONSTRAINT UX_cand_signal UNIQUE (candidate_id, signal_id);
END
GO

-- 1e) (Optional) link dedupe per target - drop if exists first
DROP INDEX IF EXISTS UX_link_unique ON app.work_item_link;
CREATE UNIQUE INDEX UX_link_unique
  ON app.work_item_link(org_id, item_type, item_id, link_type, target_type, target_ref);
GO

-- 2) Checklist gating for Pink/Red → Submit - drop if exists first
DROP TABLE IF EXISTS app.pursuit_checklist;
CREATE TABLE app.pursuit_checklist (
  checklist_id  BIGINT IDENTITY PRIMARY KEY,
  org_id        INT NOT NULL,
  pursuit_id    BIGINT NOT NULL,
  name          NVARCHAR(120) NOT NULL,
  is_required   BIT NOT NULL DEFAULT 1,
  is_done       BIT NOT NULL DEFAULT 0,
  done_at       DATETIME2 NULL,
  UNIQUE (org_id, pursuit_id, name)
);
GO

-- Helper view: all required items completed? - drop if exists first
IF EXISTS (SELECT 1 FROM sys.views WHERE object_id = OBJECT_ID('app.v_pursuit_checklist_ready'))
BEGIN
    DROP VIEW app.v_pursuit_checklist_ready;
END
GO

CREATE VIEW app.v_pursuit_checklist_ready AS
SELECT pc.org_id, pc.pursuit_id,
  CASE WHEN MIN(CASE WHEN is_required=1 AND is_done=0 THEN 0 ELSE 1 END) = 1 THEN 1 ELSE 0 END AS ready
FROM app.pursuit_checklist pc
GROUP BY pc.org_id, pc.pursuit_id;
GO

-- 3) SLA Rules seed - only insert if not exists
IF NOT EXISTS (SELECT 1 FROM app.sla_rule WHERE org_id = 1 AND metric = 'triage_sla')
BEGIN
    INSERT INTO app.sla_rule(org_id, item_type, stage, metric, threshold_hrs, active_from, is_active)
    VALUES (1, 'signal', NULL, 'triage_sla', 24, SYSUTCDATETIME(), 1);
END

IF NOT EXISTS (SELECT 1 FROM app.sla_rule WHERE org_id = 1 AND metric = 'proposal_sla')
BEGIN
    INSERT INTO app.sla_rule(org_id, item_type, stage, metric, threshold_hrs, active_from, is_active)
    VALUES (1, 'candidate', 'promoted', 'proposal_sla', 72, SYSUTCDATETIME(), 1);
END

IF NOT EXISTS (SELECT 1 FROM app.sla_rule WHERE org_id = 1 AND metric = 'response_sla')
BEGIN
    INSERT INTO app.sla_rule(org_id, item_type, stage, metric, threshold_hrs, active_from, is_active)
    VALUES (1, 'pursuit', 'submit', 'response_sla', 96, SYSUTCDATETIME(), 1);
END
GO

-- 5) Today Panel view - handled in separate script
-- See 20250907_today_panel_view.sql
