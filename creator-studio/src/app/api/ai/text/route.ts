import { generateText, resolveKey, type ChatMessage, type ProviderRef } from '@/server/providers';
import { jsonError, noStore, num, readJson, str } from '@/server/http';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await readJson<{ provider: ProviderRef; messages: ChatMessage[]; json?: boolean; maxTokens?: number; temperature?: number }>(req, 400_000);
    const type = str(body.provider?.type, 'provider.type', 64);
    const model = str(body.provider?.model, 'provider.model', 200, false);
    if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 20) throw new Error('messages');
    const messages = body.messages.map((m, i) => ({
      role: (['system', 'user', 'assistant'].includes(m.role) ? m.role : 'user') as ChatMessage['role'],
      content: str(m.content, `messages[${i}].content`, 120_000),
    }));
    const key = resolveKey(type, req.headers.get('x-provider-key'));
    const text = await generateText({ type, model }, key, messages, {
      json: Boolean(body.json),
      maxTokens: num(body.maxTokens, 'maxTokens', 64, 32_000, 8000),
      temperature: num(body.temperature, 'temperature', 0, 2, 0.8),
    });
    return Response.json({ text }, { headers: noStore });
  } catch (err) {
    if (err instanceof Error && err.message === 'messages') return Response.json({ error: 'messages must be 1-20 items' }, { status: 400 });
    return jsonError(err);
  }
}
