import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { ensureCommsThreadTransition } from '../state/guards';
import { commsMemory } from '../utils/memory';

const router = Router();

// GET /api/comms/threads - List threads with filters
router.get('/threads', asyncHandler(async (req, res) => {
  const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { mailbox_id, client_id, status, process_state, assigned_principal_id, tag } = req.query;

  if (!orgId) return badRequest(res, 'org_id required');

  let query = `
    SELECT t.thread_id, t.subject, t.status, t.process_state, t.assigned_principal_id, t.client_id, t.last_msg_at,
           p.display_name as assignee_name, c.name as client_name
    FROM app.comms_thread t
    LEFT JOIN app.principal p ON t.assigned_principal_id = p.principal_id
    LEFT JOIN app.clients c ON t.client_id = c.client_id
    WHERE t.org_id = @orgId
  `;
  const pool = await getPool();
  const request = pool.request().input('orgId', sql.Int, orgId);

  if (mailbox_id) {
    query += ' AND t.mailbox_id = @mailbox_id';
    request.input('mailbox_id', sql.Int, mailbox_id);
  }

  if (client_id) {
    query += ' AND t.client_id = @client_id';
    request.input('client_id', sql.Int, client_id);
  }

  if (status) {
    query += ' AND t.status = @status';
    request.input('status', status);
  }

  if (process_state) {
    query += ' AND t.process_state = @process_state';
    request.input('process_state', process_state);
  }

  if (assigned_principal_id) {
    query += ' AND t.assigned_principal_id = @assigned_principal_id';
    request.input('assigned_principal_id', sql.BigInt, assigned_principal_id);
  }

  if (tag) {
    query += ' AND EXISTS (SELECT 1 FROM app.comms_thread_tag tt JOIN app.comms_tag tg ON tt.tag_id = tg.tag_id WHERE tt.thread_id = t.thread_id AND tg.name = @tag)';
    request.input('tag', tag);
  }

  query += ' ORDER BY t.last_msg_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
  request.input('offset', sql.Int, offset).input('limit', sql.Int, limit);

  const result = await request.query(query);
  listOk(res, result.recordset, { page, limit });
}));

// GET /api/comms/threads/:id - Get thread details with paginated messages
router.get('/threads/:id', asyncHandler(async (req, res) => {
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { id } = req.params;
  const { page, limit, offset } = (await import('../utils/http')).getPagination(req);

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();

  // Get thread
  const threadResult = await pool.request()
    .input('id', sql.BigInt, parseInt(id))
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT t.*, p.display_name as assignee_name, c.name as client_name
      FROM app.comms_thread t
      LEFT JOIN app.principal p ON t.assigned_principal_id = p.principal_id
      LEFT JOIN app.clients c ON t.client_id = c.client_id
      WHERE t.thread_id = @id AND t.org_id = @orgId
    `);

  if (threadResult.recordset.length === 0) {
    return notFound(res);
  }

  const thread = threadResult.recordset[0];

  // Get messages
  const messagesResult = await pool.request()
    .input('threadId', sql.BigInt, parseInt(id))
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT m.*, a.name as attachment_name, a.mime_type, a.size_bytes
      FROM app.comms_message m
      LEFT JOIN app.comms_attachment a ON m.message_id = a.message_id
      WHERE m.thread_id = @threadId
      ORDER BY m.sent_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  ok(res, {
    thread,
    messages: messagesResult.recordset
  });
}));

// PATCH /api/comms/threads/:id - Update thread
router.patch('/threads/:id', asyncHandler(async (req, res) => {
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { id } = req.params;
  const { status, process_state, assigned_principal_id, tags } = req.body;

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();

  // Validate status transition if status is being updated
  if (status) {
    await ensureCommsThreadTransition(orgId, parseInt(id), status, pool);
  }

  const request = pool.request().input('id', sql.BigInt, parseInt(id)).input('orgId', sql.Int, orgId);

  const updates: string[] = [];
  if (status) {
    updates.push('status = @status');
    request.input('status', status);
  }
  if (process_state) {
    updates.push('process_state = @process_state');
    request.input('process_state', process_state);
  }
  if (assigned_principal_id) {
    updates.push('assigned_principal_id = @assigned_principal_id');
    request.input('assigned_principal_id', sql.BigInt, assigned_principal_id);
  }

  if (updates.length === 0) return badRequest(res, 'No updates provided');

  updates.push('updated_at = SYSDATETIME()');

  const result = await request.query(`UPDATE app.comms_thread SET ${updates.join(', ')} WHERE thread_id = @id AND org_id = @orgId`);
  if (result.rowsAffected[0] === 0) return notFound(res);

  // Handle tags if provided
  if (tags && Array.isArray(tags)) {
    // Delete existing tags
    await pool.request().input('threadId', sql.BigInt, parseInt(id)).query('DELETE FROM app.comms_thread_tag WHERE thread_id = @threadId');

    // Insert new tags
    for (const tagName of tags) {
      const tagResult = await pool.request().input('tagName', tagName).input('orgId', sql.Int, orgId).query(`
        SELECT tag_id FROM app.comms_tag WHERE name = @tagName AND org_id = @orgId
      `);
      let tagId = tagResult.recordset[0]?.tag_id;
      if (!tagId) {
        const insertTag = await pool.request().input('tagName', tagName).input('orgId', sql.Int, orgId).query(`
          INSERT INTO app.comms_tag (org_id, name) OUTPUT INSERTED.tag_id VALUES (@orgId, @tagName)
        `);
        tagId = insertTag.recordset[0].tag_id;
      }
      await pool.request().input('threadId', sql.BigInt, parseInt(id)).input('tagId', sql.Int, tagId).query(`
        INSERT INTO app.comms_thread_tag (thread_id, tag_id) VALUES (@threadId, @tagId)
      `);
    }
  }

  ok(res, { updated: true });
}));

// POST /api/comms/threads/:id/reply - Reply to thread
router.post('/threads/:id/reply', asyncHandler(async (req, res) => {
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { id } = req.params;
  const { body, attachments } = req.body;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!body) return badRequest(res, 'body required');

  const pool = await getPool();

  // Insert message
  const messageResult = await pool.request()
    .input('threadId', sql.BigInt, parseInt(id))
    .input('orgId', sql.Int, orgId)
    .input('body', body)
    .query(`
      INSERT INTO app.comms_message (org_id, thread_id, direction, provider, provider_msg_id, sent_at, snippet, body_blob_url)
      OUTPUT INSERTED.message_id
      VALUES (@orgId, @threadId, 'out', 'manual', NEWID(), SYSDATETIME(), LEFT(@body, 1000), @body)
    `);

  const messageId = messageResult.recordset[0].message_id;

  // Handle attachments if provided
  if (attachments && Array.isArray(attachments)) {
    for (const att of attachments) {
      await pool.request()
        .input('messageId', sql.BigInt, messageId)
        .input('orgId', sql.Int, orgId)
        .input('name', att.name)
        .input('mimeType', att.mime_type)
        .input('sizeBytes', sql.Int, att.size_bytes)
        .input('blobUrl', att.blob_url)
        .query(`
          INSERT INTO app.comms_attachment (org_id, message_id, name, mime_type, size_bytes, blob_url)
          VALUES (@orgId, @messageId, @name, @mimeType, @sizeBytes, @blobUrl)
        `);
    }
  }

  // Update thread last_msg_at
  await pool.request().input('threadId', sql.BigInt, parseInt(id)).query(`
    UPDATE app.comms_thread SET last_msg_at = SYSDATETIME(), updated_at = SYSDATETIME() WHERE thread_id = @threadId
  `);

  // Capture memory atom for new communication
  await commsMemory.messageSent(orgId, parseInt(id), 'reply', body);

  ok(res, { message_id: messageId }, 201);
}));

// POST /api/comms/threads/:id/link - Link thread to work item
router.post('/threads/:id/link', asyncHandler(async (req, res) => {
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { id } = req.params;
  const { item_type, item_id } = req.body;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!item_type || !item_id) return badRequest(res, 'item_type and item_id required');

  const pool = await getPool();

  // Insert into work_item_link
  await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('itemType', 'comms_thread')
    .input('itemId', sql.BigInt, parseInt(id))
    .input('targetType', item_type)
    .input('targetId', sql.BigInt, item_id)
    .query(`
      INSERT INTO app.work_item_link (org_id, item_type, item_id, link_type, target_type, target_id)
      VALUES (@orgId, @itemType, @itemId, 'link', @targetType, @targetId)
    `);

  ok(res, { linked: true });
}));

// POST /api/comms/attachments/:id/save-as-doc - Save attachment as doc
router.post('/attachments/:id/save-as-doc', asyncHandler(async (req, res) => {
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { id } = req.params;

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();

  // Get attachment
  const attResult = await pool.request()
    .input('id', sql.BigInt, parseInt(id))
    .input('orgId', sql.Int, orgId)
    .query(`
      SELECT a.*, m.thread_id
      FROM app.comms_attachment a
      JOIN app.comms_message m ON a.message_id = m.message_id
      WHERE a.attachment_id = @id AND a.org_id = @orgId
    `);

  if (attResult.recordset.length === 0) return notFound(res);

  const attachment = attResult.recordset[0];

  // Insert into client_documents (assuming doc_id is auto-generated)
  const docResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('clientId', sql.Int, attachment.client_id || null) // From thread
    .input('name', attachment.name)
    .input('mimeType', attachment.mime_type)
    .input('sizeBytes', sql.Int, attachment.size_bytes)
    .input('blobUrl', attachment.blob_url)
    .query(`
      INSERT INTO app.client_documents (org_id, client_id, name, mime_type, size_bytes, blob_url, created_at)
      OUTPUT INSERTED.doc_id
      VALUES (@orgId, @clientId, @name, @mimeType, @sizeBytes, @blobUrl, SYSDATETIME())
    `);

  const docId = docResult.recordset[0].doc_id;

  // Link in comms_attachment_doc
  await pool.request()
    .input('attachmentId', sql.BigInt, parseInt(id))
    .input('orgId', sql.Int, orgId)
    .input('docId', sql.Int, docId)
    .query(`
      INSERT INTO app.comms_attachment_doc (org_id, attachment_id, doc_ref)
      VALUES (@orgId, @attachmentId, CAST(@docId AS VARCHAR(256)))
    `);

  ok(res, { doc_id: docId });
}));

// ============================================================================
// NEW ENHANCEMENT ENDPOINTS
// ============================================================================

// WebSocket Connection Management
// POST /api/comms/ws/connect - Register WebSocket connection
router.post('/ws/connect', asyncHandler(async (req, res) => {
  const { socket_id, principal_id, user_agent, ip_address } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId || !socket_id || !principal_id) {
    return badRequest(res, 'org_id, socket_id, and principal_id required');
  }

  const pool = await getPool();

  // Insert or update connection
  await pool.request()
    .input('socketId', socket_id)
    .input('orgId', sql.Int, orgId)
    .input('principalId', sql.BigInt, principal_id)
    .input('userAgent', user_agent)
    .input('ipAddress', ip_address)
    .query(`
      MERGE app.comms_websocket_connection AS target
      USING (SELECT @socketId as socket_id) AS source
      ON target.socket_id = source.socket_id
      WHEN MATCHED THEN
        UPDATE SET last_ping_at = SYSDATETIME(), is_active = 1
      WHEN NOT MATCHED THEN
        INSERT (org_id, principal_id, socket_id, user_agent, ip_address)
        VALUES (@orgId, @principalId, @socketId, @userAgent, @ipAddress);
    `);

  ok(res, { connected: true });
}));

// POST /api/comms/ws/disconnect - Unregister WebSocket connection
router.post('/ws/disconnect', asyncHandler(async (req, res) => {
  const { socket_id } = req.body;

  if (!socket_id) return badRequest(res, 'socket_id required');

  const pool = await getPool();

  await pool.request()
    .input('socketId', socket_id)
    .query(`
      UPDATE app.comms_websocket_connection
      SET is_active = 0, last_ping_at = SYSDATETIME()
      WHERE socket_id = @socketId
    `);

  ok(res, { disconnected: true });
}));

// POST /api/comms/ws/subscribe - Subscribe to real-time updates
router.post('/ws/subscribe', asyncHandler(async (req, res) => {
  const { socket_id, subscription_type, resource_id } = req.body;
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;

  if (!orgId || !socket_id || !subscription_type) {
    return badRequest(res, 'org_id, socket_id, and subscription_type required');
  }

  const pool = await getPool();

  // Get connection_id
  const connResult = await pool.request()
    .input('socketId', socket_id)
    .query('SELECT connection_id FROM app.comms_websocket_connection WHERE socket_id = @socketId AND is_active = 1');

  if (connResult.recordset.length === 0) {
    return badRequest(res, 'Invalid or inactive socket connection');
  }

  const connectionId = connResult.recordset[0].connection_id;

  // Insert subscription
  await pool.request()
    .input('connectionId', sql.BigInt, connectionId)
    .input('subscriptionType', subscription_type)
    .input('resourceId', resource_id ? sql.BigInt : sql.BigInt, resource_id || null)
    .query(`
      INSERT INTO app.comms_websocket_subscription (connection_id, subscription_type, resource_id)
      VALUES (@connectionId, @subscriptionType, @resourceId)
    `);

  ok(res, { subscribed: true });
}));

// POST /api/comms/ws/unsubscribe - Unsubscribe from real-time updates
router.post('/ws/unsubscribe', asyncHandler(async (req, res) => {
  const { socket_id, subscription_type, resource_id } = req.body;

  if (!socket_id || !subscription_type) {
    return badRequest(res, 'socket_id and subscription_type required');
  }

  const pool = await getPool();

  // Get connection_id
  const connResult = await pool.request()
    .input('socketId', socket_id)
    .query('SELECT connection_id FROM app.comms_websocket_connection WHERE socket_id = @socketId');

  if (connResult.recordset.length === 0) return badRequest(res, 'Invalid socket connection');

  const connectionId = connResult.recordset[0].connection_id;

  // Delete subscription
  const request = pool.request()
    .input('connectionId', sql.BigInt, connectionId)
    .input('subscriptionType', subscription_type);

  let query = 'DELETE FROM app.comms_websocket_subscription WHERE connection_id = @connectionId AND subscription_type = @subscriptionType';

  if (resource_id) {
    query += ' AND resource_id = @resourceId';
    request.input('resourceId', sql.BigInt, resource_id);
  }

  await request.query(query);

  ok(res, { unsubscribed: true });
}));

// Email Templates
// GET /api/comms/templates - List email templates
router.get('/templates', asyncHandler(async (req, res) => {
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { type, is_active } = req.query;

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  const request = pool.request().input('orgId', sql.Int, orgId);

  let query = 'SELECT * FROM app.comms_email_template WHERE org_id = @orgId';

  if (type) {
    query += ' AND template_type = @type';
    request.input('type', type);
  }

  if (is_active !== undefined) {
    query += ' AND is_active = @isActive';
    request.input('isActive', sql.Bit, is_active === 'true' ? 1 : 0);
  }

  query += ' ORDER BY name';

  const result = await request.query(query);
  const { page, limit } = (await import('../utils/http')).getPagination(req);
  listOk(res, result.recordset, { page, limit });
}));

// POST /api/comms/templates - Create email template
router.post('/templates', asyncHandler(async (req, res) => {
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { name, subject_template, body_template, template_type, variables } = req.body;
  const principalId = req.query.principal_id ? Number(req.query.principal_id) : null;

  if (!orgId || !name || !subject_template || !body_template) {
    return badRequest(res, 'org_id, name, subject_template, and body_template required');
  }

  const pool = await getPool();

  // Insert template
  const templateResult = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('name', name)
    .input('subjectTemplate', subject_template)
    .input('bodyTemplate', body_template)
    .input('templateType', template_type || 'general')
    .input('createdBy', sql.BigInt, principalId)
    .query(`
      INSERT INTO app.comms_email_template (org_id, name, subject_template, body_template, template_type, created_by)
      OUTPUT INSERTED.template_id
      VALUES (@orgId, @name, @subjectTemplate, @bodyTemplate, @templateType, @createdBy)
    `);

  const templateId = templateResult.recordset[0].template_id;

  // Insert variables if provided
  if (variables && Array.isArray(variables)) {
    for (const variable of variables) {
      await pool.request()
        .input('templateId', sql.BigInt, templateId)
        .input('varName', variable.name)
        .input('varType', variable.type || 'text')
        .input('defaultValue', variable.default_value)
        .input('description', variable.description)
        .input('isRequired', sql.Bit, variable.is_required ? 1 : 0)
        .query(`
          INSERT INTO app.comms_template_variable (template_id, variable_name, variable_type, default_value, description, is_required)
          VALUES (@templateId, @varName, @varType, @defaultValue, @description, @isRequired)
        `);
    }
  }

  ok(res, { template_id: templateId }, 201);
}));

// GET /api/comms/templates/:id - Get template with variables
router.get('/templates/:id', asyncHandler(async (req, res) => {
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { id } = req.params;

  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();

  // Get template
  const templateResult = await pool.request()
    .input('id', sql.BigInt, parseInt(id))
    .input('orgId', sql.Int, orgId)
    .query('SELECT * FROM app.comms_email_template WHERE template_id = @id AND org_id = @orgId');

  if (templateResult.recordset.length === 0) return notFound(res);

  // Get variables
  const variablesResult = await pool.request()
    .input('templateId', sql.BigInt, parseInt(id))
    .query('SELECT * FROM app.comms_template_variable WHERE template_id = @templateId ORDER BY variable_name');

  ok(res, {
    ...templateResult.recordset[0],
    variables: variablesResult.recordset
  });
}));

// Advanced Search
// GET /api/comms/search - Advanced search across threads and messages
router.get('/search', asyncHandler(async (req, res) => {
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { q, type, mailbox_id, status, from_date, to_date } = req.query;
  const { page, limit, offset } = (await import('../utils/http')).getPagination(req);
  const principalId = req.query.principal_id ? Number(req.query.principal_id) : null;

  if (!orgId) return badRequest(res, 'org_id required');
  if (!q || typeof q !== 'string' || q.length < 3) return badRequest(res, 'Search query must be at least 3 characters');

  const pool = await getPool();
  const request = pool.request()
    .input('orgId', sql.Int, orgId)
    .input('query', q)
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit);

  let whereClause = 't.org_id = @orgId';
  let joinClause = '';

  // Add filters
  if (mailbox_id) {
    whereClause += ' AND t.mailbox_id = @mailboxId';
    request.input('mailboxId', sql.Int, mailbox_id);
  }

  if (status) {
    whereClause += ' AND t.status = @status';
    request.input('status', status);
  }

  if (from_date) {
    whereClause += ' AND t.last_msg_at >= @fromDate';
    request.input('fromDate', from_date);
  }

  if (to_date) {
    whereClause += ' AND t.last_msg_at <= @toDate';
    request.input('toDate', to_date);
  }

  let query = '';

  if (type === 'messages' || !type) {
    // Search in messages
    query = `
      SELECT
        'message' as result_type,
        m.message_id as id,
        t.thread_id,
        t.subject as thread_subject,
        LEFT(m.snippet, 200) as snippet,
        m.sent_at as date,
        m.from_addr as sender,
        ROW_NUMBER() OVER (ORDER BY m.sent_at DESC) as row_num
      FROM app.comms_message m
      JOIN app.comms_thread t ON m.thread_id = t.thread_id
      WHERE ${whereClause}
      AND CONTAINS((m.snippet, m.from_addr), @query)
    `;
  }

  if (type === 'threads' || !type) {
    // Search in threads
    if (query.includes('UNION')) query += ' UNION ';
    query += `
      SELECT
        'thread' as result_type,
        t.thread_id as id,
        t.thread_id,
        t.subject as thread_subject,
        LEFT(t.subject, 200) as snippet,
        t.last_msg_at as date,
        p.display_name as sender,
        ROW_NUMBER() OVER (ORDER BY t.last_msg_at DESC) as row_num
      FROM app.comms_thread t
      LEFT JOIN app.principal p ON t.assigned_principal_id = p.principal_id
      WHERE ${whereClause}
      AND CONTAINS(t.subject, @query)
    `;
  }

  query += `
    ORDER BY date DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `;

  const result = await request.query(query);

  // Log search for analytics
  if (principalId) {
    await pool.request()
      .input('orgId', sql.Int, orgId)
      .input('principalId', sql.BigInt, principalId)
      .input('query', q)
      .input('searchType', type || 'general')
      .input('resultCount', sql.Int, result.recordset.length)
      .query(`
        INSERT INTO app.comms_search_history (org_id, principal_id, search_query, search_type, result_count)
        VALUES (@orgId, @principalId, @query, @searchType, @resultCount)
      `);
  }

  listOk(res, result.recordset, { page, limit });
}));

// File Upload Management
// POST /api/comms/upload/init - Initialize resumable upload
router.post('/upload/init', asyncHandler(async (req, res) => {
  const orgId = req.query.org_id ? Number(req.query.org_id) : null;
  const { filename, mime_type, total_size_bytes, thread_id } = req.body;
  const principalId = req.query.principal_id ? Number(req.query.principal_id) : null;

  if (!orgId || !filename || !total_size_bytes) {
    return badRequest(res, 'org_id, filename, and total_size_bytes required');
  }

  const sessionId = require('crypto').randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const pool = await getPool();

  await pool.request()
    .input('sessionId', sessionId)
    .input('orgId', sql.Int, orgId)
    .input('principalId', sql.BigInt, principalId)
    .input('threadId', thread_id ? sql.BigInt : sql.BigInt, thread_id || null)
    .input('filename', filename)
    .input('mimeType', mime_type)
    .input('totalSize', sql.BigInt, total_size_bytes)
    .input('expiresAt', expiresAt)
    .query(`
      INSERT INTO app.comms_upload_session (session_id, org_id, principal_id, thread_id, filename, mime_type, total_size_bytes, expires_at)
      VALUES (@sessionId, @orgId, @principalId, @threadId, @filename, @mimeType, @totalSize, @expiresAt)
    `);

  ok(res, {
    session_id: sessionId,
    expires_at: expiresAt.toISOString(),
    chunk_size: 1024 * 1024 // 1MB chunks
  }, 201);
}));

// POST /api/comms/upload/:session_id/chunk - Upload file chunk
router.post('/upload/:session_id/chunk', asyncHandler(async (req, res) => {
  const { session_id } = req.params;
  const { chunk_index, chunk_data } = req.body; // chunk_data should be base64 encoded

  if (!chunk_data) return badRequest(res, 'chunk_data required');

  const pool = await getPool();

  // Get session
  const sessionResult = await pool.request()
    .input('sessionId', session_id)
    .query(`
      SELECT * FROM app.comms_upload_session
      WHERE session_id = @sessionId AND status = 'uploading' AND expires_at > SYSDATETIME()
    `);

  if (sessionResult.recordset.length === 0) {
    return badRequest(res, 'Invalid or expired upload session');
  }

  const session = sessionResult.recordset[0];
  const chunkSize = Buffer.from(chunk_data, 'base64').length;
  const newUploadedBytes = session.uploaded_bytes + chunkSize;

  // Update progress
  await pool.request()
    .input('sessionId', session_id)
    .input('uploadedBytes', sql.BigInt, newUploadedBytes)
    .query(`
      UPDATE app.comms_upload_session
      SET uploaded_bytes = @uploadedBytes, updated_at = SYSDATETIME()
      WHERE session_id = @sessionId
    `);

  // Check if upload is complete
  if (newUploadedBytes >= session.total_size_bytes) {
    await pool.request()
      .input('sessionId', session_id)
      .query(`
        UPDATE app.comms_upload_session
        SET status = 'completed', updated_at = SYSDATETIME()
        WHERE session_id = @sessionId
      `);

    // Here you would typically save the complete file to blob storage
    // For now, we'll just mark it as completed
  }

  ok(res, {
    uploaded_bytes: newUploadedBytes,
    total_bytes: session.total_size_bytes,
    complete: newUploadedBytes >= session.total_size_bytes
  });
}));

// GET /api/comms/upload/:session_id/status - Get upload status
router.get('/upload/:session_id/status', asyncHandler(async (req, res) => {
  const { session_id } = req.params;

  const pool = await getPool();

  const result = await pool.request()
    .input('sessionId', session_id)
    .query('SELECT * FROM app.comms_upload_session WHERE session_id = @sessionId');

  if (result.recordset.length === 0) return notFound(res);

  const session = result.recordset[0];

  ok(res, {
    session_id: session.session_id,
    filename: session.filename,
    uploaded_bytes: session.uploaded_bytes,
    total_bytes: session.total_size_bytes,
    status: session.status,
    expires_at: session.expires_at
  });
}));

export default router;
