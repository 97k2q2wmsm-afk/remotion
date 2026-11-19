// End-to-end: iPhone-11-sized viewport, real production build, self-hosted stand-in providers.
// Usage: node tests/e2e/full-flow.mjs [baseUrl] [mockUrl] [outDir]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const JSZip = createRequire(import.meta.url)('jszip');

const BASE = process.argv[2] ?? 'http://localhost:3000';
const MOCK = process.argv[3] ?? 'http://localhost:8799';
const OUT = process.argv[4] ?? '/tmp/cs-e2e';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const fail = (m) => {
  throw new Error(m);
};

const browser = await chromium.launch();
process.on('unhandledRejection', async (e) => { console.error('FAILED:', e.message.split('\n')[0]); try { await page.screenshot({ path: join(OUT, 'failure.png'), timeout: 10000 }); } catch {} process.exit(1); });
const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = async (name) => {
  try {
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false, timeout: 60000 });
  } catch (e) {
    log('screenshot skipped', name, e.message.split('\n')[0]);
  }
};
// Center the element first so the fixed bottom navigation never covers it (as a person would scroll).
const tap = async (loc) => {
  try {
    await loc.evaluate((e) => e.scrollIntoView({ block: 'center' }), undefined, { timeout: 30000 });
    await loc.click({ timeout: 30000 });
  } catch (e) {
    await page.screenshot({ path: join(OUT, 'failure.png'), timeout: 10000 }).catch(() => {});
    writeFileSync(join(OUT, 'failure.html'), await page.content());
    throw e;
  }
};
const noOverflow = async (where) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 414) fail(`Horizontal overflow on ${where}: ${w}px`);
};

// 1. Dashboard
await page.goto(BASE);
await page.getByText('IDEA').first().waitFor();
await noOverflow('dashboard');
await shot('01-dashboard');
log('dashboard ok');

// 2. Providers via Settings UI
async function addProvider(kindLabel, catalogName, fields) {
  await page.goto(`${BASE}/settings`);
  await page.getByText('Voice (TTS)', { exact: true }).waitFor();
  const section = page.locator('h2', { hasText: kindLabel }).locator('..');
  await tap(section.getByRole('button', { name: 'Add' }));
  await page.getByRole('dialog').getByText(catalogName, { exact: false }).first().click();
  const dlg = page.getByRole('dialog');
  for (const [label, value] of Object.entries(fields)) await dlg.getByLabel(label, { exact: false }).fill(value);
  await tap(dlg.getByRole('button', { name: 'Save & test' }));
  await page.getByText(/Reachable|ComfyUI mock/).first().waitFor({ timeout: 15000 });
}
await addProvider('Text / script AI', 'Self-hosted (Ollama', { 'Base URL': `${MOCK}/v1`, Model: 'mock-llm' });
await addProvider('Image generation', 'ComfyUI', { 'ComfyUI URL': MOCK, 'Checkpoint file': 'mock.safetensors' });
await addProvider('Voice (TTS)', 'Self-hosted TTS', { 'Base URL': `${MOCK}/v1`, Model: 'kokoro' });
await noOverflow('settings');
await shot('02-settings');
log('providers configured');

// 3. Create a video with full production + render
await page.goto(`${BASE}/create`);
await page.getByPlaceholder('What if gravity').fill('Yerçekimi 10 saniyeliğine yok olsaydı ne olurdu?');
await page.getByLabel('Number of scenes').fill('4');
await tap(page.getByText('Render the MP4 at the end'));
await noOverflow('create');
await shot('03-create');
await tap(page.getByRole('button', { name: 'Produce my video' }));
await page.waitForURL(/\/project\?id=/);
const projectId = new URL(page.url()).searchParams.get('id');
log('project', projectId);
await page.getByText('Producing your video').waitFor({ timeout: 20000 });
await shot('04-producing');
await page.getByText('Production run finished').waitFor({ timeout: 420000 });
await shot('05-produced');
const stepErrors = await page.locator('li .text-danger').allTextContents();
if (stepErrors.length) fail(`Production step errors: ${stepErrors.join(' | ')}`);
log('production run finished');

// 4. Export center: MP4 present, download and probe it
await page.goto(`${BASE}/project?id=${projectId}&tab=export`);
await page.getByRole('button', { name: 'Download MP4' }).waitFor({ timeout: 20000 });
await noOverflow('export');
await shot('06-export');
let [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download MP4' }).click()]);
const mp4a = join(OUT, 'auto.mp4');
await dl.saveAs(mp4a);
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height:format=duration', '-of', 'json', f], { encoding: 'utf8' }));
const p1 = probe(mp4a);
log('auto MP4', JSON.stringify(p1));
if (!p1.streams.some((s) => s.codec_name === 'h264') || !p1.streams.some((s) => s.codec_name === 'aac')) fail('MP4 missing h264/aac');

// 5. ZIP package
[dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: /Full ZIP package/ }).click()]);
const zipPath = join(OUT, 'package.zip');
await dl.saveAs(zipPath);
const zip = await JSZip.loadAsync((await import('node:fs')).readFileSync(zipPath));
const folders = ['SCRIPT', 'STORYBOARD', 'IMAGES', 'THUMBNAILS', 'AUDIO', 'SUBTITLES', 'SEO', 'EDIT_PLAN', 'FINAL_VIDEO'];
const names = Object.keys(zip.files);
for (const f of folders) if (!names.some((n) => n.startsWith(`VIDEO_PROJECT/${f}/`))) fail(`ZIP missing ${f}`);
if (!names.some((n) => /IMAGES\/scene_001\.png$/.test(n))) fail('ZIP missing scene_001.png');
if (!names.some((n) => /FINAL_VIDEO\/.*\.mp4$/.test(n))) fail('ZIP missing final mp4');
writeFileSync(join(OUT, 'zip-listing.txt'), names.join('\n'));
log('zip ok', names.length, 'entries');

// 6. Reload: project survives
await page.reload();
await page.getByRole('button', { name: 'Download MP4' }).waitFor({ timeout: 20000 });
log('reload persistence ok');

// 7. Manual edit in the editor, then re-render with FFmpeg.wasm
await page.goto(`${BASE}/editor?project=${projectId}`);
await page.getByText('CREATE MY VIDEO AUTOMATICALLY').waitFor();
await tap(page.getByRole('button', { name: /Manual Edit/ }));
await tap(page.getByRole('button', { name: 'Clip 2' }));
await tap(page.getByRole('button', { name: 'Move left' }));
await tap(page.getByRole('button', { name: 'Increase Duration (s)' }));
await tap(page.getByRole('button', { name: 'Text & transitions' }));
await tap(page.getByRole('button', { name: /Add text at/ }));
await tap(page.getByRole('button', { name: 'QC & Render' }));
await tap(page.getByRole('button', { name: 'Run checks' }));
await page.getByText('Missing images:').waitFor({ timeout: 60000 });
await noOverflow('editor');
await shot('07-editor');
await page.locator('select').filter({ hasText: 'Automatic' }).first().selectOption('ffmpeg-wasm');
await tap(page.getByRole('button', { name: /Render MP4 \(/ }));
await page.getByText('Your MP4 is ready!').waitFor({ timeout: 600000 });
await shot('08-rendered-wasm');
[dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download MP4' }).last().click()]);
const mp4b = join(OUT, 'manual-wasm.mp4');
await dl.saveAs(mp4b);
const p2 = probe(mp4b);
log('manual/ffmpeg.wasm MP4', JSON.stringify(p2));
if (!p2.streams.some((s) => s.codec_name === 'h264') || !p2.streams.some((s) => s.codec_name === 'aac')) fail('wasm MP4 missing h264/aac');

// 8. Thumbnail + SEO pages render
await page.goto(`${BASE}/thumbnails?project=${projectId}`);
await page.getByText('Concepts').first().waitFor();
await noOverflow('thumbnails');
await shot('09-thumbnails');
await page.goto(`${BASE}/seo?project=${projectId}`);
await page.getByText('Copy complete package').waitFor();
await noOverflow('seo');
await shot('10-seo');

const stats = await (await fetch(`${MOCK}/stats`)).json();
log('provider calls', JSON.stringify(stats));
const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
if (real.length) log('console errors:', real.slice(0, 10));
await browser.close();
log('E2E PASSED');
