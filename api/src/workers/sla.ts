import { getPool, sql } from '../db/pool';

export async function checkSLAs() {
  const pool = await getPool();

  // 1. Submit SLA: Pursuit in 'submit' stage older than SLA threshold
  const submitBreaches = await pool.request().query(`
    SELECT p.pursuit_id, p.org_id, pr.sent_at, r.threshold_hrs, r.rule_id
    FROM app.pursuit p
    JOIN app.proposal pr ON p.pursuit_id = pr.pursuit_id AND p.org_id = pr.org_id
    JOIN app.sla_rule r ON r.org_id = p.org_id AND r.metric = 'submit_sla' AND r.is_active = 1
    WHERE p.pursuit_stage = 'submit' AND pr.status = 'sent'
    AND DATEDIFF(hour, pr.sent_at, SYSUTCDATETIME()) > r.threshold_hrs
  `);

  // 2. Triage SLA: Signal without first touch (candidate created or owner assigned)
  const triageBreaches = await pool.request().query(`
    SELECT s.signal_id, s.org_id, s.created_at, r.threshold_hrs, r.rule_id
    FROM app.signal s
    JOIN app.sla_rule r ON r.org_id = s.org_id AND r.metric = 'triage_sla' AND r.is_active = 1
    WHERE NOT EXISTS (
      SELECT 1 FROM app.candidate c WHERE c.signal_id = s.signal_id AND c.org_id = s.org_id
    )
    AND DATEDIFF(hour, s.created_at, SYSUTCDATETIME()) > r.threshold_hrs
  `);

  // 3. Proposal SLA: Promoted candidate without submit within threshold
  const proposalBreaches = await pool.request().query(`
    SELECT c.candidate_id, c.org_id, c.updated_at as promoted_at, r.threshold_hrs, r.rule_id
    FROM app.candidate c
    JOIN app.sla_rule r ON r.org_id = c.org_id AND r.metric = 'proposal_sla' AND r.is_active = 1
    WHERE c.status = 'promoted'
    AND NOT EXISTS (
      SELECT 1 FROM app.pursuit p WHERE p.candidate_id = c.candidate_id AND p.org_id = c.org_id AND p.pursuit_stage IN ('submit','won','lost')
    )
    AND DATEDIFF(hour, c.updated_at, SYSUTCDATETIME()) > r.threshold_hrs
  `);

  // Insert breaches (one per item/rule max)
  const allBreaches = [
    ...submitBreaches.recordset.map(b => ({ ...b, item_type: 'pursuit', item_id: b.pursuit_id })),
    ...triageBreaches.recordset.map(b => ({ ...b, item_type: 'signal', item_id: b.signal_id })),
    ...proposalBreaches.recordset.map(b => ({ ...b, item_type: 'candidate', item_id: b.candidate_id }))
  ];

  for (const b of allBreaches) {
    // Check if breach already exists for this item/rule
    const existing = await pool.request()
      .input('orgId', sql.Int, b.org_id)
      .input('item_type', sql.VarChar(12), b.item_type)
      .input('item_id', sql.BigInt, b.item_id)
      .input('rule_id', sql.Int, b.rule_id)
      .query(`
        SELECT breach_id FROM app.sla_breach
        WHERE org_id = @orgId AND item_type = @item_type AND item_id = @item_id AND rule_id = @rule_id AND resolved_at IS NULL
      `);

    if (existing.recordset.length === 0) {
      await pool.request()
        .input('orgId', sql.Int, b.org_id)
        .input('item_type', sql.VarChar(12), b.item_type)
        .input('item_id', sql.BigInt, b.item_id)
        .input('rule_id', sql.Int, b.rule_id)
        .input('reason_code', sql.VarChar(32), b.item_type === 'pursuit' ? 'response_overdue' : b.item_type === 'signal' ? 'untouched' : 'unsubmitted')
        .query(`
          INSERT INTO app.sla_breach (org_id, item_type, item_id, rule_id, reason_code)
          VALUES (@orgId, @item_type, @item_id, @rule_id, @reason_code)
        `);
    }
  }
}

// For testing: run check every hour
if (require.main === module) {
  setInterval(checkSLAs, 3600000); // 1 hour
  console.log('SLA checker started');
}
