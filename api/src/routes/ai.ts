import { Router } from 'express';
import { asyncHandler, badRequest, ok } from '../utils/http';
import { ai, chatOnce, runAgent } from '../services/ai';
import { suggestTagsForNote } from '../services/tag_suggest';
import { suggestNamesForEngagement } from '../services/name_suggest';

const router = Router();

/**
 * @openapi
 * /api/ai/chat:
 *   post:
 *     summary: Chat completion
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messages]
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role: { type: string, enum: [system, user, assistant] }
 *                     content: { type: string }
 *               model: { type: string }
 *               temperature: { type: number }
 *     responses:
 *       200:
 *         description: Assistant reply
 */
router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { messages, model, temperature } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0)
      return badRequest(res, 'messages array required');
    const msgs = messages.map((m: any) => ({ role: m.role, content: String(m.content ?? '') }));
    const result = await chatOnce({ messages: msgs, model, temperature });
    ok(res, { content: result.content });
  })
);

/**
 * @openapi
 * /api/ai/chat-stream:
 *   post:
 *     summary: Chat completion (SSE stream)
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messages]
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role: { type: string, enum: [system, user, assistant] }
 *                     content: { type: string }
 *               model: { type: string }
 *               temperature: { type: number }
 *     responses:
 *       200:
 *         description: Server-sent events stream
 */
router.post(
  '/chat-stream',
  asyncHandler(async (req, res) => {
    const { messages, model, temperature } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0)
      return badRequest(res, 'messages array required');
    const msgs = messages.map((m: any) => ({ role: m.role, content: String(m.content ?? '') }));

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const stream = await ai.chat.completions.create({
      model: model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: typeof temperature === 'number' ? temperature : 0.2,
      stream: true,
      messages: msgs as any,
    });

    try {
      for await (const chunk of stream as any) {
        const c = chunk?.choices?.[0];
        const delta: string | undefined = c?.delta?.content ?? c?.message?.content;
        if (delta) {
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: (e as Error).message })}\n\n`);
    } finally {
      res.end();
    }
  })
);

/**
 * @openapi
 * /api/ai/assist:
 *   post:
 *     summary: Tool-enabled assistant that can fetch server data
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messages]
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role: { type: string, enum: [system, user, assistant] }
 *                     content: { type: string }
 *               model: { type: string }
 *               temperature: { type: number }
 *     responses:
 *       200:
 *         description: Assistant reply with tool trace
 */
router.post('/assist', asyncHandler(async (req, res) => {
  const { messages, model, temperature } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0)
    return badRequest(res, 'messages array required');
  const msgs = messages.map((m: any) => ({ role: m.role, content: String(m.content ?? '') }));
  const result = await runAgent({ messages: msgs, model, temperature });
  ok(res, result);
}));

export default router;

/**
 * @openapi
 * /api/ai/tag-suggest:
 *   post:
 *     summary: Suggest tags for a note (reuse existing, propose few new)
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, note]
 *             properties:
 *               client_id: { type: integer }
 *               note: { type: string }
 *               maxExisting: { type: integer, description: 'Max existing tags to suggest' }
 *               maxNew: { type: integer, description: 'Max new tags to propose' }
 *     responses:
 *       200:
 *         description: Tag suggestions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok] }
 *                 data:
 *                   type: object
 *                   properties:
 *                     existing:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           tag_id: { type: integer }
 *                           tag_name: { type: string }
 *                           reason: { type: string }
 *                     new:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           tag_name: { type: string }
 *                           reason: { type: string }
 *                     rationale: { type: string }
 */
router.post('/tag-suggest', asyncHandler(async (req, res) => {
  const { client_id, note, maxExisting, maxNew } = req.body || {};
  if (!Number.isInteger(client_id) || client_id <= 0) return badRequest(res, 'client_id must be a positive integer');
  if (typeof note !== 'string' || !note.trim()) return badRequest(res, 'note required');
  const result = await suggestTagsForNote({ client_id, note, maxExisting, maxNew });
  ok(res, result);
}));

router.post('/name-suggest', asyncHandler(async (req, res) => {
  const { client_id, current_name, context, maxSuggestions } = req.body || {};
  if (!current_name || typeof current_name !== 'string') return badRequest(res, 'current_name required');
  const suggestions = await suggestNamesForEngagement({ client_id, current_name, context, maxSuggestions });
  ok(res, { status: 'ok', data: suggestions });
}));
