import { getPool, sql } from '../db/pool';

export async function checkCommsSLAs() {
  const pool = await getPool();

  // 1. Response SLA: Active comms threads without response within threshold
  const responseBreaches = await pool.request().query(`
    SELECT t.thread_id, t.org_id, t.created_at, t.last_message_at, r.threshold_hrs, r.rule_id
    FROM app.comms_thread t
    JOIN app.sla_rule r ON r.org_id = t.org_id AND r.metric = 'comms_response_sla' AND r.is_active = 1
    WHERE t.status = 'active'
      AND t.thread_type IN ('email', 'chat')
      AND DATEDIFF(hour, ISNULL(t.last_message_at, t.created_at), SYSUTCDATETIME()) > r.threshold_hrs
  `);

  // 2. Escalation SLA: High priority threads without escalation
  const escalationBreaches = await pool.request().query(`
    SELECT t.thread_id, t.org_id, t.created_at, t.priority, r.threshold_hrs, r.rule_id
    FROM app.comms_thread t
    JOIN app.sla_rule r ON r.org_id = t.org_id AND r.metric = 'comms_escalation_sla' AND r.is_active = 1
    WHERE t.status = 'active'
      AND t.priority IN ('high', 'urgent')
      AND NOT EXISTS (
        SELECT 1 FROM app.comms_message m
        WHERE m.thread_id = t.thread_id AND m.org_id = t.org_id
          AND m.message_type = 'escalation'
      )
      AND DATEDIFF(hour, t.created_at, SYSUTCDATETIME()) > r.threshold_hrs
  `);

  // 3. Resolution SLA: Threads that should be closed but remain active
  const resolutionBreaches = await pool.request().query(`
    SELECT t.thread_id, t.org_id, t.last_message_at, r.threshold_hrs, r.rule_id
    FROM app.comms_thread t
    JOIN app.sla_rule r ON r.org_id = t.org_id AND r.metric = 'comms_resolution_sla' AND r.is_active = 1
    WHERE t.status = 'active'
      AND DATEDIFF(hour, t.last_message_at, SYSUTCDATETIME()) > r.threshold_hrs
  `);

  // Insert breaches (one per thread/rule max)
  const allBreaches = [
    ...responseBreaches.recordset.map(b => ({ ...b, item_type: 'comms_thread', item_id: b.thread_id, reason_code: 'response_overdue' })),
    ...escalationBreaches.recordset.map(b => ({ ...b, item_type: 'comms_thread', item_id: b.thread_id, reason_code: 'escalation_overdue' })),
    ...resolutionBreaches.recordset.map(b => ({ ...b, item_type: 'comms_thread', item_id: b.thread_id, reason_code: 'resolution_overdue' }))
  ];

  for (const b of allBreaches) {
    // Check if breach already exists for this thread/rule
    const existing = await pool.request()
      .input('orgId', sql.Int, b.org_id)
      .input('item_type', sql.VarChar(32), b.item_type)
      .input('item_id', sql.BigInt, b.item_id)
      .input('rule_id', sql.Int, b.rule_id)
      .query(`
        SELECT breach_id FROM app.sla_breach
        WHERE org_id = @orgId AND item_type = @item_type AND item_id = @item_id AND rule_id = @rule_id AND resolved_at IS NULL
      `);

    if (existing.recordset.length === 0) {
      await pool.request()
        .input('orgId', sql.Int, b.org_id)
        .input('item_type', sql.VarChar(32), b.item_type)
        .input('item_id', sql.BigInt, b.item_id)
        .input('rule_id', sql.Int, b.rule_id)
        .input('reason_code', sql.VarChar(32), b.reason_code)
        .query(`
          INSERT INTO app.sla_breach (org_id, item_type, item_id, rule_id, reason_code)
          VALUES (@orgId, @item_type, @item_id, @rule_id, @reason_code)
        `);

      console.log(`Created SLA breach for ${b.item_type} ${b.item_id}: ${b.reason_code}`);
    }
  }

  // Auto-resolve breaches where conditions are met
  const resolvedBreaches = await pool.request().query(`
    SELECT b.breach_id, b.org_id, b.item_type, b.item_id, b.reason_code
    FROM app.sla_breach b
    WHERE b.item_type = 'comms_thread' AND b.resolved_at IS NULL
  `);

  for (const breach of resolvedBreaches.recordset) {
    let shouldResolve = false;

    if (breach.reason_code === 'response_overdue') {
      // Check if thread now has a response
      const hasResponse = await pool.request()
        .input('thread_id', sql.BigInt, breach.item_id)
        .input('org_id', sql.Int, breach.org_id)
        .query(`
          SELECT COUNT(*) as response_count
          FROM app.comms_message
          WHERE thread_id = @thread_id AND org_id = @org_id
            AND message_type IN ('email_sent', 'chat_response', 'note')
            AND created_at > (
              SELECT created_at FROM app.comms_thread
              WHERE thread_id = @thread_id AND org_id = @org_id
            )
        `);
      shouldResolve = hasResponse.recordset[0].response_count > 0;
    } else if (breach.reason_code === 'escalation_overdue') {
      // Check if thread has been escalated
      const hasEscalation = await pool.request()
        .input('thread_id', sql.BigInt, breach.item_id)
        .input('org_id', sql.Int, breach.org_id)
        .query(`
          SELECT COUNT(*) as escalation_count
          FROM app.comms_message
          WHERE thread_id = @thread_id AND org_id = @org_id
            AND message_type = 'escalation'
        `);
      shouldResolve = hasEscalation.recordset[0].escalation_count > 0;
    } else if (breach.reason_code === 'resolution_overdue') {
      // Check if thread is now resolved
      const threadStatus = await pool.request()
        .input('thread_id', sql.BigInt, breach.item_id)
        .input('org_id', sql.Int, breach.org_id)
        .query('SELECT status FROM app.comms_thread WHERE thread_id = @thread_id AND org_id = @org_id');
      shouldResolve = threadStatus.recordset[0]?.status === 'resolved';
    }

    if (shouldResolve) {
      await pool.request()
        .input('breach_id', sql.BigInt, breach.breach_id)
        .query('UPDATE app.sla_breach SET resolved_at = GETUTCDATE() WHERE breach_id = @breach_id');
      console.log(`Resolved SLA breach ${breach.breach_id} for ${breach.item_type} ${breach.item_id}`);
    }
  }
}

// For testing: run check every 15 minutes
if (require.main === module) {
  setInterval(checkCommsSLAs, 900000); // 15 minutes
  console.log('Comms SLA checker started');
}