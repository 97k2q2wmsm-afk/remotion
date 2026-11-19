// Creator Studio AI — cloud render worker.
// A dependency-free Node service that renders a project manifest with native FFmpeg and
// reports real progress (FFmpeg's own out_time vs. total duration).
//
//   WORKER_TOKEN=secret ALLOWED_ORIGIN=https://your-app.vercel.app node --experimental-strip-types render-worker/server.ts
//
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { compileFfmpegArgs, type RenderManifest } from '../src/services/ffmpeg/filtergraph.ts';

const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.WORKER_TOKEN ?? '';
const ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
const ROOT = resolve(process.env.JOBS_DIR ?? join(import.meta.dirname, 'jobs'));
const MAX_FILE = Number(process.env.MAX_FILE_MB ?? 500) * 1024 * 1024;
const KEEP_MS = Number(process.env.KEEP_HOURS ?? 6) * 3600_000;
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const PRESET = (process.env.X264_PRESET ?? 'veryfast') as 'veryfast' | 'medium' | 'ultrafast';

if (!TOKEN && process.env.ALLOW_NO_TOKEN !== '1') {
  console.error('Refusing to start without WORKER_TOKEN (set ALLOW_NO_TOKEN=1 only for local testing).');
  process.exit(1);
}
mkdirSync(ROOT, { recursive: true });

type Status = 'waiting' | 'preparing' | 'processing' | 'rendering' | 'finalizing' | 'completed' | 'failed' | 'cancelled';
interface Job {
  id: string;
  dir: string;
  manifest: RenderManifest;
  expected: Set<string>;
  received: Set<string>;
  status: Status;
  progress?: number; // 0..1 from FFmpeg, only while rendering
  error?: string;
  createdAt: number;
  finishedAt?: number;
  log: string[];
  kill?: () => void;
}

const jobs = new Map<string, Job>();
const queue: string[] = [];
let busy = false;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function authorized(req: IncomingMessage): boolean {
  if (!TOKEN) return true;
  const got = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
  const exp = Buffer.from(TOKEN);
  return got.length === exp.length && timingSafeEqual(got, exp);
}

async function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new Error('Body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

function publicJob(j: Job) {
  return {
    id: j.id,
    status: j.status,
    progress: j.progress,
    error: j.error,
    missingFiles: [...j.expected].filter((f) => !j.received.has(f)),
    queuePosition: j.status === 'waiting' ? queue.indexOf(j.id) + 1 : undefined,
    createdAt: j.createdAt,
    finishedAt: j.finishedAt,
  };
}

function pump() {
  if (busy) return;
  const id = queue.shift();
  if (!id) return;
  const job = jobs.get(id);
  if (!job || job.status !== 'waiting') return pump();
  busy = true;
  void run(job).finally(() => {
    busy = false;
    pump();
  });
}

function run(job: Job): Promise<void> {
  return new Promise((done) => {
    job.status = 'processing';
    let args: string[];
    try {
      args = compileFfmpegArgs(job.manifest, { output: 'final.mp4', preset: PRESET, progress: true, supersample: job.manifest.width <= 1280 ? 2 : 1 });
    } catch (err) {
      job.status = 'failed';
      job.error = (err as Error).message;
      job.finishedAt = Date.now();
      return done();
    }
    job.status = 'rendering';
    job.progress = 0;
    const child = spawn(FFMPEG, args, { cwd: job.dir, stdio: ['ignore', 'pipe', 'pipe'] });
    job.kill = () => child.kill('SIGKILL');
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      const m = /out_time_us=(\d+)/.exec(chunk.split('\n').reverse().find((l) => l.startsWith('out_time_us=')) ?? '');
      if (m) job.progress = Math.min(0.999, Number(m[1]) / 1e6 / job.manifest.duration);
      if (chunk.includes('progress=end')) {
        job.status = 'finalizing';
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c: string) => {
      job.log.push(c);
      if (job.log.length > 200) job.log.shift();
    });
    child.on('close', (code) => {
      job.finishedAt = Date.now();
      if (job.status === 'cancelled') return done();
      if (code === 0 && existsSync(join(job.dir, 'final.mp4'))) {
        job.status = 'completed';
        job.progress = 1;
      } else {
        job.status = 'failed';
        job.error = `FFmpeg exited with code ${code}: ${job.log.join('').slice(-600)}`;
      }
      done();
    });
  });
}

const server = createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', ORIGIN);
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const url = new URL(req.url ?? '/', 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (parts[0] === 'health') return send(res, 200, { ok: true, busy, queued: queue.length });
    if (!authorized(req)) return send(res, 401, { error: 'Invalid worker token' });

    if (req.method === 'POST' && parts.length === 1 && parts[0] === 'jobs') {
      const manifest = JSON.parse((await readBody(req, 5 * 1024 * 1024)).toString('utf8')) as RenderManifest;
      compileFfmpegArgs(manifest, { output: 'final.mp4', preset: PRESET }); // validates
      const id = randomUUID();
      const dir = join(ROOT, id);
      mkdirSync(dir, { recursive: true });
      const expected = new Set<string>([...manifest.clips.map((c) => c.file), ...manifest.audio.map((a) => a.file), ...manifest.overlays.map((o) => o.file)]);
      if (manifest.subtitles) expected.add(manifest.subtitles);
      const job: Job = { id, dir, manifest, expected, received: new Set(), status: 'preparing', createdAt: Date.now(), log: [] };
      jobs.set(id, job);
      return send(res, 201, publicJob(job));
    }
    const job = parts[0] === 'jobs' && parts[1] ? jobs.get(parts[1]) : undefined;
    if (!job) return send(res, 404, { error: 'Job not found (it may have expired)' });

    if (req.method === 'PUT' && parts[2] === 'files' && parts[3]) {
      const name = decodeURIComponent(parts.slice(3).join('/'));
      const isFont = name.startsWith('fonts/') && /^fonts\/[\w.\-]+\.(ttf|otf|woff2?)$/.test(name);
      if (!job.expected.has(name) && !isFont) return send(res, 400, { error: `Unexpected file ${name}` });
      if (job.status !== 'preparing') return send(res, 409, { error: 'Job already started' });
      const target = join(job.dir, name);
      if (isFont) mkdirSync(join(job.dir, 'fonts'), { recursive: true });
      let size = 0;
      await new Promise<void>((ok, fail) => {
        const out = createWriteStream(target);
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_FILE) {
            req.destroy();
            fail(new Error('File too large'));
          }
        });
        req.pipe(out);
        out.on('finish', ok);
        out.on('error', fail);
        req.on('error', fail);
      });
      job.received.add(name);
      return send(res, 200, publicJob(job));
    }
    if (req.method === 'POST' && parts[2] === 'start') {
      const missing = [...job.expected].filter((f) => !job.received.has(f));
      if (missing.length) return send(res, 400, { error: `Missing files: ${missing.slice(0, 5).join(', ')}` });
      if (job.status === 'preparing') {
        job.status = 'waiting';
        queue.push(job.id);
        pump();
      }
      return send(res, 200, publicJob(job));
    }
    if (req.method === 'GET' && parts.length === 2) return send(res, 200, publicJob(job));
    if (req.method === 'GET' && parts[2] === 'output') {
      const file = join(job.dir, 'final.mp4');
      if (job.status !== 'completed' || !existsSync(file)) return send(res, 409, { error: 'Output not ready' });
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': statSync(file).size, 'content-disposition': 'attachment; filename="final.mp4"' });
      return void createReadStream(file).pipe(res);
    }
    if (req.method === 'DELETE' && parts.length === 2) {
      job.status = 'cancelled';
      job.kill?.();
      rmSync(job.dir, { recursive: true, force: true });
      jobs.delete(job.id);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    return send(res, 400, { error: (err as Error).message });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const j of jobs.values())
    if (now - j.createdAt > KEEP_MS && j.status !== 'rendering') {
      rmSync(j.dir, { recursive: true, force: true });
      jobs.delete(j.id);
    }
}, 10 * 60_000).unref();

server.listen(PORT, () => console.log(`Creator Studio render worker on :${PORT} (jobs in ${ROOT})`));
