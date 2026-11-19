import type { Project } from '@/types';
import { TEXT_STEPS, resolveProvider } from '@/services/ai/pipeline';
import { generateImage } from '@/services/ai/client';
import { imageQueue } from '@/services/image-providers/queue';
import { generateAllVoices } from '@/services/voice-providers/voice';
import { buildTimeline } from '@/services/timeline/autoEdit';
import { renderProject } from '@/services/rendering/renderManager';
import { designFromConcept, exportDesign } from '@/services/thumbnail/design';
import { generationSize, imageDimensions } from '@/services/media/image';
import { VISUAL_STYLE_PROMPTS } from '@/config/states';
import { getProject, updateProject } from '@/services/storage/projects';
import { getChannel } from '@/services/storage/channels';
import { saveAsset } from '@/services/storage/assets';
import { errorMessage, isAbort } from '@/utils';

// Full "idea → MP4" orchestrator. Each step uses real providers and real files; steps that cannot
// run (no provider connected) are marked skipped with the reason instead of being faked.

export interface ProductionOptions {
  images: boolean;
  voice: boolean;
  thumbnail: boolean;
  edit: boolean;
  render: boolean;
}

export interface StepLog {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'error';
  message?: string;
}

export interface ProductionRun {
  projectId: string;
  steps: StepLog[];
  running: boolean;
}

type Listener = (r: ProductionRun | null) => void;
let current: ProductionRun | null = null;
let abort: AbortController | null = null;
const listeners = new Set<Listener>();

export function subscribeProduction(fn: Listener) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((l) => l(current ? { ...current, steps: current.steps.map((s) => ({ ...s })) } : null));
}
export function stopProduction() {
  abort?.abort();
  void imageQueue.cancel(current?.projectId);
}

function waitForImages(projectId: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const off = imageQueue.subscribe(() => {
      if (!imageQueue.snapshot().items.some((i) => i.projectId === projectId && (i.status === 'queued' || i.status === 'generating'))) {
        setTimeout(() => off(), 0);
        resolve();
      }
    });
    signal.addEventListener('abort', () => {
      off();
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

async function makeThumbnail(p: Project, signal: AbortSignal) {
  const concept = p.thumbConcepts[0];
  if (!concept) throw new Error('No thumbnail concept available.');
  const provider = await resolveProvider('image', p.imageSettings.providerId);
  if (!provider) throw new Error('No image provider connected.');
  const size = generationSize('16:9', p.imageSettings.quality);
  const style = VISUAL_STYLE_PROMPTS[p.brief.visualStyle];
  const blob = await generateImage(provider, { prompt: `${concept.imagePrompt}. ${style.positive}. YouTube thumbnail artwork, no text`, negativePrompt: style.negative, width: size.width, height: size.height, signal });
  const dims = await imageDimensions(blob);
  const art = await saveAsset({ projectId: p.id, kind: 'thumb-source', name: `thumbnail_art_${concept.id}.png`, blob, ...dims, prompt: concept.imagePrompt, providerId: provider.id, source: provider.name });
  const design = designFromConcept(concept, art.id, await getChannel(p.channelId));
  const png = await exportDesign(design, 'image/png');
  const out = await saveAsset({ projectId: p.id, kind: 'thumbnail', name: 'thumbnail_01.png', blob: png, width: 1280, height: 720, source: 'Thumbnail Studio' });
  await updateProject(p.id, (d) => {
    d.thumbDesigns.unshift(design);
    d.thumbExports.unshift(out.id);
    d.stages.thumbnails = { status: 'done', updatedAt: Date.now() };
  });
}

export async function runFullProduction(projectId: string, opts: ProductionOptions) {
  if (current?.running) throw new Error('A production run is already in progress.');
  abort = new AbortController();
  const signal = abort.signal;
  const steps: StepLog[] = [
    ...TEXT_STEPS.map((s) => ({ id: s.id, label: s.label, status: 'pending' as const })),
    { id: 'images', label: 'Scene images', status: 'pending' },
    { id: 'thumbnail', label: 'Thumbnail design', status: 'pending' },
    { id: 'voice', label: 'Voice-over', status: 'pending' },
    { id: 'edit', label: 'Automatic edit, music, SFX & subtitles', status: 'pending' },
    { id: 'render', label: 'Render MP4', status: 'pending' },
  ];
  current = { projectId, steps, running: true };
  emit();
  const set = (id: string, status: StepLog['status'], message?: string) => {
    const s = steps.find((x) => x.id === id);
    if (s) {
      s.status = status;
      s.message = message;
    }
    emit();
  };
  try {
    for (const step of TEXT_STEPS) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      set(step.id, 'running');
      try {
        await step.run(projectId, signal);
        set(step.id, 'done');
      } catch (err) {
        set(step.id, 'error', errorMessage(err));
        // Concept and script are required for everything after them.
        if (step.id === 'concept' || step.id === 'script') throw err;
      }
    }

    const imageProvider = await resolveProvider('image');
    if (!opts.images) set('images', 'skipped', 'Turned off for this run');
    else if (!imageProvider) set('images', 'skipped', 'No image provider connected (Settings → Providers)');
    else {
      set('images', 'running', `Using ${imageProvider.name}`);
      const p = (await getProject(projectId))!;
      await imageQueue.enqueue(projectId, p.scenes.filter((s) => !s.imageAssetId).map((s) => s.id), imageProvider.id);
      await waitForImages(projectId, signal);
      const after = (await getProject(projectId))!;
      const failed = after.scenes.filter((s) => !s.imageAssetId).length;
      set('images', failed ? 'error' : 'done', failed ? `${failed} scene(s) failed — retry them in the Images tab` : undefined);
    }

    if (!opts.thumbnail) set('thumbnail', 'skipped', 'Turned off for this run');
    else if (!imageProvider) set('thumbnail', 'skipped', 'No image provider connected');
    else {
      set('thumbnail', 'running');
      try {
        await makeThumbnail((await getProject(projectId))!, signal);
        set('thumbnail', 'done');
      } catch (err) {
        if (isAbort(err)) throw err;
        set('thumbnail', 'error', errorMessage(err));
      }
    }

    const voiceProvider = await resolveProvider('voice', (await getProject(projectId))?.voice.providerId);
    if (!opts.voice) set('voice', 'skipped', 'Turned off for this run');
    else if (!voiceProvider) {
      set('voice', 'skipped', 'No voice provider connected — upload or record narration in the Voice tab');
      await updateProject(projectId, (d) => {
        d.stages.voice = { status: 'skipped', error: 'No voice provider connected', updatedAt: Date.now() };
      });
    } else {
      set('voice', 'running', `Using ${voiceProvider.name}`);
      const r = await generateAllVoices(projectId, { onlyMissing: true, signal, onProgress: (d, t) => set('voice', 'running', `${d}/${t} scenes`) });
      set('voice', r.errors.length ? 'error' : 'done', r.errors[0]);
    }

    if (!opts.edit) set('edit', 'skipped', 'Turned off for this run');
    else {
      set('edit', 'running');
      const p = (await getProject(projectId))!;
      const { timeline, notes } = await buildTimeline(p, p.editMode === 'manual' ? 'auto' : p.editMode, await getChannel(p.channelId));
      await updateProject(projectId, (d) => {
        const mode = d.editMode === 'manual' ? 'auto' : d.editMode;
        d.editMode = mode;
        d.timelines[mode] = timeline;
        const at = Date.now();
        d.stages.edit = { status: 'done', updatedAt: at };
        d.stages.music = { status: timeline.music.length ? 'done' : 'skipped', updatedAt: at };
        d.stages.sfx = { status: 'done', updatedAt: at };
        d.stages.subtitles = timeline.captions.length ? { status: 'done', updatedAt: at } : { status: 'skipped', error: 'No narration audio to sync', updatedAt: at };
      });
      set('edit', 'done', notes.join(' '));
    }

    if (!opts.render || !opts.edit) set('render', 'skipped', opts.render ? 'Needs the automatic edit' : 'Turned off — render from the Editor when ready');
    else {
      set('render', 'running');
      await renderProject(projectId);
      set('render', 'done');
    }
    await updateProject(projectId, (d) => {
      d.stages.package = { status: 'done', updatedAt: Date.now() };
    });
  } catch (err) {
    const running = steps.find((s) => s.status === 'running');
    if (running) set(running.id, isAbort(err) ? 'skipped' : 'error', isAbort(err) ? 'Stopped' : errorMessage(err));
    for (const s of steps) if (s.status === 'pending') s.status = 'skipped';
  } finally {
    if (current) current.running = false;
    abort = null;
    emit();
  }
}
