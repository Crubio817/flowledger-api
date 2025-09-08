import { Router } from 'express';
import { getPool, sql } from '../db/pool';
import { asyncHandler, badRequest, ok, listOk, notFound } from '../utils/http';
import { ensureCommsThreadTransition } from '../state/guards';

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

export default router;
