// Test FullEnrich API with correct format
const axios = require('axios');

async function testCorrectFullEnrich() {
  try {
    console.log('Testing FullEnrich API with correct format...');

    const endpoint = 'https://app.fullenrich.com/api/v1/contact/enrich/bulk';

    const requestData = {
      name: `Test Enrichment ${Date.now()}`,
      datas: [{
        firstname: 'john',  // Note: lowercase field names as per docs
        lastname: 'doe',
        domain: 'example.com',
        company_name: 'Example Corp',
        enrich_fields: [
          'contact.emails',
          'contact.phones'
        ],
        custom: {
          user_id: '12345'  // Must be string as per docs
        }
      }],
      webhook_url: 'http://localhost:4001/webhooks/fullenrich'
    };

    console.log('Request:', JSON.stringify(requestData, null, 2));

    const response = await axios.post(endpoint, requestData, {
      headers: {
        'Authorization': `Bearer dca04cd4-0ec8-4552-98b9-4e4d143b0acd`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log('✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('❌ FAILED!');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testCorrectFullEnrich();
