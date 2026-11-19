import type { ProviderConfig } from '@/types';
import { approvePaid } from '@/services/ai/approval';
import { generateImage, ProviderCallError } from '@/services/ai/client';
import { buildScenePrompt } from '@/services/ai/imagePrompt';
import { resolveProvider, NoProviderError } from '@/services/ai/pipeline';
import { assetUrl, getAssetBlob, saveAsset } from '@/services/storage/assets';
import { getProject, updateProject } from '@/services/storage/projects';
import { getSettings } from '@/services/storage/settings';
import { generationSize, imageDimensions } from '@/services/media/image';
import { errorMessage, isAbort, pad, sleep } from '@/utils';

// Managed scene-image queue. Lives in memory for the open app; nothing is retried or resumed
// automatically after a reload — interrupted scenes are shown and the person decides to resume.

export interface QueueItem {
  key: string;
  projectId: string;
  sceneId: string;
  sceneNumber: number;
  providerId: string;
  status: 'queued' | 'generating' | 'done' | 'failed' | 'cancelled';
  attempts: number;
  error?: string;
  startedAt?: number;
}

export interface QueueSnapshot {
  items: QueueItem[];
  paused: boolean;
  running: number;
  concurrency: number;
  waitingUntil?: number;
}

type Listener = (s: QueueSnapshot) => void;

class ImageQueue {
  private items: QueueItem[] = [];
  private paused = false;
  private running = 0;
  private concurrency = 1;
  private controllers = new Map<string, AbortController>();
  private listeners = new Set<Listener>();
  private waitingUntil?: number;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): QueueSnapshot {
    return { items: [...this.items], paused: this.paused, running: this.running, concurrency: this.concurrency, waitingUntil: this.waitingUntil };
  }

  private emit() {
    const s = this.snapshot();
    this.listeners.forEach((l) => l(s));
  }

  isActive(projectId: string, sceneId: string) {
    return this.items.some((i) => i.projectId === projectId && i.sceneId === sceneId && (i.status === 'queued' || i.status === 'generating'));
  }

  /** Queue scenes. For paid providers the person approves the whole batch once, before anything is sent. */
  async enqueue(projectId: string, sceneIds: string[], providerId?: string) {
    const project = await getProject(projectId);
    if (!project) throw new Error('Project not found');
    const provider = await resolveProvider('image', providerId ?? project.imageSettings.providerId);
    if (!provider) throw new NoProviderError('image');
    const fresh = sceneIds.filter((id) => !this.isActive(projectId, id));
    if (!fresh.length) return;
    await approvePaid(provider, `Generate ${fresh.length} scene image${fresh.length > 1 ? 's' : ''}`, fresh.length);
    this.concurrency = Math.max(1, Math.min(3, (await getSettings()).imageConcurrency || 1));
    for (const sceneId of fresh) {
      const scene = project.scenes.find((s) => s.id === sceneId);
      if (!scene) continue;
      this.items = this.items.filter((i) => !(i.projectId === projectId && i.sceneId === sceneId));
      this.items.push({ key: `${projectId}:${sceneId}`, projectId, sceneId, sceneNumber: scene.number, providerId: provider.id, status: 'queued', attempts: 0 });
    }
    await updateProject(projectId, (p) => {
      for (const s of p.scenes) if (fresh.includes(s.id)) {
        s.imageStatus = 'queued';
        s.imageError = undefined;
      }
      p.stages.images = { status: 'running', updatedAt: Date.now() };
    });
    this.emit();
    this.pump();
  }

  pause() {
    this.paused = true;
    this.emit();
  }

  resume() {
    this.paused = false;
    this.emit();
    this.pump();
  }

  async cancel(projectId?: string) {
    const affected = this.items.filter((i) => (!projectId || i.projectId === projectId) && (i.status === 'queued' || i.status === 'generating'));
    for (const i of affected) {
      i.status = 'cancelled';
      this.controllers.get(i.key)?.abort();
    }
    const byProject = new Map<string, string[]>();
    for (const i of affected) byProject.set(i.projectId, [...(byProject.get(i.projectId) ?? []), i.sceneId]);
    for (const [pid, ids] of byProject)
      await updateProject(pid, (p) => {
        for (const s of p.scenes) if (ids.includes(s.id)) s.imageStatus = s.imageAssetId ? 'done' : 'none';
        p.stages.images = { status: p.scenes.every((s) => s.imageAssetId) ? 'done' : 'pending', updatedAt: Date.now() };
      });
    this.emit();
  }

  clearFinished() {
    this.items = this.items.filter((i) => i.status === 'queued' || i.status === 'generating');
    this.emit();
  }

  private pump() {
    while (!this.paused && this.running < this.concurrency) {
      const next = this.items.find((i) => i.status === 'queued');
      if (!next) break;
      this.running++;
      next.status = 'generating';
      next.startedAt = Date.now();
      this.emit();
      void this.work(next).finally(() => {
        this.running--;
        this.emit();
        this.pump();
      });
    }
  }

  private async work(item: QueueItem) {
    const ctrl = new AbortController();
    this.controllers.set(item.key, ctrl);
    try {
      const project = await getProject(item.projectId);
      const scene = project?.scenes.find((s) => s.id === item.sceneId);
      const provider = (await resolveProvider('image', item.providerId)) as ProviderConfig | undefined;
      if (!project || !scene) throw new Error('Scene was removed');
      if (!provider || provider.id !== item.providerId) throw new Error('The selected image provider was removed or disabled.');
      await updateProject(item.projectId, (p) => {
        const s = p.scenes.find((x) => x.id === item.sceneId);
        if (s) s.imageStatus = 'generating';
      });
      const { positive, negative, seed, reference } = buildScenePrompt(project, scene);
      const size = generationSize(project.brief.aspect, project.imageSettings.quality);
      const refBlob = reference ? await getAssetBlob(reference) : undefined;
      let blob: Blob | undefined;
      for (;;) {
        item.attempts++;
        try {
          blob = await generateImage(provider, {
            prompt: positive,
            negativePrompt: negative,
            width: size.width,
            height: size.height,
            seed,
            referenceImage: refBlob,
            referenceStrength: project.imageSettings.referenceStrength,
            signal: ctrl.signal,
          });
          break;
        } catch (err) {
          // Only transient errors (rate limit / overloaded) are retried, at most 3 tries, while the app stays open.
          const transient = err instanceof ProviderCallError && (err.status === 429 || err.status === 503 || err.status === 504);
          if (!transient || item.attempts >= 3 || ctrl.signal.aborted) throw err;
          const wait = Math.min(60, (err as ProviderCallError).retryAfter ?? 8 * item.attempts) * 1000;
          this.waitingUntil = Date.now() + wait;
          this.emit();
          await sleep(wait, ctrl.signal);
          this.waitingUntil = undefined;
        }
      }
      const dims = await imageDimensions(blob);
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const meta = await saveAsset({
        projectId: item.projectId,
        kind: 'scene-image',
        name: `scene_${pad(scene.number)}.${ext}`,
        blob,
        width: dims.width,
        height: dims.height,
        prompt: positive,
        providerId: provider.id,
        source: provider.name,
      });
      await assetUrl(meta.id);
      await updateProject(item.projectId, (p) => {
        const s = p.scenes.find((x) => x.id === item.sceneId);
        if (!s) return;
        if (s.imageAssetId) s.imageHistory = [s.imageAssetId, ...s.imageHistory.filter((h) => h !== s.imageAssetId)].slice(0, 12);
        s.imageAssetId = meta.id;
        s.imageStatus = 'done';
        s.imageError = undefined;
        if (p.scenes.every((x) => x.imageAssetId)) p.stages.images = { status: 'done', updatedAt: Date.now() };
      });
      item.status = 'done';
    } catch (err) {
      if (item.status === 'cancelled' || isAbort(err)) return;
      item.status = 'failed';
      item.error = errorMessage(err);
      await updateProject(item.projectId, (p) => {
        const s = p.scenes.find((x) => x.id === item.sceneId);
        if (s) {
          s.imageStatus = 'failed';
          s.imageError = item.error;
        }
        p.stages.images = { status: 'error', error: `Scene ${item.sceneNumber}: ${item.error}`, updatedAt: Date.now() };
      });
    } finally {
      this.controllers.delete(item.key);
      this.waitingUntil = undefined;
    }
  }
}

export const imageQueue = new ImageQueue();

/** After a reload, scenes that were queued/generating are marked interrupted (never auto-resumed). */
export async function markInterrupted(projectId: string) {
  const p = await getProject(projectId);
  if (!p) return;
  const stale = p.scenes.filter((s) => (s.imageStatus === 'queued' || s.imageStatus === 'generating') && !imageQueue.isActive(projectId, s.id));
  if (!stale.length) return;
  await updateProject(projectId, (d) => {
    for (const s of d.scenes) if (stale.some((x) => x.id === s.id)) s.imageStatus = 'interrupted';
  });
}
