import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { sendEmailTool, enrichContactTool, getEnrichmentTool } from './mcp-tools';

const server = new Server(
  {
    name: 'flowledger-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'send_email',
        description: 'Send an email using Microsoft Graph',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'array', items: { type: 'string' } },
            subject: { type: 'string' },
            text: { type: 'string' },
            html: { type: 'string' },
            fromUserPrincipalName: { type: 'string' },
          },
          required: ['to', 'subject'],
        },
      },
      {
        name: 'enrich_contact',
        description: 'Enrich contact information using FullEnrich or Clay',
        inputSchema: {
          type: 'object',
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string' },
            company: { type: 'string' },
            domain: { type: 'string' },
          },
        },
      },
      {
        name: 'get_enrichment',
        description: 'Get enrichment result by job_id',
        inputSchema: {
          type: 'object',
          properties: {
            job_id: { type: 'string' },
          },
          required: ['job_id'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'send_email':
      return await sendEmailTool(args);
    case 'get_enrichment':
      return await getEnrichmentTool(args);
    case 'enrich_contact':
      return await enrichContactTool(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

export async function handleMCPRequest(req: any, res: any) {
  try {
    const message = req.body;
    let response: any;

    if (message.method === 'initialize') {
      response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'flowledger-mcp',
            version: '0.1.0',
          },
        },
      };
    } else if (message.method === 'tools/list') {
      const tools = await listToolsHandler();
      response = {
        jsonrpc: '2.0',
        id: message.id,
        result: tools,
      };
    } else if (message.method === 'tools/call') {
      const result = await callToolHandler(message.params);
      response = {
        jsonrpc: '2.0',
        id: message.id,
        result,
      };
    } else {
      response = {
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'Method not found' },
      };
    }

    res.json(response);
  } catch (error: any) {
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: { code: -32000, message: error.message },
    });
  }
}

async function listToolsHandler() {
  return {
    tools: [
      {
        name: 'send_email',
        description: 'Send an email using Microsoft Graph',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'array', items: { type: 'string' } },
            subject: { type: 'string' },
            text: { type: 'string' },
            html: { type: 'string' },
            fromUserPrincipalName: { type: 'string' },
          },
          required: ['to', 'subject'],
        },
      },
      {
        name: 'enrich_contact',
        description: 'Enrich contact information using FullEnrich or Clay',
        inputSchema: {
          type: 'object',
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string' },
            company: { type: 'string' },
            domain: { type: 'string' },
          },
        },
      },
      {
        name: 'get_enrichment',
        description: 'Get enrichment result by job_id',
        inputSchema: {
          type: 'object',
          properties: {
            job_id: { type: 'string' },
          },
          required: ['job_id'],
        },
      },
    ],
  };
}

async function callToolHandler(params: any) {
  const { name, arguments: args } = params;

  switch (name) {
    case 'send_email':
      return await sendEmailTool(args);
    case 'enrich_contact':
      return await enrichContactTool(args);
    case 'get_enrichment':
      return await getEnrichmentTool(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export { server };
