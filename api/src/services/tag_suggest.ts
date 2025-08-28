import { ai } from './ai';
import { getPool, sql } from '../db/pool';

export interface TagSuggestionInput {
  client_id: number;
  note: string;
  maxExisting?: number;
  maxNew?: number;
}

export interface TagSuggestionResult {
  existing: { tag_id: number; tag_name: string; reason?: string }[];
  new: { tag_name: string; reason?: string }[];
  rationale?: string;
}

export async function suggestTagsForNote(params: TagSuggestionInput): Promise<TagSuggestionResult> {
  const { client_id, note } = params;
  const maxExisting = Math.max(0, Math.min(10, params.maxExisting ?? 5));
  const maxNew = Math.max(0, Math.min(5, params.maxNew ?? 2));

  const pool = await getPool();
  // Existing tags for this client
  const existing = await pool
    .request()
    .input('cid', sql.Int, client_id)
    .query(
      `SELECT t.tag_id, t.tag_name
       FROM app.client_tag_map m
       JOIN app.client_tags t ON t.tag_id = m.tag_id
       WHERE m.client_id = @cid
       ORDER BY t.tag_name`
    );
  const clientTags = existing.recordset as { tag_id: number; tag_name: string }[];

  // Catalog of all tags (names only) to prefer from
  const all = await pool.request().query(`SELECT tag_id, tag_name FROM app.client_tags ORDER BY tag_name`);
  const allTags = all.recordset as { tag_id: number; tag_name: string }[];

  // Build a short prompt with available tags to prefer
  const tagCatalog = allTags.map(t => t.tag_name).join(', ');
  const clientTagSet = new Set(clientTags.map(t => t.tag_name.toLowerCase()));

  const system = `You help categorize client notes with concise tags.
Prefer reusing existing tags from the provided catalog.
Only propose a few (<=${maxExisting} existing tags, <=${maxNew} new tags).
Avoid creating near-duplicates or overly specific tags.
Return strict JSON with optional per-tag reasoning for UI hovers:
{
  "existing": [{"name":"TagA","reason":"why"}, ...],
  "new": [{"name":"NewTag","reason":"why"}, ...],
  "rationale": "overall brief rationale"
}`;

  const user = `Note:\n${note}\n\nTag catalog (prefer reusing): ${tagCatalog || '(empty)'}\n`;

  const resp = await ai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' } as any,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const content = resp.choices?.[0]?.message?.content || '{}';
  let json: any = {};
  try { json = JSON.parse(content); } catch { json = {}; }
  // Accept either arrays of strings or objects with {name,reason}
  const existingItems: { name: string; reason?: string }[] = Array.isArray(json.existing)
    ? json.existing.map((x: any) => (typeof x === 'string' ? { name: x } : { name: String(x?.name ?? ''), reason: x?.reason ? String(x.reason) : undefined }))
    : [];
  const newItemsRaw: { name: string; reason?: string }[] = Array.isArray(json.new)
    ? json.new.map((x: any) => (typeof x === 'string' ? { name: x } : { name: String(x?.name ?? ''), reason: x?.reason ? String(x.reason) : undefined }))
    : [];

  // Map existing name suggestions to tag_id from catalog
  const nameToId = new Map(allTags.map(t => [t.tag_name.toLowerCase(), t.tag_id] as const));
  const existingOut: { tag_id: number; tag_name: string }[] = [];
  for (const item of existingItems) {
    const name = item.name;
    const id = nameToId.get(name.toLowerCase());
    if (id) existingOut.push({ tag_id: id, tag_name: name, reason: item.reason });
    if (existingOut.length >= maxExisting) break;
  }

  // Filter new names: exclude duplicates or those already on client
  const seen = new Set(existingOut.map(t => t.tag_name.toLowerCase()));
  const newOut: { tag_name: string; reason?: string }[] = [];
  for (const item of newItemsRaw) {
    const name = item.name;
    const low = name.toLowerCase();
    if (nameToId.has(low)) continue; // already exists globally -> should be in existing list
    if (clientTagSet.has(low)) continue;
    if (!seen.has(low)) {
      newOut.push({ tag_name: name, reason: item.reason });
      seen.add(low);
      if (newOut.length >= maxNew) break;
    }
  }

  return { existing: existingOut, new: newOut, rationale: typeof json.rationale === 'string' ? json.rationale : undefined };
}
