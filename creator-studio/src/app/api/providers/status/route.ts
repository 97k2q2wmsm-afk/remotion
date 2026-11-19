import { checkAppToken, configuredEnv } from '@/server/providers';
import { jsonError, noStore } from '@/server/http';

export const runtime = 'nodejs';

/** Reports which provider keys are configured on the server (booleans only, never values). */
export async function GET(req: Request) {
  try {
    checkAppToken(req);
    return Response.json({ env: configuredEnv(), version: process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0' }, { headers: noStore });
  } catch (err) {
    return jsonError(err);
  }
}
