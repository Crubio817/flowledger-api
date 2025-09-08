import express from 'express';
import { getPool } from '../db/pool';

const router = express.Router();

/**
 * @openapi
 * /webhooks/fullenrich:
 *   post:
 *     summary: FullEnrich webhook callback
 *     description: Accepts enrichment results from FullEnrich and updates job + contact records.
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid payload
 */
// Webhook for FullEnrich - handles enrichment results
router.post('/fullenrich', async (req, res) => {
  try {
    console.log('FullEnrich webhook received:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;
    
    // Extract job_id from custom field in the webhook payload
    // FullEnrich returns the custom object in each data item
    let jobId;
    if (data.datas && data.datas.length > 0 && data.datas[0].custom && data.datas[0].custom.job_id) {
      jobId = data.datas[0].custom.job_id;
    } else {
      console.error('No job_id found in FullEnrich webhook payload');
      return res.status(400).send('Missing job_id in custom field');
    }

    const pool = await getPool();
    
    // Update enrichment job status
    await pool.request()
      .input('job_id', jobId)
      .input('result_json', JSON.stringify(data))
      .input('status', 'complete')
      .query('UPDATE app.enrichment_jobs SET result_json = @result_json, status = @status, updated_at = GETUTCDATE() WHERE job_id = @job_id');

    // Process each contact in the response
    for (const dataItem of data.datas || []) {
      const contact = dataItem.contact;
      if (contact && (contact.firstname || contact.lastname)) {
        const contactId = dataItem.custom?.contact_id || jobId;
        
        // Check if contact already exists
        const existing = await pool.request()
          .input('contact_id', contactId)
          .query('SELECT contact_id FROM app.enrichment_contacts WHERE contact_id = @contact_id');

        const contactData = {
          contact_id: contactId,
          email: contact.most_probable_email || contact.emails?.[0]?.email,
          first_name: contact.firstname,
          last_name: contact.lastname,
          company: contact.profile?.position?.company?.name,
          domain: contact.domain || contact.profile?.position?.company?.domain,
          title: contact.profile?.position?.title || contact.profile?.headline,
          linkedin: contact.profile?.linkedin_url,
          phone_json: JSON.stringify(contact.phones || []),
          source: 'fullenrich'
        };

        if (existing.recordset.length === 0) {
          // Insert new contact
          await pool.request()
            .input('contact_id', contactData.contact_id)
            .input('email', contactData.email)
            .input('first_name', contactData.first_name)
            .input('last_name', contactData.last_name)
            .input('company', contactData.company)
            .input('domain', contactData.domain)
            .input('title', contactData.title)
            .input('linkedin', contactData.linkedin)
            .input('phone_json', contactData.phone_json)
            .input('source', contactData.source)
            .query('INSERT INTO app.enrichment_contacts (contact_id, email, first_name, last_name, company, domain, title, linkedin, phone_json, source) VALUES (@contact_id, @email, @first_name, @last_name, @company, @domain, @title, @linkedin, @phone_json, @source)');
        } else {
          // Update existing contact
          await pool.request()
            .input('contact_id', contactData.contact_id)
            .input('email', contactData.email)
            .input('first_name', contactData.first_name)
            .input('last_name', contactData.last_name)
            .input('company', contactData.company)
            .input('domain', contactData.domain)
            .input('title', contactData.title)
            .input('linkedin', contactData.linkedin)
            .input('phone_json', contactData.phone_json)
            .query('UPDATE app.enrichment_contacts SET email = @email, first_name = @first_name, last_name = @last_name, company = @company, domain = @domain, title = @title, linkedin = @linkedin, phone_json = @phone_json, updated_at = GETUTCDATE() WHERE contact_id = @contact_id');
        }
      }
    }

    console.log(`FullEnrich webhook processed successfully for job_id: ${jobId}`);
    res.status(200).send('OK');
  } catch (error: any) {
    console.error('FullEnrich webhook error:', error);
    res.status(500).send('Error processing webhook');
  }
});

/**
 * @openapi
 * /webhooks/graph:
 *   post:
 *     summary: Microsoft Graph webhook callback
 *     description: Handles email notifications from Microsoft Graph and syncs to comms threads
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 */
// Webhook for Microsoft Graph - handles email notifications
router.post('/graph', async (req, res) => {
  try {
    console.log('Microsoft Graph webhook received:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;
    
    // Handle validation token for subscription creation
    if (req.query.validationToken) {
      console.log('Validation token received for Graph subscription');
      return res.status(200).send(req.query.validationToken);
    }
    
    // Process notifications
    if (data.value && Array.isArray(data.value)) {
      const pool = await getPool();
      
      for (const notification of data.value) {
        const { subscriptionId, resource, changeType } = notification;
        
        // Extract message ID from resource URL
        const messageIdMatch = resource.match(/\/messages\/([^\/]+)/);
        if (!messageIdMatch) continue;
        
        const messageId = messageIdMatch[1];
        
        // Find the principal associated with this subscription
        const principalResult = await pool.request()
          .input('subscription_id', subscriptionId)
          .query('SELECT principal_id, org_id FROM app.principal WHERE graph_subscription_id = @subscription_id');
        
        if (principalResult.recordset.length === 0) {
          console.warn(`No principal found for subscription ${subscriptionId}`);
          continue;
        }
        
        const { principal_id, org_id } = principalResult.recordset[0];
        
        // Get message details from Graph API (this would be done via the Graph client)
        // For now, we'll store the notification and process it later
        await pool.request()
          .input('principal_id', principal_id)
          .input('org_id', org_id)
          .input('message_id', messageId)
          .input('change_type', changeType)
          .input('resource_url', resource)
          .input('notification_json', JSON.stringify(notification))
          .query(`
            INSERT INTO app.graph_notification_queue 
            (principal_id, org_id, message_id, change_type, resource_url, notification_json, created_at)
            VALUES (@principal_id, @org_id, @message_id, @change_type, @resource_url, @notification_json, GETUTCDATE())
          `);
        
        // Trigger async processing of the notification
        // This would typically be handled by a worker process
        console.log(`Queued Graph notification for processing: ${messageId}`);
      }
    }
    
    res.status(200).send('OK');
  } catch (error: any) {
    console.error('Microsoft Graph webhook error:', error);
    res.status(500).send('Error processing Graph webhook');
  }
});

export default router;
