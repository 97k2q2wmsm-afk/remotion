import type { ProviderConfig } from '@/types';
import { adapterInfo } from '@/config/providers';
import { getSettings, recordUsage } from '@/services/storage/settings';
import { approvePaid, consumePaid } from './approval';
import { generateComfyImage, testComfy } from '@/services/image-providers/comfyui';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ProviderCallError extends Error {
  constructor(
    message: string,
    public status?: number,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'ProviderCallError';
  }
  get retryable() {
    return this.status === 429 || this.status === 503 || this.status === 504 || this.status === undefined;
  }
}

async function headersFor(p?: ProviderConfig): Promise<Record<string, string>> {
  const settings = await getSettings();
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (settings.appToken) h['x-app-token'] = settings.appToken;
  if (p?.apiKey) h['x-provider-key'] = p.apiKey;
  return h;
}

async function proxy(path: string, p: ProviderConfig | undefined, body: unknown, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: await headersFor(p), body: JSON.stringify(body), signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ProviderCallError(navigator.onLine === false ? 'You are offline.' : 'Could not reach the app server.');
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let retryAfter: number | undefined;
    try {
      const j = await res.json();
      msg = j.error ?? msg;
      retryAfter = j.retryAfter;
    } catch {
      /* non-JSON */
    }
    throw new ProviderCallError(msg, res.status, retryAfter);
  }
  return res;
}

function providerRef(p: ProviderConfig) {
  return { type: p.type, model: p.model || adapterInfo(p.type)?.defaultModel, accountId: p.accountId };
}

function directBase(p: ProviderConfig): string {
  const base = (p.endpoint || adapterInfo(p.type)?.defaultEndpoint || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new ProviderCallError('Set a valid http(s) endpoint URL for this provider.', 400);
  if (location.protocol === 'https:' && base.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) {
    throw new ProviderCallError('This app runs on HTTPS, so the browser blocks plain-HTTP endpoints. Expose your server over HTTPS (e.g. Tailscale serve / Cloudflare Tunnel).', 400);
  }
  return base;
}

async function directFetch(url: string, init: RequestInit, label: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ProviderCallError(`${label} is not reachable from this device (network or CORS).`);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new ProviderCallError(`${label}: HTTP ${res.status} ${t.slice(0, 200)}`, res.status);
  }
  return res;
}

export async function completeText(
  p: ProviderConfig,
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number; temperature?: number; signal?: AbortSignal; action?: string } = {},
): Promise<string> {
  await approvePaid(p, opts.action ?? 'Generate text', 1);
  consumePaid(p);
  try {
    let text: string;
    if (p.type === 'openai-compatible-text') {
      const base = directBase(p);
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (p.apiKey) headers.authorization = `Bearer ${p.apiKey}`;
      const res = await directFetch(
        `${base}/chat/completions`,
        {
          method: 'POST',
          headers,
          signal: opts.signal,
          body: JSON.stringify({
            model: p.model || adapterInfo(p.type)?.defaultModel,
            messages,
            temperature: opts.temperature ?? 0.8,
            max_tokens: opts.maxTokens ?? 8000,
            ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
          }),
        },
        p.name,
      );
      const j = await res.json();
      text = j.choices?.[0]?.message?.content ?? '';
    } else {
      const res = await proxy('/api/ai/text', p, { provider: providerRef(p), messages, json: opts.json, maxTokens: opts.maxTokens, temperature: opts.temperature }, opts.signal);
      text = (await res.json()).text;
    }
    await recordUsage(p.id, true, Math.round(text.length / 4));
    return text;
  } catch (err) {
    if (!(err instanceof DOMException)) await recordUsage(p.id, false);
    throw err;
  }
}

export interface ImageGenRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  referenceImage?: Blob;
  referenceStrength?: number;
  signal?: AbortSignal;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Generates one real image. Batches should call approvePaid(p, action, n) first so the person is asked once. */
export async function generateImage(p: ProviderConfig, req: ImageGenRequest): Promise<Blob> {
  await approvePaid(p, 'Generate 1 image', 1);
  consumePaid(p);
  try {
    let blob: Blob;
    if (p.type === 'comfyui') {
      blob = await generateComfyImage(p, directBase(p), req);
    } else {
      const res = await proxy(
        '/api/ai/image',
        p,
        {
          provider: providerRef(p),
          prompt: req.prompt,
          negativePrompt: req.negativePrompt,
          width: req.width,
          height: req.height,
          seed: req.seed,
          referenceImage: req.referenceImage && adapterInfo(p.type)?.supports?.referenceImage ? await blobToBase64(req.referenceImage) : undefined,
          referenceStrength: req.referenceStrength,
        },
        req.signal,
      );
      blob = await res.blob();
    }
    if (!blob.type.startsWith('image/') || blob.size < 100) throw new ProviderCallError(`${p.name} did not return a valid image.`);
    await recordUsage(p.id, true, 1);
    return blob;
  } catch (err) {
    if (!(err instanceof DOMException)) await recordUsage(p.id, false);
    throw err;
  }
}

export interface VoiceGenRequest {
  text: string;
  voiceId?: string;
  speed?: number;
  style?: string;
  signal?: AbortSignal;
}

export async function generateVoice(p: ProviderConfig, req: VoiceGenRequest): Promise<Blob> {
  await approvePaid(p, `Generate speech (${req.text.length} characters)`, 1);
  consumePaid(p);
  try {
    let blob: Blob;
    if (p.type === 'openai-compatible-tts') {
      const base = directBase(p);
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (p.apiKey) headers.authorization = `Bearer ${p.apiKey}`;
      const res = await directFetch(
        `${base}/audio/speech`,
        {
          method: 'POST',
          headers,
          signal: req.signal,
          body: JSON.stringify({ model: p.model || 'kokoro', input: req.text, voice: req.voiceId || 'af_heart', speed: req.speed ?? 1, response_format: 'mp3' }),
        },
        p.name,
      );
      blob = await res.blob();
      if (!blob.type.startsWith('audio/')) blob = new Blob([blob], { type: 'audio/mpeg' });
    } else {
      const res = await proxy('/api/ai/voice', p, { provider: providerRef(p), text: req.text, voiceId: req.voiceId, speed: req.speed, style: req.style }, req.signal);
      blob = await res.blob();
    }
    if (blob.size < 200) throw new ProviderCallError(`${p.name} returned empty audio.`);
    await recordUsage(p.id, true, req.text.length);
    return blob;
  } catch (err) {
    if (!(err instanceof DOMException)) await recordUsage(p.id, false);
    throw err;
  }
}

export async function listVoices(p: ProviderConfig): Promise<{ id: string; name: string; info?: string }[]> {
  if (p.type === 'elevenlabs') {
    const res = await proxy('/api/ai/voices', p, { provider: providerRef(p) });
    return (await res.json()).voices;
  }
  if (p.type === 'openai-compatible-tts') {
    try {
      const res = await directFetch(`${directBase(p)}/audio/voices`, {}, p.name);
      const j = await res.json();
      const list: string[] = j.voices ?? j;
      return list.map((v) => ({ id: v, name: v }));
    } catch {
      return [];
    }
  }
  return [];
}

export interface TestOutcome {
  ok: boolean;
  message: string;
  quota?: { used?: number; limit?: number; unit: string; resetsAt?: string };
}

export async function testProviderConnection(p: ProviderConfig): Promise<TestOutcome> {
  try {
    if (p.type === 'comfyui') return await testComfy(directBase(p), p.model);
    if (p.type === 'openai-compatible-text' || p.type === 'openai-compatible-tts') {
      const headers: Record<string, string> = {};
      if (p.apiKey) headers.authorization = `Bearer ${p.apiKey}`;
      const res = await directFetch(`${directBase(p)}/models`, { headers }, p.name);
      const j = await res.json().catch(() => ({}));
      const n = Array.isArray(j.data) ? j.data.length : 0;
      return { ok: true, message: `Reachable. ${n ? `${n} models listed.` : ''}` };
    }
    const res = await proxy('/api/providers/test', p, { provider: providerRef(p) });
    return await res.json();
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function serverStatus(): Promise<{ env: Record<string, boolean>; version: string } | { error: string }> {
  try {
    const res = await fetch('/api/providers/status', { headers: await headersFor() });
    const j = await res.json();
    if (!res.ok) return { error: j.error ?? `HTTP ${res.status}` };
    return j;
  } catch {
    return { error: 'Server unreachable (offline?)' };
  }
}
