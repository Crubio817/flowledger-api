// Direct test of FullEnrich API
const axios = require('axios');

async function testFullEnrichDirect() {
  try {
    console.log('Testing FullEnrich API directly...');

    const endpoint = 'https://app.fullenrich.com/api/v1/contact/enrich/bulk';

    // Try with form data instead of JSON
    const FormData = require('form-data');
    const form = new FormData();

    form.append('name', 'Test Enrichment');
    form.append('email', 'john.doe@example.com');
    form.append('first_name', 'John');
    form.append('last_name', 'Doe');
    form.append('domain', 'example.com');
    form.append('company', 'Example Corp');

    console.log('Sending as form data...');

    const response = await axios.post(endpoint, form, {
      headers: {
        'Authorization': `Bearer dca04cd4-0ec8-4552-98b9-4e4d143b0acd`,
        ...form.getHeaders()
      },
      timeout: 15000
    });

    console.log('✅ SUCCESS!');
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('❌ FAILED!');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testFullEnrichDirect();
