import { resolveKey, testProvider, type ProviderRef } from '@/server/providers';
import { jsonError, noStore, readJson, str } from '@/server/http';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await readJson<{ provider: ProviderRef }>(req, 10_000);
    const type = str(body.provider?.type, 'provider.type', 64);
    const result = await testProvider(
      { type, model: str(body.provider?.model, 'provider.model', 200, false), accountId: str(body.provider?.accountId, 'accountId', 64, false) },
      resolveKey(type, req.headers.get('x-provider-key')),
    );
    return Response.json(result, { headers: noStore });
  } catch (err) {
    return jsonError(err);
  }
}
