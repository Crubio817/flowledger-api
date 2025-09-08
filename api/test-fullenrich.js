// Test FullEnrich API endpoints
const axios = require('axios');

async function testFullEnrichEndpoints() {
  const endpoints = [
    'https://api.fullenrich.com/v1/enrich',
    'https://app.fullenrich.com/api/v1/enrich',
    'https://app.fullenrich.com/api/v1/contact/enrich',
    'https://enrich.fullenrich.com/api/v1/enrich',
    'https://api.fullenrich.com/v2/enrich',
    'https://fullenrich.com/api/v1/enrich'
  ];

  const testData = {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@example.com',
    company: 'Example Corp',
    domain: 'example.com'
  };

  console.log('Testing FullEnrich API endpoints...\n');

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing: ${endpoint}`);
      const response = await axios.post(endpoint, testData, {
        headers: {
          'Authorization': `Bearer ${process.env.FULLENRICH_API_KEY || 'dca04cd4-0ec8-4552-98b9-4e4d143b0acd'}`
        },
        timeout: 10000
      });

      console.log(`✅ SUCCESS: ${endpoint}`);
      console.log(`Response status: ${response.status}`);
      console.log(`Response data:`, JSON.stringify(response.data, null, 2));
      console.log('');

      // If we get a successful response, we can stop testing
      if (response.status === 200) {
        console.log(`🎉 Found working endpoint: ${endpoint}`);
        return endpoint;
      }

    } catch (error) {
      console.log(`❌ FAILED: ${endpoint}`);
      console.log(`Error: ${error.message}`);
      if (error.response) {
        console.log(`Status: ${error.response.status}`);
        console.log(`Response:`, JSON.stringify(error.response.data, null, 2));
      }
      console.log('');
    }
  }

  console.log('No working endpoints found.');
  return null;
}

testFullEnrichEndpoints();
