import { generateVoice, resolveKey, type ProviderRef } from '@/server/providers';
import { jsonError, noStore, num, readJson, str } from '@/server/http';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await readJson<{ provider: ProviderRef; text: string; voiceId?: string; speed?: number; style?: string }>(req, 100_000);
    const type = str(body.provider?.type, 'provider.type', 64);
    const result = await generateVoice(
      { type, model: str(body.provider?.model, 'provider.model', 200, false) },
      resolveKey(type, req.headers.get('x-provider-key')),
      {
        text: str(body.text, 'text', 5000),
        voiceId: str(body.voiceId, 'voiceId', 100, false) || undefined,
        speed: num(body.speed, 'speed', 0.5, 2, 1),
        style: str(body.style, 'style', 300, false) || undefined,
      },
    );
    return new Response(result.bytes, { headers: { 'content-type': result.mime, ...noStore } });
  } catch (err) {
    return jsonError(err);
  }
}
