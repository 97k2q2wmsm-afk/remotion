// TEST FIXTURE ONLY — local stand-ins that speak the same protocols as self-hosted providers
// (OpenAI-compatible chat + speech, ComfyUI API), so the full pipeline can be exercised offline.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.MOCK_PORT ?? 8799);
const dir = mkdtempSync(join(tmpdir(), 'mockimg-'));
const sources = ['testsrc2', 'smptehdbars', 'mandelbrot', 'rgbtestsrc', 'cellauto', 'life'];
const images = sources.map((src, i) => {
  const f = join(dir, `img${i}.png`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `${src}=s=768x1344`, '-frames:v', '1', f]);
  return readFileSync(f);
});
const wide = join(dir, 'wide.png');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1344x768', '-frames:v', '1', wide]);
const wideImg = readFileSync(wide);

const LANG_WORDS = 'yerçekimi bir anda kaybolsaydı şehir havaya yükselirdi ve herkes çığlık atardı'.split(' ');
function narration(i, words = 14) {
  return Array.from({ length: words }, (_, k) => LANG_WORDS[(i * 3 + k) % LANG_WORDS.length]).join(' ').replace(/^./, (c) => c.toUpperCase()) + '.';
}

function reply(prompt) {
  if (prompt.includes('Develop the video concept')) {
    return {
      research: 'Gravity keeps everything on Earth. Without it, unattached objects keep their momentum.',
      verifiedFacts: ['Earth rotates at about 1670 km/h at the equator'],
      fictionalElements: ['The 10-second disappearance is hypothetical'],
      factsNote: 'Verify the rotation speed figure.',
      concept: 'A second-person what-if story about ten seconds without gravity.',
      titleIdeas: Array.from({ length: 10 }, (_, i) => `Yerçekimi ${i + 1} saniye yok olsaydı?`),
      structure: [{ part: 'Hook', summary: 'Everything floats' }, { part: 'Climax', summary: 'Gravity returns' }],
      hook: 'Bir anda ayakların yerden kesiliyor.',
    };
  }
  if (prompt.includes('Write the full narration')) {
    const n = Number(/Exactly (\d+) scenes/.exec(prompt)?.[1] ?? 4);
    const cams = ['zoomIn', 'panRight', 'kenBurns', 'pushIn', 'panUp', 'zoomOut'];
    const tr = ['cut', 'dissolve', 'fadeWhite', 'slideLeft', 'zoom', 'blur', 'film'];
    return {
      hook: narration(0),
      scenes: Array.from({ length: n }, (_, i) => ({
        narration: narration(i, 8 + (i % 3) * 3),
        visual: `Sahne ${i + 1}: Kaan havada süzülüyor`,
        imagePrompt: `Kaan floating above an Istanbul street, shot ${i + 1}, wide angle`,
        negativePrompt: 'blurry',
        camera: cams[i % cams.length],
        characters: ['Kaan'],
        environment: 'Istanbul, morning',
        transition: tr[i % tr.length],
        sfx: [i % 2 ? 'whoosh' : 'impact boom'],
        factStatus: 'mixed',
      })),
      ending: 'Ve yerçekimi geri döndü.',
      cta: 'Abone olmayı unutma!',
    };
  }
  if (prompt.includes('recurring on-screen character')) return { characters: [{ name: 'Kaan', face: 'oval face', hair: 'short dark', clothing: 'yellow hoodie', age: '25', body: 'slim', features: 'red backpack', style: '2D cartoon' }] };
  if (prompt.includes('thumbnail concepts'))
    return {
      concepts: ['text-left', 'text-right', 'bottom-bar', 'center-impact'].map((layout, i) => ({
        title: `Concept ${i + 1}`,
        text: ['10 SANİYE', 'HERKES UÇTU', 'YERÇEKİMİ YOK', 'NE OLURDU?'][i],
        composition: 'Big face on one side',
        emotion: 'shock',
        colors: ['#FFD23F', '#FF4F7B'],
        imagePrompt: 'shocked young man floating, city background',
        layout,
      })),
    };
  if (prompt.includes('SEO package'))
    return {
      titles: Array.from({ length: 10 }, (_, i) => `Yerçekimi yok olsaydı #${i + 1}`),
      recommended: ['Yerçekimi yok olsaydı #1', 'Yerçekimi yok olsaydı #2', 'Yerçekimi yok olsaydı #3'],
      description: 'Ya yerçekimi 10 saniye yok olsaydı?\n\nAbone ol!',
      keywords: ['yerçekimi', 'ne olurdu'],
      tags: ['yerçekimi', 'bilim', 'shorts'],
      hashtags: ['#shorts', '#bilim'],
      pinnedComment: 'Sen ne yapardın?',
      cta: 'Abone ol',
      promo: 'Yeni video yayında!',
      chapters: '',
    };
  if (prompt.includes('Rewrite scene')) return { narration: 'Yeniden yazılmış sahne metni burada.', visual: 'Yeni görsel', imagePrompt: 'new prompt', camera: 'zoomOut', transition: 'dissolve' };
  return { ok: true };
}

function wav(seconds) {
  const rate = 24000;
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t);
    b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * (180 + 40 * Math.sin(t * 5)) * t) * env * 9000), 44 + i * 2);
  }
  return b;
}

const prompts = new Map();
let seq = 0;
const stats = { chat: 0, images: 0, speech: 0 };

createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const url = new URL(req.url, 'http://x');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const json = () => JSON.parse(body.toString() || '{}');
  const send = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

  if (url.pathname === '/stats') return send(stats);
  if (url.pathname === '/v1/models') return send({ data: [{ id: 'mock-llm' }] });
  if (url.pathname === '/v1/chat/completions') {
    stats.chat++;
    const msgs = json().messages ?? [];
    const prompt = msgs.map((m) => m.content).join('\n');
    return send({ choices: [{ message: { role: 'assistant', content: '```json\n' + JSON.stringify(reply(prompt)) + '\n```' } }] });
  }
  if (url.pathname === '/v1/audio/speech') {
    stats.speech++;
    const words = String(json().input ?? '').split(/\s+/).length;
    res.writeHead(200, { 'content-type': 'audio/wav' });
    return res.end(wav(Math.max(0.8, words * 0.38)));
  }
  if (url.pathname === '/system_stats') return send({ system: { comfyui_version: 'mock' }, devices: [{ name: 'mock-gpu' }] });
  if (url.pathname === '/object_info/CheckpointLoaderSimple') return send({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [['mock.safetensors']] } } } });
  if (url.pathname === '/upload/image') return send({ name: 'ref.png' });
  if (url.pathname === '/prompt') {
    const g = json().prompt;
    const id = `p${++seq}`;
    const w = g?.['5']?.inputs?.width ?? 768;
    const h = g?.['5']?.inputs?.height ?? 1344;
    prompts.set(id, { done: Date.now() + 300, wide: w > h });
    return send({ prompt_id: id });
  }
  if (url.pathname.startsWith('/history/')) {
    const id = url.pathname.split('/')[2];
    const p = prompts.get(id);
    if (!p || Date.now() < p.done) return send({});
    return send({ [id]: { status: { status_str: 'success' }, outputs: { 9: { images: [{ filename: `${id}.png`, subfolder: '', type: p.wide ? 'wide' : 'output' }] } } } });
  }
  if (url.pathname === '/view') {
    stats.images++;
    const wideReq = url.searchParams.get('type') === 'wide';
    const n = Number(/\d+/.exec(url.searchParams.get('filename') ?? '0')?.[0] ?? 0);
    res.writeHead(200, { 'content-type': 'image/png' });
    return res.end(wideReq ? wideImg : images[n % images.length]);
  }
  send({ error: 'not found' }, 404);
}).listen(PORT, () => console.log(`mock providers on :${PORT}`));
