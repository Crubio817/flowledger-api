-- Enhanced Today Panel with Intelligent Ranking
-- Date: 2025-09-09
-- Replaces basic today panel with priority-scored ranking system

-- Drop existing view
IF EXISTS (SELECT 1 FROM sys.views WHERE object_id = OBJECT_ID('app.v_today_panel'))
  DROP VIEW app.v_today_panel;

-- Enhanced today panel with priority scoring
CREATE VIEW app.v_today_panel AS
WITH ranked_items AS (
  -- Candidates with priority scoring
  SELECT 
    'candidate' AS item_type, 
    c.candidate_id AS item_id, 
    c.org_id,
    c.title AS label,
    c.status AS state,
    c.last_touch_at,
    NULL AS due_date,
    COALESCE(b.metric, '') AS sla_metric,
    CASE 
      WHEN b.breach_id IS NOT NULL THEN 'red'
      WHEN DATEDIFF(hour, c.last_touch_at, SYSUTCDATETIME()) > 72 THEN 'amber'
      ELSE 'green' 
    END AS badge,
    -- Priority scoring calculation
    (
      -- SLA urgency weight (higher for breaches and aging items)
      CASE 
        WHEN b.breach_id IS NOT NULL THEN 100 -- Critical: SLA breached
        WHEN DATEDIFF(hour, c.last_touch_at, SYSUTCDATETIME()) > 168 THEN 50 -- High: Over 1 week
        WHEN DATEDIFF(hour, c.last_touch_at, SYSUTCDATETIME()) > 72 THEN 25 -- Medium: Over 3 days
        ELSE 10 -- Low: Recent activity
      END +
      -- ICP band weight (from spotlight scoring)
      CASE 
        WHEN c.value_band = 'high' THEN 30
        WHEN c.value_band = 'med' THEN 15
        WHEN c.value_band = 'low' THEN 5
        ELSE 0
      END +
      -- Stage weight (closer to conversion = higher priority)
      CASE 
        WHEN c.status = 'promoted' THEN 25
        WHEN c.status = 'nurture' THEN 15
        WHEN c.status = 'triaged' THEN 10
        WHEN c.status = 'on_hold' THEN 5
        ELSE 0
      END -
      -- Workload penalty (reduce priority if owner has many items)
      CASE 
        WHEN c.owner_user_id IS NOT NULL THEN 
          (SELECT COUNT(*) FROM app.candidate c2 
           WHERE c2.owner_user_id = c.owner_user_id 
           AND c2.org_id = c.org_id 
           AND c2.status IN ('triaged','nurture','on_hold')) * 2
        ELSE 0
      END
    ) AS priority_score,
    c.owner_user_id,
    c.value_band as icp_band,
    DATEDIFF(hour, c.last_touch_at, SYSUTCDATETIME()) as hours_since_touch
  FROM app.candidate c
  LEFT JOIN app.sla_breach b ON b.item_type='candidate' AND b.item_id=c.candidate_id AND b.org_id=c.org_id AND b.resolved_at IS NULL
  WHERE c.status IN ('triaged','nurture','on_hold')

  UNION ALL

  -- Pursuits with priority scoring
  SELECT 
    'pursuit' AS item_type, 
    p.pursuit_id AS item_id, 
    p.org_id,
    CONCAT('Pursuit #', p.pursuit_id, ': ', c.title) AS label,
    p.pursuit_stage AS state,
    COALESCE((SELECT MAX(happened_at) FROM app.work_event e WHERE e.item_type='pursuit' AND e.item_id=p.pursuit_id), p.updated_at) AS last_touch_at,
    p.due_date,
    COALESCE(b.metric, '') AS sla_metric,
    CASE 
      WHEN b.breach_id IS NOT NULL THEN 'red'
      WHEN p.due_date IS NOT NULL AND p.due_date < CAST(SYSUTCDATETIME() AS DATE) THEN 'amber'
      ELSE 'green' 
    END AS badge,
    -- Priority scoring for pursuits
    (
      -- SLA urgency weight
      CASE 
        WHEN b.breach_id IS NOT NULL THEN 100 -- Critical: SLA breached
        WHEN p.due_date IS NOT NULL AND p.due_date < CAST(SYSUTCDATETIME() AS DATE) THEN 75 -- High: Overdue
        WHEN p.due_date IS NOT NULL AND p.due_date <= DATEADD(day, 3, CAST(SYSUTCDATETIME() AS DATE)) THEN 50 -- Medium: Due soon
        ELSE 20 -- Low: Not urgent
      END +
      -- Value band weight (higher value = higher priority)
      CASE 
        WHEN p.forecast_value_usd >= 100000 THEN 40
        WHEN p.forecast_value_usd >= 50000 THEN 25
        WHEN p.forecast_value_usd >= 25000 THEN 15
        ELSE 5
      END +
      -- Stage weight (closer to submission = higher priority)
      CASE 
        WHEN p.pursuit_stage = 'submit' THEN 35
        WHEN p.pursuit_stage = 'red' THEN 25
        WHEN p.pursuit_stage = 'pink' THEN 15
        WHEN p.pursuit_stage = 'qual' THEN 10
        ELSE 0
      END +
      -- Compliance score bonus
      CASE 
        WHEN p.compliance_score >= 8.0 THEN 20
        WHEN p.compliance_score >= 6.0 THEN 10
        WHEN p.compliance_score >= 4.0 THEN 5
        ELSE 0
      END -
      -- Workload penalty for capture lead
      CASE 
        WHEN p.capture_lead_id IS NOT NULL THEN 
          (SELECT COUNT(*) FROM app.pursuit p2 
           WHERE p2.capture_lead_id = p.capture_lead_id 
           AND p2.org_id = p.org_id 
           AND p2.pursuit_stage IN ('qual','pink','red','submit')) * 3
        ELSE 0
      END
    ) AS priority_score,
    p.capture_lead_id as owner_user_id,
    CASE 
      WHEN p.forecast_value_usd >= 100000 THEN 'high'
      WHEN p.forecast_value_usd >= 50000 THEN 'med'
      ELSE 'low'
    END as icp_band,
    DATEDIFF(hour, COALESCE((SELECT MAX(happened_at) FROM app.work_event e WHERE e.item_type='pursuit' AND e.item_id=p.pursuit_id), p.updated_at), SYSUTCDATETIME()) as hours_since_touch
  FROM app.pursuit p
  LEFT JOIN app.candidate c ON p.candidate_id = c.candidate_id AND p.org_id = c.org_id
  LEFT JOIN app.sla_breach b ON b.item_type='pursuit' AND b.item_id=p.pursuit_id AND b.org_id=p.org_id AND b.resolved_at IS NULL
  WHERE p.pursuit_stage IN ('qual','pink','red','submit')
)
SELECT TOP (200)
  item_type,
  item_id,
  org_id,
  label,
  state,
  last_touch_at,
  due_date,
  sla_metric,
  badge,
  priority_score,
  owner_user_id,
  icp_band,
  hours_since_touch,
  -- Priority tier for UI grouping
  CASE 
    WHEN priority_score >= 100 THEN 'critical'
    WHEN priority_score >= 75 THEN 'high'
    WHEN priority_score >= 50 THEN 'medium'
    ELSE 'low'
  END as priority_tier
FROM ranked_items
ORDER BY priority_score DESC, due_date ASC, last_touch_at ASC;

-- View for workload analysis by user
CREATE VIEW app.v_user_workload_analysis AS
SELECT 
  tp.org_id,
  tp.owner_user_id,
  COUNT(*) as total_items,
  COUNT(CASE WHEN tp.priority_tier = 'critical' THEN 1 END) as critical_items,
  COUNT(CASE WHEN tp.priority_tier = 'high' THEN 1 END) as high_priority_items,
  COUNT(CASE WHEN tp.priority_tier = 'medium' THEN 1 END) as medium_priority_items,
  COUNT(CASE WHEN tp.priority_tier = 'low' THEN 1 END) as low_priority_items,
  AVG(tp.priority_score) as avg_priority_score,
  COUNT(CASE WHEN tp.badge = 'red' THEN 1 END) as sla_breaches,
  COUNT(CASE WHEN tp.badge = 'amber' THEN 1 END) as at_risk_items,
  MAX(tp.hours_since_touch) as max_hours_without_touch,
  COUNT(CASE WHEN tp.hours_since_touch > 168 THEN 1 END) as stale_items -- Over 1 week
FROM app.v_today_panel tp
WHERE tp.owner_user_id IS NOT NULL
GROUP BY tp.org_id, tp.owner_user_id;

GO
