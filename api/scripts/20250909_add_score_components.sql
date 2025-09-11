-- Spotlight Score Components Tracking
-- Date: 2025-09-09
-- Enables explainable AI scoring with detailed component breakdown

-- Score components table for detailed scoring breakdown
CREATE TABLE app.spotlight_score_components (
  component_id BIGINT IDENTITY(1,1) PRIMARY KEY,
  org_id INT NOT NULL,
  item_type VARCHAR(12) NOT NULL, -- 'signal', 'candidate', 'pursuit'
  item_id BIGINT NOT NULL,
  spotlight_id INT NOT NULL,
  component_name VARCHAR(64) NOT NULL, -- 'industry_match', 'budget_fit', 'geo_alignment', etc.
  component_score DECIMAL(6,2) NOT NULL, -- Can be positive or negative
  component_weight DECIMAL(4,2) NOT NULL DEFAULT 1.0,
  component_reason NVARCHAR(200) NULL, -- Human-readable explanation
  max_possible_score DECIMAL(6,2) NOT NULL DEFAULT 100.0,
  scored_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  algorithm_version VARCHAR(16) NOT NULL DEFAULT 'v1.0'
);

-- Indexes for performance
CREATE INDEX IX_score_components_item ON app.spotlight_score_components(org_id, item_type, item_id, scored_at DESC);
CREATE INDEX IX_score_components_spotlight ON app.spotlight_score_components(org_id, spotlight_id, scored_at DESC);
CREATE INDEX IX_score_components_name ON app.spotlight_score_components(org_id, component_name, scored_at DESC);

-- Score summary view with component breakdown
CREATE VIEW app.v_spotlight_score_summary AS
SELECT 
  ssc.org_id,
  ssc.item_type,
  ssc.item_id,
  ssc.spotlight_id,
  ssc.scored_at,
  ssc.algorithm_version,
  -- Total weighted score
  SUM(ssc.component_score * ssc.component_weight) as total_score,
  -- Component breakdown as JSON
  JSON_QUERY('[' + STRING_AGG(
    JSON_QUERY(CONCAT(
      '{"name":"', ssc.component_name, 
      '","score":', ssc.component_score, 
      ',"weight":', ssc.component_weight,
      ',"reason":"', ISNULL(ssc.component_reason, ''), 
      '","contribution":', (ssc.component_score * ssc.component_weight),
      '}'
    )), ','
  ) + ']') as score_breakdown,
  -- Top positive and negative contributors
  MAX(CASE WHEN ssc.component_score > 0 THEN CONCAT('+', ssc.component_score, ' ', ssc.component_name) END) as top_positive,
  MIN(CASE WHEN ssc.component_score < 0 THEN CONCAT(ssc.component_score, ' ', ssc.component_name) END) as top_negative,
  COUNT(*) as component_count
FROM app.spotlight_score_components ssc
GROUP BY 
  ssc.org_id, ssc.item_type, ssc.item_id, ssc.spotlight_id, 
  ssc.scored_at, ssc.algorithm_version;

-- Sample score components for demonstration
INSERT INTO app.spotlight_score_components (org_id, item_type, item_id, spotlight_id, component_name, component_score, component_weight, component_reason, max_possible_score)
VALUES 
-- Example for signal_id = 1, spotlight_id = 1
(1, 'signal', 1, 1, 'industry_match', 12.0, 1.0, 'Perfect match: Financial Services sector', 15.0),
(1, 'signal', 1, 1, 'budget_fit', -5.0, 0.8, 'Budget below ideal range: $50K vs $100K+ target', 20.0),
(1, 'signal', 1, 1, 'geo_alignment', 8.0, 0.6, 'Same timezone, established market presence', 10.0),
(1, 'signal', 1, 1, 'urgency_match', 15.0, 1.2, 'High urgency signal matches fast delivery capability', 15.0),
(1, 'signal', 1, 1, 'tech_stack_fit', 3.0, 0.7, 'Partial technology alignment, some learning curve', 10.0),
(1, 'signal', 1, 1, 'company_size_fit', 7.0, 0.9, 'Mid-market client fits our sweet spot', 10.0);

-- Historical scoring tracking table for audit and trend analysis
CREATE TABLE app.spotlight_scoring_history (
  history_id BIGINT IDENTITY(1,1) PRIMARY KEY,
  org_id INT NOT NULL,
  item_type VARCHAR(12) NOT NULL,
  item_id BIGINT NOT NULL,
  spotlight_id INT NOT NULL,
  previous_score DECIMAL(6,2) NULL,
  new_score DECIMAL(6,2) NOT NULL,
  score_delta DECIMAL(6,2) NOT NULL,
  change_reason NVARCHAR(300) NULL,
  changed_components NVARCHAR(MAX) NULL, -- JSON array of changed component names
  algorithm_version VARCHAR(16) NOT NULL,
  scored_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  scored_by INT NULL -- user_id or system
);

CREATE INDEX IX_scoring_history_item ON app.spotlight_scoring_history(org_id, item_type, item_id, scored_at DESC);

GO
