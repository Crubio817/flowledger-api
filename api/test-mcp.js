// Test MCP server
const axios = require('axios');

async function testMCP() {
  try {
    console.log('Testing MCP server...');

    // Test health
    const health = await axios.get('http://localhost:4001/healthz');
    console.log('Health check:', health.data);

    // Test MCP tools/list
    const toolsResponse = await axios.post('http://localhost:4001/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    });
    console.log('Tools list:', JSON.stringify(toolsResponse.data.result.tools.map(t => t.name), null, 2));

    // Test send_email tool
    console.log('Testing send_email tool...');
    const emailResponse = await axios.post('http://localhost:4001/mcp', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'send_email',
        arguments: {
          to: ['test@example.com'],
          subject: 'MCP Test Email',
          text: 'This is a test email from the MCP server.',
          fromUserPrincipalName: 'CarlosRubio@fixers-team.com'
        }
      }
    });
    console.log('Email result:', JSON.stringify(emailResponse.data, null, 2));

  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else if (error.code) {
      console.error('Error code:', error.code);
    }
  }
}

testMCP();
