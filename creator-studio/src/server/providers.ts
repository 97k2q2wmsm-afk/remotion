import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { adapterInfo } from '@/config/providers';

// Server-side adapters. Every upstream host is fixed per adapter type (no user-supplied URLs are
// fetched here), so the proxy cannot be abused to reach arbitrary hosts.

export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export interface ProviderRef {
  type: string;
  model?: string;
  accountId?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function checkAppToken(req: Request): void {
  const expected = process.env.APP_ACCESS_TOKEN;
  if (!expected) return;
  const got = req.headers.get('x-app-token') ?? '';
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ProviderError('This server requires an app access token. Add it in Settings → Security.', 401);
  }
}

export function resolveKey(type: string, headerKey: string | null): string | undefined {
  const info = adapterInfo(type);
  if (!info) throw new ProviderError(`Unknown provider type "${type}"`, 400);
  if (info.transport !== 'proxy') throw new ProviderError('Self-hosted providers are called directly from the device.', 400);
  const env = info.envKey ? process.env[info.envKey] : undefined;
  return env || headerKey || undefined;
}

export function resolveAccount(type: string, given?: string): string | undefined {
  const info = adapterInfo(type);
  const env = info?.envAccount ? process.env[info.envAccount] : undefined;
  return env || given || undefined;
}

export function configuredEnv(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const name of [
    'GEMINI_API_KEY',
    'HF_TOKEN',
    'GROQ_API_KEY',
    'OPENROUTER_API_KEY',
    'POLLINATIONS_TOKEN',
    'ANTHROPIC_API_KEY',
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    'TOGETHER_API_KEY',
    'ELEVENLABS_API_KEY',
    'APP_ACCESS_TOKEN',
  ]) {
    out[name] = Boolean(process.env[name]);
  }
  return out;
}

function requireKey(key: string | undefined, label: string): string {
  if (!key) throw new ProviderError(`${label} needs an API key. Add it in Settings → Providers or as a server environment variable.`, 400);
  return key;
}

async function upstream(url: string, init: RequestInit, label: string, timeoutMs = 120_000): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProviderError(`${label} could not be reached: ${msg}`, 504);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const text = await res.text();
      try {
        const j = JSON.parse(text);
        detail = j.error?.message ?? j.error ?? j.detail?.message ?? j.detail ?? j.message ?? j.errors?.[0]?.message ?? text;
        if (typeof detail !== 'string') detail = JSON.stringify(detail);
      } catch {
        detail = text;
      }
    } catch {
      /* ignore */
    }
    detail = detail.slice(0, 400);
    const retry = Number(res.headers.get('retry-after')) || undefined;
    const human =
      res.status === 401 || res.status === 403
        ? 'authentication failed (check the API key and its permissions)'
        : res.status === 402
          ? 'free quota or credits exhausted'
          : res.status === 429
            ? 'rate limit or quota reached — wait and retry later'
            : res.status === 503
              ? 'model is loading or temporarily unavailable'
              : `HTTP ${res.status}`;
    throw new ProviderError(`${label}: ${human}${detail ? ` — ${detail}` : ''}`, res.status, retry);
  }
  return res;
}

// ---------------------------------------------------------------- TEXT

const OPENAI_COMPAT_TEXT: Record<string, { url: string; label: string }> = {
  'gemini-text': { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', label: 'Gemini' },
  'hf-text': { url: 'https://router.huggingface.co/v1/chat/completions', label: 'Hugging Face' },
  'groq-text': { url: 'https://api.groq.com/openai/v1/chat/completions', label: 'Groq' },
  'openrouter-text': { url: 'https://openrouter.ai/api/v1/chat/completions', label: 'OpenRouter' },
  'pollinations-text': { url: 'https://text.pollinations.ai/openai', label: 'Pollinations' },
};

export async function generateText(
  ref: ProviderRef,
  key: string | undefined,
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number; temperature?: number },
): Promise<string> {
  const info = adapterInfo(ref.type);
  const model = ref.model || info?.defaultModel;
  if (ref.type === 'anthropic-text') {
    const apiKey = requireKey(key, 'Anthropic');
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const res = await upstream(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 8000,
          temperature: opts.temperature ?? 0.8,
          system: system || undefined,
          messages: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content })),
        }),
      },
      'Anthropic',
      240_000,
    );
    const j = await res.json();
    return (j.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
  }
  const target = OPENAI_COMPAT_TEXT[ref.type];
  if (!target) throw new ProviderError(`Unsupported text provider ${ref.type}`, 400);
  const apiKey = ref.type === 'pollinations-text' ? key : requireKey(key, target.label);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (ref.type === 'openrouter-text') headers['X-Title'] = 'Creator Studio AI';
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.8,
    max_tokens: opts.maxTokens ?? 8000,
  };
  if (opts.json && ref.type !== 'pollinations-text') body.response_format = { type: 'json_object' };
  const res = await upstream(target.url, { method: 'POST', headers, body: JSON.stringify(body) }, target.label, 240_000);
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new ProviderError(`${target.label} returned an empty response.`, 502);
  return content;
}

// ---------------------------------------------------------------- IMAGE

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  referenceImage?: string; // base64 (no data: prefix)
  referenceStrength?: number; // 0..1
}

export interface BinaryResult {
  bytes: ArrayBuffer;
  mime: string;
}

export async function generateImage(ref: ProviderRef, key: string | undefined, req: ImageRequest): Promise<BinaryResult> {
  const info = adapterInfo(ref.type);
  const model = ref.model || info?.defaultModel || '';
  switch (ref.type) {
    case 'pollinations-image': {
      const params = new URLSearchParams({
        width: String(req.width),
        height: String(req.height),
        model,
        nologo: 'true',
        private: 'true',
        enhance: 'false',
      });
      if (req.seed !== undefined) params.set('seed', String(req.seed));
      if (req.negativePrompt) params.set('negative_prompt', req.negativePrompt);
      const headers: Record<string, string> = {};
      if (key) headers.authorization = `Bearer ${key}`;
      const res = await upstream(
        `https://image.pollinations.ai/prompt/${encodeURIComponent(req.prompt.slice(0, 1800))}?${params}`,
        { headers },
        'Pollinations',
        180_000,
      );
      return assertImage(res, 'Pollinations');
    }
    case 'hf-image': {
      const apiKey = requireKey(key, 'Hugging Face');
      const parameters: Record<string, unknown> = { width: req.width, height: req.height };
      if (req.negativePrompt) parameters.negative_prompt = req.negativePrompt;
      if (req.seed !== undefined) parameters.seed = req.seed;
      if (/schnell/i.test(model)) parameters.num_inference_steps = 4;
      const res = await upstream(
        `https://router.huggingface.co/hf-inference/models/${model}`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'image/png' },
          body: JSON.stringify({ inputs: req.prompt, parameters }),
        },
        'Hugging Face',
        180_000,
      );
      return assertImage(res, 'Hugging Face');
    }
    case 'cloudflare-image': {
      const apiKey = requireKey(key, 'Cloudflare');
      const account = resolveAccount(ref.type, ref.accountId);
      if (!account || !/^[a-f0-9]{32}$/i.test(account)) throw new ProviderError('Cloudflare needs a valid 32-character account ID.', 400);
      if (!/^@cf\/[\w.\-/]+$/.test(model)) throw new ProviderError('Cloudflare model id must look like @cf/vendor/model.', 400);
      const isFlux = model.includes('flux');
      const body: Record<string, unknown> = { prompt: req.prompt.slice(0, 2000) };
      if (isFlux) {
        body.steps = 6;
        if (req.seed !== undefined) body.seed = req.seed;
      } else {
        body.width = req.width;
        body.height = req.height;
        body.num_steps = 20;
        if (req.negativePrompt) body.negative_prompt = req.negativePrompt;
        if (req.seed !== undefined) body.seed = req.seed;
        if (req.referenceImage && model.includes('img2img')) {
          body.image_b64 = req.referenceImage;
          body.strength = req.referenceStrength ?? 0.6;
        }
      }
      const res = await upstream(
        `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
        { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) },
        'Cloudflare',
        180_000,
      );
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const j = await res.json();
        const b64 = j.result?.image;
        if (!b64) throw new ProviderError('Cloudflare returned no image.', 502);
        const buf = Buffer.from(b64, 'base64');
        return { bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, mime: sniffImage(buf) };
      }
      return assertImage(res, 'Cloudflare');
    }
    case 'together-image': {
      const apiKey = requireKey(key, 'Together AI');
      const res = await upstream(
        'https://api.together.xyz/v1/images/generations',
        {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt: req.prompt,
            width: Math.round(req.width / 16) * 16,
            height: Math.round(req.height / 16) * 16,
            steps: /schnell/i.test(model) ? 4 : 28,
            n: 1,
            seed: req.seed,
            response_format: 'b64_json',
          }),
        },
        'Together AI',
        180_000,
      );
      const j = await res.json();
      const b64 = j.data?.[0]?.b64_json;
      if (!b64) throw new ProviderError('Together AI returned no image.', 502);
      const buf = Buffer.from(b64, 'base64');
      return { bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, mime: sniffImage(buf) };
    }
    default:
      throw new ProviderError(`Unsupported image provider ${ref.type}`, 400);
  }
}

async function assertImage(res: Response, label: string): Promise<BinaryResult> {
  const bytes = await res.arrayBuffer();
  const mime = sniffImage(Buffer.from(bytes));
  if (!mime.startsWith('image/')) throw new ProviderError(`${label} did not return an image.`, 502);
  return { bytes, mime };
}

function sniffImage(buf: Buffer): string {
  if (buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return 'application/octet-stream';
}

// ---------------------------------------------------------------- VOICE

export interface VoiceRequest {
  text: string;
  voiceId?: string;
  speed?: number;
  style?: string;
}

export async function generateVoice(ref: ProviderRef, key: string | undefined, req: VoiceRequest): Promise<BinaryResult> {
  const info = adapterInfo(ref.type);
  const model = ref.model || info?.defaultModel || '';
  switch (ref.type) {
    case 'elevenlabs': {
      const apiKey = requireKey(key, 'ElevenLabs');
      const voice = req.voiceId || 'JBFqnCBsd6RMkjVDRZzb';
      if (!/^[A-Za-z0-9]{8,40}$/.test(voice)) throw new ProviderError('Invalid ElevenLabs voice id.', 400);
      const res = await upstream(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
          body: JSON.stringify({
            text: req.text,
            model_id: model,
            voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, speed: clampNum(req.speed ?? 1, 0.7, 1.2) },
          }),
        },
        'ElevenLabs',
      );
      return { bytes: await res.arrayBuffer(), mime: 'audio/mpeg' };
    }
    case 'gemini-tts': {
      const apiKey = requireKey(key, 'Gemini');
      if (!/^[\w.\-]+$/.test(model)) throw new ProviderError('Invalid Gemini model id.', 400);
      const style = req.style ? `${req.style}:\n` : '';
      const res = await upstream(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${style}${req.text}` }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voiceId || 'Kore' } } },
            },
          }),
        },
        'Gemini TTS',
      );
      const j = await res.json();
      const part = j.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data: string } }) => p.inlineData);
      if (!part) throw new ProviderError('Gemini TTS returned no audio.', 502);
      const pcm = Buffer.from(part.inlineData.data, 'base64');
      const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? '')?.[1] ?? 24000);
      const wav = pcmToWav(pcm, rate);
      return { bytes: wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer, mime: 'audio/wav' };
    }
    case 'hf-tts': {
      const apiKey = requireKey(key, 'Hugging Face');
      if (!/^[\w.\-]+\/[\w.\-]+$/.test(model)) throw new ProviderError('Invalid model id.', 400);
      const res = await upstream(
        `https://router.huggingface.co/hf-inference/models/${model}`,
        { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ inputs: req.text }) },
        'Hugging Face TTS',
      );
      const mime = res.headers.get('content-type') ?? 'audio/flac';
      if (!mime.startsWith('audio/')) throw new ProviderError('Hugging Face TTS did not return audio.', 502);
      return { bytes: await res.arrayBuffer(), mime };
    }
    default:
      throw new ProviderError(`Unsupported voice provider ${ref.type}`, 400);
  }
}

export async function listVoices(ref: ProviderRef, key: string | undefined): Promise<{ id: string; name: string; info?: string }[]> {
  if (ref.type === 'elevenlabs') {
    const apiKey = requireKey(key, 'ElevenLabs');
    const res = await upstream('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } }, 'ElevenLabs', 30_000);
    const j = await res.json();
    return (j.voices ?? []).map((v: { voice_id: string; name: string; labels?: Record<string, string> }) => ({
      id: v.voice_id,
      name: v.name,
      info: Object.values(v.labels ?? {}).join(', '),
    }));
  }
  return [];
}

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function clampNum(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}

// ---------------------------------------------------------------- TEST

export interface TestResult {
  ok: boolean;
  message: string;
  quota?: { used?: number; limit?: number; unit: string; resetsAt?: string };
}

/** Connection tests use free metadata endpoints only — never a billable generation. */
export async function testProvider(ref: ProviderRef, key: string | undefined): Promise<TestResult> {
  const info = adapterInfo(ref.type);
  if (!info) throw new ProviderError('Unknown provider', 400);
  const keySource = info.envKey && process.env[info.envKey] ? 'server environment' : key ? 'this device' : 'none';
  switch (ref.type) {
    case 'gemini-text':
    case 'gemini-tts': {
      const apiKey = requireKey(key, 'Gemini');
      const res = await upstream('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': apiKey } }, 'Gemini', 20_000);
      const j = await res.json();
      const model = ref.model || info.defaultModel;
      const found = (j.models ?? []).some((m: { name: string }) => m.name === `models/${model}`);
      return { ok: true, message: `Key valid (from ${keySource}). Model ${model} ${found ? 'is available' : 'was not listed — check the model id'}.` };
    }
    case 'hf-text':
    case 'hf-image':
    case 'hf-tts': {
      const apiKey = requireKey(key, 'Hugging Face');
      const res = await upstream('https://huggingface.co/api/whoami-v2', { headers: { authorization: `Bearer ${apiKey}` } }, 'Hugging Face', 20_000);
      const j = await res.json();
      return { ok: true, message: `Token valid for ${j.name ?? 'account'} (from ${keySource}). Remaining monthly credits are shown on huggingface.co/settings/billing.` };
    }
    case 'groq-text': {
      const apiKey = requireKey(key, 'Groq');
      await upstream('https://api.groq.com/openai/v1/models', { headers: { authorization: `Bearer ${apiKey}` } }, 'Groq', 20_000);
      return { ok: true, message: `Key valid (from ${keySource}).` };
    }
    case 'openrouter-text': {
      const apiKey = requireKey(key, 'OpenRouter');
      const res = await upstream('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${apiKey}` } }, 'OpenRouter', 20_000);
      const j = (await res.json()).data ?? {};
      return {
        ok: true,
        message: `Key valid (from ${keySource}).${j.is_free_tier ? ' Free tier account.' : ''}`,
        quota: { used: j.usage, limit: j.limit ?? undefined, unit: 'USD credits' },
      };
    }
    case 'pollinations-text':
    case 'pollinations-image': {
      const url = ref.type === 'pollinations-text' ? 'https://text.pollinations.ai/models' : 'https://image.pollinations.ai/models';
      await upstream(url, {}, 'Pollinations', 20_000);
      return { ok: true, message: 'Service reachable. Anonymous requests are rate limited.' };
    }
    case 'anthropic-text': {
      const apiKey = requireKey(key, 'Anthropic');
      await upstream('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } }, 'Anthropic', 20_000);
      return { ok: true, message: `Key valid (from ${keySource}). Paid usage — each generation will ask for approval.` };
    }
    case 'cloudflare-image': {
      const apiKey = requireKey(key, 'Cloudflare');
      const res = await upstream('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: { authorization: `Bearer ${apiKey}` } }, 'Cloudflare', 20_000);
      const j = await res.json();
      const account = resolveAccount(ref.type, ref.accountId);
      return { ok: true, message: `Token ${j.result?.status ?? 'verified'} (from ${keySource}). ${account ? 'Account ID set.' : 'Account ID missing!'}` };
    }
    case 'together-image': {
      const apiKey = requireKey(key, 'Together AI');
      await upstream('https://api.together.xyz/v1/models', { headers: { authorization: `Bearer ${apiKey}` } }, 'Together AI', 20_000);
      return { ok: true, message: `Key valid (from ${keySource}). Paid usage — approval required per batch.` };
    }
    case 'elevenlabs': {
      const apiKey = requireKey(key, 'ElevenLabs');
      try {
        const res = await upstream('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': apiKey } }, 'ElevenLabs', 20_000);
        const j = await res.json();
        return {
          ok: true,
          message: `Key valid (from ${keySource}). Plan: ${j.tier ?? 'unknown'}.`,
          quota: {
            used: j.character_count,
            limit: j.character_limit,
            unit: 'characters',
            resetsAt: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : undefined,
          },
        };
      } catch (err) {
        if (err instanceof ProviderError && (err.status === 401 || err.status === 403)) {
          await upstream('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } }, 'ElevenLabs', 20_000);
          return { ok: true, message: `Key valid (from ${keySource}). Quota not readable with this key's permissions.` };
        }
        throw err;
      }
    }
    default:
      throw new ProviderError('This provider is tested from the device.', 400);
  }
}
