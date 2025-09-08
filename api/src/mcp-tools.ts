import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { ClientSecretCredential } from '@azure/identity';
import axios from 'axios';
import { getPool } from './db/pool';
import { v4 as uuidv4 } from 'uuid';

const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID!,
  process.env.AZURE_CLIENT_ID!,
  process.env.AZURE_CLIENT_SECRET!
);
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default']
});
const client = Client.initWithMiddleware({
  authProvider,
});

export async function sendEmailTool(args: any) {
  const { to, subject, text, html, fromUserPrincipalName } = args;

  if (!fromUserPrincipalName) {
    throw new Error('fromUserPrincipalName is required for sending emails');
  }

  const message = {
    subject,
    body: {
      contentType: html ? 'html' : 'text',
      content: html || text,
    },
    toRecipients: to.map((email: string) => ({
      emailAddress: { address: email },
    })),
  };

  const endpoint = `/users/${fromUserPrincipalName}/sendMail`;

  const response = await client.api(endpoint).post({ message });

  // Save to DB - generate our own message ID since Graph API sendMail doesn't return one
  const pool = await getPool();
  const messageId = uuidv4();
  await pool.request()
    .input('message_id', messageId)
    .input('to_json', JSON.stringify(to))
    .input('subject', subject)
    .input('body_hash', '') // TODO: hash body
    .input('provider', 'graph')
    .input('status', 'sent')
    .query('INSERT INTO app.emails (message_id, to_json, subject, body_hash, provider, status) VALUES (@message_id, @to_json, @subject, @body_hash, @provider, @status)');

  return { content: [{ type: 'text', text: `Email sent with message ID: ${messageId}` }] };
}

export async function enrichContactTool(args: any) {
  const { first_name, last_name, email, company, domain } = args;

  const jobId = uuidv4();

  try {
    // Check if we should use mock mode for testing
    if (process.env.FULLENRICH_MOCK === 'true') {
      console.log('Using FullEnrich mock mode for testing');
      
      // Save to DB with mock data
      const pool = await getPool();
      await pool.request()
        .input('job_id', jobId)
        .input('provider', 'fullenrich')
        .input('input_json', JSON.stringify(args))
        .input('status', 'pending')
        .query('INSERT INTO app.enrichment_jobs (job_id, provider, input_json, status) VALUES (@job_id, @provider, @input_json, @status)');

      return { content: [{ type: 'text', text: JSON.stringify({ status: 'pending', job_id: jobId }) }] };
    }

    // Use the correct FullEnrich bulk endpoint with proper JSON structure
    const endpoint = 'https://app.fullenrich.com/api/v1/contact/enrich/bulk';
    
    try {
      console.log(`Calling FullEnrich endpoint: ${endpoint}`);
      
      // Prepare request data with correct FullEnrich bulk format (per official docs)
      const requestData = {
        name: `MCP Contact Enrichment ${Date.now()}`, // Required: enrichment name
        datas: [{ // Required: non-empty datas array
          firstname: first_name,  // Note: lowercase field names as per FullEnrich docs
          lastname: last_name,
          domain: domain,
          company_name: company,
          enrich_fields: [
            'contact.emails',
            'contact.phones'
          ],
          custom: {
            job_id: jobId  // Put our job_id in custom field for webhook tracking (must be string)
          }
        }],
        webhook_url: `${process.env.BASE_URL || 'http://localhost:4001'}/webhooks/fullenrich`
      };

      console.log('FullEnrich request:', JSON.stringify(requestData, null, 2));

      const fullEnrichResponse = await axios.post(endpoint, requestData, {
        headers: { 
          'Authorization': `Bearer ${process.env.FULLENRICH_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000,
      });

      console.log('FullEnrich response:', fullEnrichResponse.data);

      // FullEnrich returns enrichment data immediately or an ID for async processing
      const enrichmentId = fullEnrichResponse.data.id || fullEnrichResponse.data.enrichment_id || jobId;

      // Save to DB with additional tracking info
      const pool = await getPool();
      await pool.request()
        .input('job_id', jobId)
        .input('provider', 'fullenrich')
        .input('input_json', JSON.stringify({
          ...args,
          enrichment_name: requestData.name,
          enrichment_id: enrichmentId
        }))
        .input('status', 'pending')
        .query('INSERT INTO app.enrichment_jobs (job_id, provider, input_json, status) VALUES (@job_id, @provider, @input_json, @status)');

      return { content: [{ type: 'text', text: JSON.stringify({ 
        status: 'pending', 
        job_id: jobId,
        enrichment_id: enrichmentId,
        message: 'FullEnrich enrichment request submitted. Results will be delivered via webhook.' 
      }) }] };

    } catch (error: any) {
      console.error(`FullEnrich API error:`, error.message);
      if (error.response) {
        console.error('FullEnrich error response:', error.response.data);
      }
      
      // TODO: Implement Clay fallback here if needed
      // For now, just throw the error
      throw error;
    }
  } catch (error: any) {
    console.error('FullEnrich API error:', error.message);
    
    // Fallback to Clay or return error
    return { content: [{ type: 'text', text: JSON.stringify({ 
      status: 'error', 
      error: 'FullEnrich API unavailable', 
      details: error.message 
    }) }] };
  }
}

export async function getEnrichmentTool(args: any) {
  const { job_id } = args;

  const pool = await getPool();
  const result = await pool.request()
    .input('job_id', job_id)
    .query('SELECT status, result_json, input_json FROM app.enrichment_jobs WHERE job_id = @job_id');

  if (result.recordset.length === 0) {
    return { content: [{ type: 'text', text: JSON.stringify({ status: 'error', error: 'Job not found' }) }] };
  }

  const { status, result_json, input_json } = result.recordset[0];
  
  // If status is still pending and we have enrichment_id, try to fetch from FullEnrich directly
  if (status === 'pending' && result_json) {
    try {
      const inputData = JSON.parse(input_json);
      const enrichmentId = inputData.enrichment_id;
      
      if (enrichmentId) {
        console.log(`Fetching enrichment status from FullEnrich for ID: ${enrichmentId}`);
        
        const fullEnrichResponse = await axios.get(
          `https://app.fullenrich.com/api/v1/contact/enrich/bulk/${enrichmentId}`,
          {
            headers: { 
              'Authorization': `Bearer ${process.env.FULLENRICH_API_KEY}` 
            },
            timeout: 10000
          }
        );
        
        // If enrichment is finished, update our database
        if (fullEnrichResponse.data.status === 'FINISHED') {
          await pool.request()
            .input('job_id', job_id)
            .input('result_json', JSON.stringify(fullEnrichResponse.data))
            .input('status', 'complete')
            .query('UPDATE app.enrichment_jobs SET result_json = @result_json, status = @status, updated_at = GETUTCDATE() WHERE job_id = @job_id');
          
          return { content: [{ type: 'text', text: JSON.stringify({ 
            status: 'complete', 
            result: fullEnrichResponse.data 
          }) }] };
        } else {
          return { content: [{ type: 'text', text: JSON.stringify({ 
            status: fullEnrichResponse.data.status.toLowerCase(), 
            enrichment_id: enrichmentId,
            result: fullEnrichResponse.data 
          }) }] };
        }
      }
    } catch (error: any) {
      console.error('Error fetching from FullEnrich:', error.message);
      // Fall through to return database status
    }
  }

  return { content: [{ type: 'text', text: JSON.stringify({ 
    status, 
    result: result_json ? JSON.parse(result_json) : null 
  }) }] };
}
