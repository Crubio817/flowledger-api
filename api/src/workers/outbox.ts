import { getPool, sql } from '../db/pool';
import { processMemoryEvents } from './memory-processor';

export async function tick() {
  const pool = await getPool();
  const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Atomic claiming: claim up to 10 unprocessed events with optimistic locking
  const claimResult = await pool.request()
    .input('workerId', sql.VarChar(64), workerId)
    .input('now', sql.DateTimeOffset, new Date())
    .query(`
      UPDATE TOP (10) app.work_event
      SET claimed_at = @now, claimed_by = @workerId
      OUTPUT INSERTED.*
      WHERE processed_at IS NULL AND claimed_at IS NULL
        AND (dead_letter_at IS NULL OR dead_letter_at > @now)
      ORDER BY created_at ASC
    `);

  const events = claimResult.recordset;

  for (const event of events) {
    try {
      await processEvent(event);

      // Mark as processed
      await pool.request()
        .input('id', sql.BigInt, event.work_event_id)
        .input('workerId', sql.VarChar(64), workerId)
        .query(`
          UPDATE app.work_event
          SET processed_at = SYSUTCDATETIME(), claimed_at = NULL, claimed_by = NULL
          WHERE work_event_id = @id AND claimed_by = @workerId
        `);

      console.log(`Processed event ${event.work_event_id}: ${event.event_name}`);
    } catch (err) {
      console.error(`Failed to process event ${event.work_event_id}`, err);

      // Increment retry count and handle dead lettering
      const retryCount = (event.retry_count || 0) + 1;
      const maxAttempts = event.max_attempts || 3;

      if (retryCount >= maxAttempts) {
        // Move to dead letter queue
        await pool.request()
          .input('id', sql.BigInt, event.work_event_id)
          .input('workerId', sql.VarChar(64), workerId)
          .input('retryCount', sql.Int, retryCount)
          .input('error', sql.NVarChar(sql.MAX), err instanceof Error ? err.message : String(err))
          .query(`
            UPDATE app.work_event
            SET retry_count = @retryCount,
                dead_letter_at = SYSUTCDATETIME(),
                payload_json = JSON_MODIFY(ISNULL(payload_json, '{}'), '$.last_error', @error),
                claimed_at = NULL,
                claimed_by = NULL
            WHERE work_event_id = @id AND claimed_by = @workerId
          `);
        console.error(`Event ${event.work_event_id} moved to dead letter queue after ${retryCount} attempts`);
      } else {
        // Release claim for retry (exponential backoff)
        const backoffMinutes = Math.min(2 ** retryCount, 60); // Max 1 hour
        const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

        await pool.request()
          .input('id', sql.BigInt, event.work_event_id)
          .input('workerId', sql.VarChar(64), workerId)
          .input('retryCount', sql.Int, retryCount)
          .input('nextAttemptAt', sql.DateTimeOffset, nextAttemptAt)
          .query(`
            UPDATE app.work_event
            SET retry_count = @retryCount,
                claimed_at = NULL,
                claimed_by = NULL,
                payload_json = JSON_MODIFY(ISNULL(payload_json, '{}'), '$.next_attempt_at', @nextAttemptAt)
            WHERE work_event_id = @id AND claimed_by = @workerId
          `);
        console.log(`Event ${event.work_event_id} released for retry ${retryCount}/${maxAttempts} in ${backoffMinutes} minutes`);
      }
    }
  }

  // Clean up stale claims (older than 5 minutes)
  await pool.request()
    .input('staleThreshold', sql.DateTimeOffset, new Date(Date.now() - 5 * 60 * 1000))
    .query(`
      UPDATE app.work_event
      SET claimed_at = NULL, claimed_by = NULL
      WHERE claimed_at < @staleThreshold AND processed_at IS NULL
    `);
}

async function processEvent(event: any) {
  const { event_name, payload_json, item_type, item_id, org_id } = event;
  const payload = payload_json ? JSON.parse(payload_json) : {};

  switch (event_name) {
    case 'candidate.promoted':
      // Idempotent: create proposal v1 if doesn't exist
      await createProposalV1IfNeeded(org_id, payload.pursuit_id);
      console.log(`Candidate promoted, ensured proposal v1 for pursuit ${payload.pursuit_id}`);
      break;
    case 'pursuit.submit':
      // Send proposal email (idempotent)
      await sendProposalEmail(org_id, item_id, payload.proposal_id);
      console.log(`Proposal submitted for pursuit ${item_id}`);
      break;
    case 'proposal.sent':
      // Notify team (idempotent)
      await notifyProposalSent(org_id, item_id, payload.proposal_id);
      console.log(`Proposal ${payload.proposal_id} sent for pursuit ${item_id}`);
      break;
    case 'pursuit.won':
      // Notify team (idempotent)
      await notifyPursuitWon(org_id, item_id, payload.proposal_id);
      console.log(`Pursuit ${item_id} won`);
      break;
    case 'pursuit.lost':
      // Notify team (idempotent)
      await notifyPursuitLost(org_id, item_id, payload.reason);
      console.log(`Pursuit ${item_id} lost: ${payload.reason}`);
      break;
    case 'memory.atom.created':
    case 'memory.summary.rebuild':
    case 'memory.atom.redact':
      // Process memory events
      await processMemoryEvents();
      console.log(`Memory event: ${event_name}`);
      break;
    default:
      console.log(`Unhandled event: ${event_name}`);
  }
}

// Idempotent effect functions with natural keys
async function createProposalV1IfNeeded(orgId: number, pursuitId: number) {
  const pool = await getPool();
  // Check if v1 already exists
  const existing = await pool.request()
    .input('pursuitId', sql.BigInt, pursuitId)
    .input('orgId', sql.Int, orgId)
    .query(`SELECT proposal_id FROM app.proposal WHERE pursuit_id = @pursuitId AND org_id = @orgId AND version = 1`);

  if (existing.recordset.length === 0) {
    await pool.request()
      .input('pursuitId', sql.BigInt, pursuitId)
      .input('orgId', sql.Int, orgId)
      .query(`INSERT INTO app.proposal (org_id, pursuit_id, version, status) VALUES (@orgId, @pursuitId, 1, 'draft')`);
  }
}

async function sendProposalEmail(orgId: number, pursuitId: number, proposalId: number) {
  // TODO: Integrate with email service
  // Use proposalId as natural key for idempotency
  console.log(`Would send email for proposal ${proposalId}`);
}

async function notifyProposalSent(orgId: number, pursuitId: number, proposalId: number) {
  // TODO: Team notification
  console.log(`Would notify team about proposal ${proposalId}`);
}

async function notifyPursuitWon(orgId: number, pursuitId: number, proposalId: number) {
  // TODO: Team celebration
  console.log(`Would celebrate win for pursuit ${pursuitId}`);
}

async function notifyPursuitLost(orgId: number, pursuitId: number, reason?: string) {
  // TODO: Team notification with reason
  console.log(`Would notify loss for pursuit ${pursuitId}: ${reason}`);
}

// For testing: run tick every 30 seconds
if (require.main === module) {
  setInterval(tick, 30000);
  console.log('Outbox worker started');
}
