// Test Clay API as fallback
const axios = require('axios');

async function testClayAPI() {
  const testData = {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@example.com',
    company: 'Example Corp',
    domain: 'example.com'
  };

  // Common Clay API endpoints
  const clayEndpoints = [
    'https://api.clay.com/v1/enrich',
    'https://api.clay.com/v2/enrich',
    'https://app.clay.com/api/v1/enrich',
    'https://clay.com/api/v1/enrich'
  ];

  console.log('Testing Clay API endpoints...\n');

  for (const endpoint of clayEndpoints) {
    try {
      console.log(`Testing: ${endpoint}`);
      const response = await axios.post(endpoint, testData, {
        headers: {
          'Authorization': `Bearer ${process.env.CLAY_API_KEY || '395b4fd2f7a25100202a'}`
        },
        timeout: 10000
      });

      console.log(`✅ SUCCESS: ${endpoint}`);
      console.log(`Response status: ${response.status}`);
      console.log(`Response data:`, JSON.stringify(response.data, null, 2));
      console.log('');

      if (response.status === 200) {
        console.log(`🎉 Found working Clay endpoint: ${endpoint}`);
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

  console.log('No working Clay endpoints found.');
  return null;
}

testClayAPI();
