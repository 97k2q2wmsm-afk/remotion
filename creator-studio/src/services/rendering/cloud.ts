import type { RenderPackage } from './package';
import type { Progress } from './webcodecs';
import { sleep } from '@/utils';

export interface CloudConfig {
  url: string;
  token: string;
}

async function call(cfg: CloudConfig, path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${cfg.url.replace(/\/+$/, '')}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${cfg.token}`, ...(init.headers ?? {}) },
    });
  } catch {
    throw new Error('The cloud render worker is not reachable. Check its URL in Settings → Rendering.');
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(`Render worker: ${j.error ?? `HTTP ${res.status}`}`);
  }
  return res;
}

export async function testWorker(cfg: CloudConfig): Promise<string> {
  const res = await call(cfg, '/health');
  const j = await res.json();
  return j.busy ? `Online — busy, ${j.queued} queued` : 'Online and idle';
}

/** Uploads the package to the worker, starts the job and follows FFmpeg's real progress until the MP4 is ready. */
export async function renderInCloud(cfg: CloudConfig, pkg: RenderPackage, onProgress: (p: Progress & { status?: string }) => void, signal: AbortSignal): Promise<Blob> {
  onProgress({ phase: 'preparing', detail: 'Creating job' });
  const job = await (await call(cfg, '/jobs', { method: 'POST', body: JSON.stringify(pkg.manifest), headers: { 'content-type': 'application/json' } })).json();
  const id: string = job.id;
  const cleanup = () => void call(cfg, `/jobs/${id}`, { method: 'DELETE' }).catch(() => {});
  try {
    let sent = 0;
    const total = [...pkg.files.values()].reduce((a, b) => a + b.size, 0);
    for (const [name, blob] of pkg.files) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await call(cfg, `/jobs/${id}/files/${encodeURIComponent(name)}`, { method: 'PUT', body: blob, signal });
      sent += blob.size;
      onProgress({ phase: 'preparing', ratio: sent / total, detail: `Uploading assets (${Math.round((sent / total) * 100)}%)` });
    }
    await call(cfg, `/jobs/${id}/start`, { method: 'POST', signal });
    for (;;) {
      await sleep(2000, signal);
      const s = await (await call(cfg, `/jobs/${id}`, { signal })).json();
      if (s.status === 'failed') throw new Error(s.error ?? 'Cloud render failed');
      if (s.status === 'completed') break;
      if (s.status === 'waiting') onProgress({ phase: 'preparing', status: 'waiting', detail: `Waiting in queue (position ${s.queuePosition ?? '?'})` });
      else if (s.status === 'rendering') onProgress({ phase: 'rendering', ratio: s.progress, detail: 'Rendering with native FFmpeg' });
      else onProgress({ phase: s.status === 'finalizing' ? 'finalizing' : 'preparing', detail: s.status });
    }
    onProgress({ phase: 'finalizing', detail: 'Downloading MP4' });
    const out = await (await call(cfg, `/jobs/${id}/output`, { signal })).blob();
    return new Blob([out], { type: 'video/mp4' });
  } finally {
    cleanup();
  }
}
