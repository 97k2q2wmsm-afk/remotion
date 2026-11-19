import 'server-only';
import { ProviderError, checkAppToken } from './providers';

export function jsonError(err: unknown) {
  if (err instanceof ProviderError) {
    const headers: Record<string, string> = {};
    if (err.retryAfter) headers['retry-after'] = String(err.retryAfter);
    return Response.json({ error: err.message, status: err.status, retryAfter: err.retryAfter }, { status: err.status, headers });
  }
  console.error('[api] unexpected error', err instanceof Error ? err.message : err);
  return Response.json({ error: 'Unexpected server error' }, { status: 500 });
}

export async function readJson<T>(req: Request, maxBytes = 12 * 1024 * 1024): Promise<T> {
  checkAppToken(req);
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > maxBytes) throw new ProviderError('Request too large', 413);
  const text = await req.text();
  if (text.length > maxBytes) throw new ProviderError('Request too large', 413);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError('Invalid JSON body', 400);
  }
}

export function str(v: unknown, field: string, max: number, required = true): string {
  if (v === undefined || v === null || v === '') {
    if (required) throw new ProviderError(`Missing ${field}`, 400);
    return '';
  }
  if (typeof v !== 'string') throw new ProviderError(`${field} must be text`, 400);
  if (v.length > max) throw new ProviderError(`${field} is too long (max ${max} characters)`, 400);
  return v;
}

export function num(v: unknown, field: string, min: number, max: number, fallback?: number): number {
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback;
    throw new ProviderError(`Missing ${field}`, 400);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ProviderError(`${field} must be between ${min} and ${max}`, 400);
  return n;
}

export const noStore = { 'cache-control': 'no-store' };
