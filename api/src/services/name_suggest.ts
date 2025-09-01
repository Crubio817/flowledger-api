import { ai } from './ai';

export interface NameSuggestion { name: string; reason?: string }

export async function suggestNamesForEngagement(opts: {
  client_id?: number;
  current_name: string;
  context?: string;
  maxSuggestions?: number;
}): Promise<NameSuggestion[]> {
  const max = Math.max(1, Math.min(10, opts.maxSuggestions ?? 3));

  // Local mock shortcut for dev/testing
  if (process.env.LOCAL_TAG_SUGGEST_MOCK === '1') {
    const base = [
      { name: `${opts.current_name} (Refined)`, reason: 'Refined shorter title' },
      { name: `${opts.current_name} - AP Review`, reason: 'Add AP context' },
      { name: `${opts.current_name} (Pilot)`, reason: 'Suggested pilot engagement' }
    ];
    return base.slice(0, max);
  }

  const system = `You are a concise naming assistant for short engagement titles.
Return a JSON array of suggestions (max ${max}) with optional short reasons:
[{"name":"...","reason":"..."}, ...]`;
  const user = `Current name: ${opts.current_name}\nContext: ${opts.context||'(none)'}\nReturn up to ${max} suggestions. Prefer concise, descriptive names.`;

  const resp = await ai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.3,
    response_format: { type: 'json_array' } as any,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  const raw = resp.choices?.[0]?.message?.content || '[]';
  let parsed: any[] = [];
  try { parsed = JSON.parse(raw); } catch {
    const lines = (raw||'').split(/[,\r\n]+/).map(s=>s.trim()).filter(Boolean);
    parsed = lines.slice(0, max).map(s=>({ name: s }));
  }

  const out = parsed.slice(0, max).map((it:any)=>({ name: String(it?.name ?? it).trim(), reason: it?.reason ? String(it.reason) : undefined })).filter(s=>s.name);
  return out;
}

export default suggestNamesForEngagement;
