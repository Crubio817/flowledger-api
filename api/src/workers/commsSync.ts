import { getPool, sql } from '../db/pool';

export async function syncComms() {
  const pool = await getPool();

  // Process queued Graph notifications
  const notifications = await pool.request().query(`
    SELECT TOP (10) *
    FROM app.graph_notification_queue
    WHERE processed_at IS NULL
    ORDER BY created_at ASC
  `);

  for (const notification of notifications.recordset) {
    try {
      await processGraphNotification(notification);
      // Mark as processed
      await pool.request()
        .input('id', sql.BigInt, notification.notification_id)
        .query('UPDATE app.graph_notification_queue SET processed_at = GETUTCDATE() WHERE notification_id = @id');
    } catch (error) {
      console.error(`Failed to process Graph notification ${notification.notification_id}:`, error);
      // Mark for retry or dead letter
      await pool.request()
        .input('id', sql.BigInt, notification.notification_id)
        .input('error', sql.NVarChar(500), error instanceof Error ? error.message : String(error))
        .query(`
          UPDATE app.graph_notification_queue
          SET retry_count = ISNULL(retry_count, 0) + 1,
              last_error = @error,
              processed_at = CASE WHEN retry_count >= 3 THEN GETUTCDATE() ELSE NULL END
          WHERE notification_id = @id
        `);
    }
  }

  // Process email sync for principals with active Graph subscriptions
  const principals = await pool.request().query(`
    SELECT p.principal_id, p.org_id, p.graph_subscription_id, p.graph_access_token
    FROM app.principal p
    WHERE p.graph_subscription_id IS NOT NULL
      AND p.graph_access_token IS NOT NULL
      AND p.last_sync_at IS NULL OR DATEDIFF(minute, p.last_sync_at, GETUTCDATE()) > 15
  `);

  for (const principal of principals.recordset) {
    try {
      await syncPrincipalEmails(principal);
      // Update last sync time
      await pool.request()
        .input('principal_id', sql.BigInt, principal.principal_id)
        .query('UPDATE app.principal SET last_sync_at = GETUTCDATE() WHERE principal_id = @principal_id');
    } catch (error) {
      console.error(`Failed to sync emails for principal ${principal.principal_id}:`, error);
    }
  }
}

async function processGraphNotification(notification: any) {
  const pool = await getPool();
  const { principal_id, org_id, message_id, change_type, resource_url, notification_json } = notification;

  // Parse the notification to get message details
  const notificationData = JSON.parse(notification_json);

  // For now, we'll create a placeholder comms thread and message
  // In production, this would fetch the actual message from Graph API

  // Check if thread already exists for this message
  const existingThread = await pool.request()
    .input('principal_id', sql.BigInt, principal_id)
    .input('org_id', sql.Int, org_id)
    .input('external_id', sql.VarChar(255), message_id)
    .query('SELECT thread_id FROM app.comms_thread WHERE principal_id = @principal_id AND org_id = @org_id AND external_id = @external_id');

  let threadId: number;

  if (existingThread.recordset.length === 0) {
    // Create new thread
    const threadResult = await pool.request()
      .input('principal_id', sql.BigInt, principal_id)
      .input('org_id', sql.Int, org_id)
      .input('external_id', sql.VarChar(255), message_id)
      .input('thread_type', sql.VarChar(32), 'email')
      .input('subject', sql.NVarChar(500), notificationData.subject || 'New Email Thread')
      .input('status', sql.VarChar(32), 'active')
      .query(`
        INSERT INTO app.comms_thread (principal_id, org_id, external_id, thread_type, subject, status, created_at, updated_at)
        OUTPUT INSERTED.thread_id
        VALUES (@principal_id, @org_id, @external_id, @thread_type, @subject, @status, GETUTCDATE(), GETUTCDATE())
      `);
    threadId = threadResult.recordset[0].thread_id;
  } else {
    threadId = existingThread.recordset[0].thread_id;
  }

  // Create or update message
  const messageResult = await pool.request()
    .input('thread_id', sql.BigInt, threadId)
    .input('org_id', sql.Int, org_id)
    .input('external_id', sql.VarChar(255), message_id)
    .input('message_type', sql.VarChar(32), change_type === 'created' ? 'email_received' : 'email_updated')
    .input('content', sql.NVarChar(sql.MAX), notificationData.body || '')
    .input('metadata_json', sql.NVarChar(sql.MAX), notification_json)
    .query(`
      INSERT INTO app.comms_message (thread_id, org_id, external_id, message_type, content, metadata_json, created_at)
      VALUES (@thread_id, @org_id, @external_id, @message_type, @content, @metadata_json, GETUTCDATE())
    `);

  console.log(`Processed ${change_type} notification for message ${message_id}, thread ${threadId}`);
}

async function syncPrincipalEmails(principal: any) {
  // This would integrate with Microsoft Graph API to fetch recent emails
  // For now, it's a placeholder that would:
  // 1. Use the access token to call Graph API
  // 2. Fetch messages since last_sync_at
  // 3. Create/update threads and messages
  // 4. Handle attachments

  console.log(`Syncing emails for principal ${principal.principal_id}`);
  // TODO: Implement Graph API integration
}

// For testing: run sync every 5 minutes
if (require.main === module) {
  setInterval(syncComms, 300000); // 5 minutes
  console.log('Comms sync worker started');
}