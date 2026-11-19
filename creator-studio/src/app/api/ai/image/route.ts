import { generateImage, resolveKey, type ProviderRef } from '@/server/providers';
import { jsonError, noStore, num, readJson, str } from '@/server/http';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      provider: ProviderRef;
      prompt: string;
      negativePrompt?: string;
      width: number;
      height: number;
      seed?: number;
      referenceImage?: string;
      referenceStrength?: number;
    }>(req);
    const type = str(body.provider?.type, 'provider.type', 64);
    const ref: ProviderRef = {
      type,
      model: str(body.provider?.model, 'provider.model', 200, false),
      accountId: str(body.provider?.accountId, 'provider.accountId', 64, false),
    };
    const result = await generateImage(ref, resolveKey(type, req.headers.get('x-provider-key')), {
      prompt: str(body.prompt, 'prompt', 4000),
      negativePrompt: str(body.negativePrompt, 'negativePrompt', 2000, false) || undefined,
      width: Math.round(num(body.width, 'width', 256, 2048) / 8) * 8,
      height: Math.round(num(body.height, 'height', 256, 2048) / 8) * 8,
      seed: body.seed === undefined ? undefined : Math.floor(num(body.seed, 'seed', 0, 2 ** 31)),
      referenceImage: str(body.referenceImage, 'referenceImage', 10_000_000, false) || undefined,
      referenceStrength: body.referenceStrength === undefined ? undefined : num(body.referenceStrength, 'referenceStrength', 0, 1),
    });
    return new Response(result.bytes, { headers: { 'content-type': result.mime, ...noStore } });
  } catch (err) {
    return jsonError(err);
  }
}
