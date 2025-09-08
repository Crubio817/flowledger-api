// Test enrich_contact tool
const axios = require('axios');

async function testEnrichContact() {
  try {
    console.log('Testing enrich_contact tool...');

    const response = await axios.post('http://localhost:4001/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'enrich_contact',
        arguments: {
          first_name: 'John',
          last_name: 'Doe',
          email: 'john.doe@example.com',
          company: 'Example Corp',
          domain: 'example.com'
        }
      }
    });

    console.log('Enrich contact result:', JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testEnrichContact();
