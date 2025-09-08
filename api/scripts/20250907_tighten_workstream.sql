-- Tightening Workstream Module v2.1
-- Date: 2025-09-07
-- High-leverage improvements for idempotency, guards, and observability

-- Idempotency: One pursuit per candidate
CREATE UNIQUE INDEX UX_pursuit_once_per_candidate
  ON app.pursuit(org_id, candidate_id);
GO

-- Idempotency: One v1 proposal per pursuit
CREATE UNIQUE INDEX UX_proposal_v1_once
  ON app.proposal(org_id, pursuit_id, version)
  WHERE version = 1;
GO

-- Signals → Candidate dedupe: Prevent double-attach
ALTER TABLE app.candidate_signal
  ADD CONSTRAINT UX_cand_signal UNIQUE (candidate_id, signal_id);
GO

-- SLA Rules: Add triage and proposal SLAs
INSERT INTO app.sla_rule (org_id, item_type, stage, metric, threshold_hrs, active_from, is_active)
VALUES
  (1, 'signal', NULL, 'triage_sla', 24, SYSUTCDATETIME(), 1),  -- Signal→first touch within 24h
  (1, 'candidate', NULL, 'proposal_sla', 168, SYSUTCDATETIME(), 1);  -- Promote→Submit within 7 days
GO

-- Stage gating: Checklist table for Pink/Red requirements
CREATE TABLE app.pursuit_checklist (
  checklist_id    BIGINT IDENTITY PRIMARY KEY,
  org_id          INT NOT NULL,
  pursuit_id      BIGINT NOT NULL,
  checklist_type  VARCHAR(8) CHECK (checklist_type IN ('pink','red')),
  item_name       VARCHAR(64) NOT NULL,
  is_complete     BIT NOT NULL DEFAULT 0,
  completed_at    DATETIME2 NULL,
  completed_by    INT NULL,
  created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UNIQUE (org_id, pursuit_id, checklist_type, item_name)
);
GO

-- Nice-to-have: Lost reason taxonomy
CREATE TABLE app.lost_reason (
  reason_id     INT IDENTITY PRIMARY KEY,
  org_id        INT NOT NULL,
  reason_code   VARCHAR(32) NOT NULL,
  reason_text   NVARCHAR(200) NOT NULL,
  category      VARCHAR(16) CHECK (category IN ('timing','competition','budget','fit','other')),
  is_active     BIT NOT NULL DEFAULT 1,
  created_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UNIQUE (org_id, reason_code)
);
GO

-- Insert default lost reasons
INSERT INTO app.lost_reason (org_id, reason_code, reason_text, category)
VALUES
  (1, 'timing', 'Not ready to move forward', 'timing'),
  (1, 'competition', 'Chose competitor', 'competition'),
  (1, 'budget', 'Budget constraints', 'budget'),
  (1, 'fit', 'Not a good fit', 'fit'),
  (1, 'other', 'Other', 'other');
GO

-- Nice-to-have: Comms lag view
CREATE OR ALTER VIEW app.v_comms_lag AS
SELECT
  org_id,
  item_type,
  item_id,
  DATEDIFF(hour, last_touch_at, SYSUTCDATETIME()) as hours_since_touch,
  CASE
    WHEN DATEDIFF(hour, last_touch_at, SYSUTCDATETIME()) < 24 THEN 'today'
    WHEN DATEDIFF(hour, last_touch_at, SYSUTCDATETIME()) < 168 THEN 'this_week'
    ELSE 'older'
  END as lag_category
FROM (
  SELECT org_id, 'signal' as item_type, signal_id as item_id, updated_at as last_touch_at
  FROM app.signal
  UNION ALL
  SELECT org_id, 'candidate' as item_type, candidate_id as item_id, last_touch_at
  FROM app.candidate
  WHERE last_touch_at IS NOT NULL
  UNION ALL
  SELECT org_id, 'pursuit' as item_type, pursuit_id as item_id, updated_at as last_touch_at
  FROM app.pursuit
) combined;
GO
