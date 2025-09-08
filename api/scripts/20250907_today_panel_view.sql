-- Today Panel view creation
IF EXISTS (SELECT 1 FROM sys.views WHERE object_id = OBJECT_ID('app.v_today_panel'))
BEGIN
    DROP VIEW app.v_today_panel;
END

CREATE VIEW app.v_today_panel AS
SELECT TOP (200)
  'candidate' AS item_type, c.candidate_id AS item_id, c.org_id,
  c.title AS label,
  c.status AS state,
  c.last_touch_at,
  NULL AS due_date,
  COALESCE(b.metric, '') AS sla_metric,
  CASE WHEN b.breach_id IS NOT NULL THEN 'red'
       WHEN DATEDIFF(hour, c.last_touch_at, SYSUTCDATETIME()) > 72 THEN 'amber'
       ELSE 'green' END AS badge
FROM app.candidate c
LEFT JOIN app.sla_breach b ON b.item_type='candidate' AND b.item_id=c.candidate_id AND b.org_id=c.org_id AND b.resolved_at IS NULL
WHERE c.status IN ('triaged','nurture','on_hold')
UNION ALL
SELECT
  'pursuit', p.pursuit_id, p.org_id,
  CONCAT('Pursuit #', p.pursuit_id) AS label,
  p.pursuit_stage,
  (SELECT MAX(happened_at) FROM app.work_event e WHERE e.item_type='pursuit' AND e.item_id=p.pursuit_id) AS last_touch_at,
  p.due_date,
  COALESCE(b.metric, ''),
  CASE WHEN b.breach_id IS NOT NULL THEN 'red'
       WHEN p.due_date IS NOT NULL AND p.due_date < CAST(SYSUTCDATETIME() AS DATE) THEN 'amber'
       ELSE 'green' END
FROM app.pursuit p
LEFT JOIN app.sla_breach b ON b.item_type='pursuit' AND b.item_id=p.pursuit_id AND b.org_id=p.org_id AND b.resolved_at IS NULL
WHERE p.pursuit_stage IN ('qual','pink','red','submit');
