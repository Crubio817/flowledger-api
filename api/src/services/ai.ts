import OpenAI from 'openai';
import { toolsSpec, callTool } from './ai_tools';

const key = process.env.OPENAI_API_KEY || '';
const baseURL = process.env.OPENAI_BASE_URL || undefined;
const apiVersion = process.env.OPENAI_API_VERSION || undefined;

// When talking to Azure OpenAI, set default headers/query for api-key and api-version
const client = new OpenAI({
  apiKey: key || 'missing',
  baseURL,
  ...(baseURL
    ? {
        defaultHeaders: { 'api-key': key },
        defaultQuery: apiVersion ? { 'api-version': apiVersion } : undefined,
      }
    : {}),
});

export const ai = client;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
  content: string;
}

export async function chatOnce(params: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  tools?: any[];
}) {
  const { messages, model = process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature = 0.2, tools } = params;
  const resp = await client.chat.completions.create({
    model,
    messages,
    temperature,
    ...(tools ? { tools, tool_choice: 'auto' as const } : {}),
  });
  const choice = resp.choices?.[0];
  const content = choice?.message?.content ?? '';
  return { content, raw: resp };
}

export async function runAgent(params: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxSteps?: number;
}) {
  const { messages, model = process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature = 0.2, maxSteps = 4 } = params;
  const convo: any[] = messages.map(m => ({ role: m.role, content: m.content }));
  const trace: any[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const resp = await client.chat.completions.create({
      model,
      temperature,
      messages: convo as any,
      tools: toolsSpec as any,
      tool_choice: 'auto',
    });
    const msg = resp.choices?.[0]?.message as any;
    if (!msg) break;
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      // Final assistant message
      convo.push({ role: 'assistant', content: msg.content || '' });
      return { content: msg.content || '', trace };
    }
    // Execute each tool call sequentially and append results
    for (const tc of msg.tool_calls) {
      const name = tc.function?.name as string;
      const args = safeParseJSON(tc.function?.arguments);
      try {
        const result = await callTool(name, args);
        trace.push({ name, args, result });
        convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) } as any);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        trace.push({ name, args, error: err });
        convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: err }) } as any);
      }
    }
  }
  return { content: '', trace, stopped: true };
}

function safeParseJSON(s: any) {
  if (typeof s !== 'string') return {};
  try { return JSON.parse(s); } catch { return {}; }
}
