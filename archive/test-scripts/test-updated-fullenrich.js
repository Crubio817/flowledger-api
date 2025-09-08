// Test updated FullEnrich integration
const axios = require('axios');

async function testUpdatedFullEnrich() {
  try {
    console.log('Testing updated FullEnrich integration via MCP...');

    // Test through MCP server
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

    console.log('MCP enrich_contact result:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testUpdatedFullEnrich();
