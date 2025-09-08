-- Analytics views for Workstream Module v2.1

-- Funnel view: counts at each stage
CREATE OR ALTER VIEW app.v_workstream_funnel AS
SELECT
  s.org_id,
  COUNT(*) as signals,
  SUM(CASE WHEN c.candidate_id IS NOT NULL THEN 1 ELSE 0 END) as candidates,
  SUM(CASE WHEN p.pursuit_id IS NOT NULL THEN 1 ELSE 0 END) as pursuits,
  SUM(CASE WHEN p.pursuit_stage = 'won' THEN 1 ELSE 0 END) as won,
  SUM(CASE WHEN p.pursuit_stage = 'lost' THEN 1 ELSE 0 END) as lost
FROM app.signal s
LEFT JOIN app.candidate_signal cs ON s.signal_id = cs.signal_id
LEFT JOIN app.candidate c ON cs.candidate_id = c.candidate_id AND s.org_id = c.org_id
LEFT JOIN app.pursuit p ON c.candidate_id = p.candidate_id AND c.org_id = p.org_id
GROUP BY s.org_id;
GO

-- SLA view: breaches and overdue items
CREATE OR ALTER VIEW app.v_workstream_sla AS
SELECT
  org_id,
  item_type,
  item_id,
  rule_id,
  breached_at,
  reason_code
FROM app.sla_breach
WHERE resolved_at IS NULL;
GO

-- Pursuit performance view
CREATE OR ALTER VIEW app.v_pursuit_performance AS
SELECT
  p.org_id,
  p.pursuit_id,
  p.pursuit_stage,
  pr.sent_at,
  DATEDIFF(hour, pr.sent_at, SYSUTCDATETIME()) as hours_since_sent,
  CASE WHEN p.pursuit_stage IN ('won', 'lost') THEN DATEDIFF(hour, pr.sent_at, p.updated_at) ELSE NULL END as hours_to_close
FROM app.pursuit p
JOIN app.proposal pr ON p.pursuit_id = pr.pursuit_id AND p.org_id = pr.org_id
WHERE pr.status = 'sent';
GO

-- SLA breach summary view
CREATE OR ALTER VIEW app.v_sla_summary AS
SELECT
  org_id,
  item_type,
  COUNT(*) as total_breaches,
  COUNT(CASE WHEN resolved_at IS NULL THEN 1 END) as active_breaches,
  MAX(breached_at) as latest_breach
FROM app.sla_breach
GROUP BY org_id, item_type;
GO

-- Conversion funnel with time metrics
CREATE OR ALTER VIEW app.v_conversion_funnel AS
SELECT
  s.org_id,
  COUNT(DISTINCT s.signal_id) as signals,
  COUNT(DISTINCT c.candidate_id) as candidates,
  COUNT(DISTINCT p.pursuit_id) as pursuits,
  COUNT(DISTINCT CASE WHEN p.pursuit_stage = 'won' THEN p.pursuit_id END) as won,
  COUNT(DISTINCT CASE WHEN p.pursuit_stage = 'lost' THEN p.pursuit_id END) as lost,
  AVG(CASE WHEN p.pursuit_stage IN ('won', 'lost') THEN DATEDIFF(hour, c.created_at, p.updated_at) END) as avg_hours_to_close
FROM app.signal s
LEFT JOIN app.candidate_signal cs ON s.signal_id = cs.signal_id
LEFT JOIN app.candidate c ON cs.candidate_id = c.candidate_id AND s.org_id = c.org_id
LEFT JOIN app.pursuit p ON c.candidate_id = p.candidate_id AND c.org_id = p.org_id
GROUP BY s.org_id;
GO
