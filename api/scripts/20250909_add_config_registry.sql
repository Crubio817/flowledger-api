-- Centralized Configuration Registry
-- Date: 2025-09-09
-- Consolidates SLA rules, spotlight rules, and quality gates into unified config system

-- Core configuration registry table
CREATE TABLE app.config_registry (
  config_id BIGINT IDENTITY(1,1) PRIMARY KEY,
  org_id INT NOT NULL,
  config_type VARCHAR(32) NOT NULL, -- 'sla_rule', 'spotlight_rule', 'gate_rule', 'ranking_rule'
  config_key VARCHAR(64) NOT NULL,
  config_value NVARCHAR(MAX) NOT NULL, -- JSON configuration
  effective_from DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  effective_to DATETIME2 NULL,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by INT NULL, -- user_id
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_by INT NULL -- user_id
);

-- Indexes for performance
CREATE INDEX IX_config_registry_org_type ON app.config_registry(org_id, config_type, is_active);
CREATE INDEX IX_config_registry_effective ON app.config_registry(effective_from, effective_to) WHERE is_active = 1;
CREATE UNIQUE INDEX UX_config_registry_active ON app.config_registry(org_id, config_type, config_key, effective_from) WHERE is_active = 1 AND effective_to IS NULL;

-- View for active configurations
CREATE VIEW app.v_active_config AS
SELECT 
  config_id,
  org_id,
  config_type,
  config_key,
  config_value,
  effective_from,
  effective_to,
  created_at,
  created_by
FROM app.config_registry
WHERE is_active = 1 
  AND effective_from <= SYSUTCDATETIME()
  AND (effective_to IS NULL OR effective_to > SYSUTCDATETIME());

-- Migrate existing SLA rules to config registry
INSERT INTO app.config_registry (org_id, config_type, config_key, config_value, effective_from, is_active)
SELECT 
  org_id,
  'sla_rule' as config_type,
  CONCAT(item_type, '_', stage, '_', metric) as config_key,
  JSON_QUERY(CONCAT('{"threshold_hrs":', threshold_hrs, ',"rule_id":', rule_id, '}')) as config_value,
  active_from as effective_from,
  is_active
FROM app.sla_rule
WHERE is_active = 1;

-- Sample ranking configuration
INSERT INTO app.config_registry (org_id, config_type, config_key, config_value, effective_from, is_active)
VALUES 
(1, 'ranking_rule', 'today_panel_weights', '{"sla_urgency_weight": 10, "icp_band_weight": 5, "stage_weight": 3, "workload_penalty_per_item": 1}', SYSUTCDATETIME(), 1),
(1, 'gate_rule', 'pink_to_red_requirements', '["budget_confirmed", "technical_scope_defined", "decision_makers_identified", "timeline_agreed"]', SYSUTCDATETIME(), 1),
(1, 'gate_rule', 'submit_requirements', '["proposal_reviewed", "pricing_approved", "legal_terms_agreed", "delivery_plan_finalized"]', SYSUTCDATETIME(), 1);

GO
