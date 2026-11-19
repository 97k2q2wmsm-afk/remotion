import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateImage, generateText, generateVoice, resolveKey, testProvider, ProviderError, checkAppToken } from '@/server/providers';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let respond: (c: Call) => Response;
beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const c = { url: String(url), init };
    calls.push(c);
    return respond(c);
  }) as typeof fetch;
  delete process.env.HF_TOKEN;
  delete process.env.APP_ACCESS_TOKEN;
});
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(200).fill(1)]);

test('server env key wins over device key and is never required from the browser', () => {
  process.env.HF_TOKEN = 'server-secret';
  assert.equal(resolveKey('hf-text', 'device-key'), 'server-secret');
  delete process.env.HF_TOKEN;
  assert.equal(resolveKey('hf-text', 'device-key'), 'device-key');
  assert.throws(() => resolveKey('comfyui', null), ProviderError); // self-hosted never goes through the proxy
  assert.throws(() => resolveKey('evil', null), ProviderError);
});

test('Hugging Face chat uses the router with bearer auth and JSON mode', async () => {
  respond = () => Response.json({ choices: [{ message: { content: '{"ok":1}' } }] });
  const out = await generateText({ type: 'hf-text', model: 'm/x' }, 'k', [{ role: 'user', content: 'hi' }], { json: true });
  assert.equal(out, '{"ok":1}');
  assert.equal(calls[0].url, 'https://router.huggingface.co/v1/chat/completions');
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer k');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)).response_format, { type: 'json_object' });
});

test('Anthropic uses messages API with system prompt separated', async () => {
  respond = () => Response.json({ content: [{ type: 'text', text: 'hello' }] });
  const out = await generateText({ type: 'anthropic-text' }, 'k', [{ role: 'system', content: 'sys' }, { role: 'user', content: 'u' }], {});
  assert.equal(out, 'hello');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.system, 'sys');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'u' }]);
});

test('quota / rate limit errors are explained, not hidden', async () => {
  respond = () => new Response(JSON.stringify({ error: 'You exceeded your monthly credits' }), { status: 402 });
  await assert.rejects(generateText({ type: 'groq-text' }, 'k', [{ role: 'user', content: 'x' }], {}), (e: ProviderError) => e.status === 402 && /quota or credits exhausted/.test(e.message));
  respond = () => new Response('slow down', { status: 429, headers: { 'retry-after': '7' } });
  await assert.rejects(generateImage({ type: 'hf-image' }, 'k', { prompt: 'p', width: 512, height: 512 }), (e: ProviderError) => e.status === 429 && e.retryAfter === 7);
});

test('missing key gives a clear message before any request', async () => {
  respond = () => Response.json({});
  await assert.rejects(generateText({ type: 'gemini-text' }, undefined, [{ role: 'user', content: 'x' }], {}), /needs an API key/);
  assert.equal(calls.length, 0);
});

test('image adapters return real image bytes and reject non-images', async () => {
  respond = () => new Response(png(), { headers: { 'content-type': 'image/png' } });
  const r = await generateImage({ type: 'pollinations-image' }, undefined, { prompt: 'a cat', width: 768, height: 1344, seed: 5 });
  assert.equal(r.mime, 'image/png');
  assert.match(calls[0].url, /^https:\/\/image\.pollinations\.ai\/prompt\/a%20cat\?.*seed=5/);
  respond = () => new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } });
  await assert.rejects(generateImage({ type: 'pollinations-image' }, undefined, { prompt: 'a', width: 512, height: 512 }), /did not return an image/);
  respond = () => Response.json({ result: { image: Buffer.from(png()).toString('base64') } });
  const cf = await generateImage({ type: 'cloudflare-image', accountId: 'a'.repeat(32) }, 'k', { prompt: 'x', width: 512, height: 512 });
  assert.equal(cf.mime, 'image/png');
  await assert.rejects(generateImage({ type: 'cloudflare-image', accountId: '../x' }, 'k', { prompt: 'x', width: 512, height: 512 }), /account ID/);
});

test('Gemini TTS PCM is wrapped into a playable WAV', async () => {
  const pcm = Buffer.alloc(4800);
  respond = () => Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }] });
  const r = await generateVoice({ type: 'gemini-tts' }, 'k', { text: 'Merhaba', voiceId: 'Kore' });
  const b = Buffer.from(r.bytes);
  assert.equal(r.mime, 'audio/wav');
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.readUInt32LE(24), 24000);
  assert.equal(b.length, 44 + 4800);
});

test('connection tests never call generation endpoints', async () => {
  respond = (c) => (c.url.includes('subscription') ? Response.json({ tier: 'free', character_count: 1200, character_limit: 10000 }) : Response.json({ name: 'me' }));
  const el = await testProvider({ type: 'elevenlabs' }, 'k');
  assert.deepEqual([el.quota?.used, el.quota?.limit], [1200, 10000]);
  await testProvider({ type: 'hf-image' }, 'k');
  for (const c of calls) assert.ok(!/text-to-speech|chat\/completions|hf-inference\/models/.test(c.url), c.url);
});

test('app access token is enforced when configured', () => {
  process.env.APP_ACCESS_TOKEN = 'secret';
  assert.throws(() => checkAppToken(new Request('http://x', { headers: { 'x-app-token': 'nope' } })), ProviderError);
  checkAppToken(new Request('http://x', { headers: { 'x-app-token': 'secret' } }));
});
