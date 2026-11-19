import type { Project, RenderEngine, RenderRecord, RenderSettings, RenderStatus, Timeline } from '@/types';
import { getProject, updateProject } from '@/services/storage/projects';
import { saveAsset } from '@/services/storage/assets';
import { getSettings } from '@/services/storage/settings';
import { timelineDuration } from '@/services/timeline/math';
import { errorMessage, isAbort, slugify, uid } from '@/utils';
import { buildRenderPackage } from './package';
import { renderWithWebCodecs, webCodecsSupport, type Progress } from './webcodecs';
import { muxAudioWithFfmpegWasm, renderWithFfmpegWasm } from './ffmpegWasm';
import { renderInCloud } from './cloud';

export interface ActiveRender {
  projectId: string;
  recordId: string;
  engine: Exclude<RenderEngine, 'auto'>;
  status: RenderStatus;
  ratio?: number;
  detail?: string;
  startedAt: number;
}

type Listener = (r: ActiveRender | null) => void;
let active: ActiveRender | null = null;
let controller: AbortController | null = null;
const listeners = new Set<Listener>();

export function subscribeRender(fn: Listener) {
  listeners.add(fn);
  fn(active);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((l) => l(active ? { ...active } : null));
}

export function cancelRender() {
  controller?.abort();
}

export async function chooseEngine(t: Timeline, settings: RenderSettings): Promise<{ engine: Exclude<RenderEngine, 'auto'>; reason: string }> {
  if (settings.engine !== 'auto') return { engine: settings.engine, reason: 'Selected in render settings' };
  const app = await getSettings();
  const long = timelineDuration(t) > 240;
  if (long && app.cloudWorkerUrl) return { engine: 'cloud', reason: 'Long video: using your cloud render worker' };
  const wc = await webCodecsSupport(t.aspect, settings.resolution);
  if (wc.video) return { engine: 'webcodecs', reason: wc.audio ? 'On-device hardware encoder' : 'On-device video encoder + FFmpeg.wasm for audio' };
  return { engine: 'ffmpeg-wasm', reason: 'No WebCodecs encoder in this browser' };
}

async function patchRecord(projectId: string, id: string, patch: Partial<RenderRecord>) {
  await updateProject(projectId, (p) => {
    p.renders = p.renders.map((r) => (r.id === id ? { ...r, ...patch } : r));
  });
}

/** Renders the project's active timeline to a real MP4 and stores it with the project. */
export async function renderProject(projectId: string): Promise<string> {
  if (active) throw new Error('A render is already running. Wait for it to finish or cancel it.');
  const project = (await getProject(projectId)) as Project;
  const t = project.timelines[project.editMode];
  if (!t || !t.clips.length) throw new Error('Create the edit (timeline) before rendering.');
  const settings = project.render;
  const { engine } = await chooseEngine(t, settings);
  const app = await getSettings();
  if (engine === 'cloud' && (!app.cloudWorkerUrl || !app.cloudWorkerToken)) throw new Error('Set the cloud render worker URL and token in Settings → Rendering.');
  if (settings.resolution === '2160p' && engine !== 'cloud') {
    const wc = await webCodecsSupport(t.aspect, '2160p');
    if (engine !== 'webcodecs' || !wc.video) throw new Error('4K is only available on the cloud worker or devices whose encoder supports 4K.');
  }

  const record: RenderRecord = { id: uid('r'), engine, resolution: settings.resolution, status: 'preparing', startedAt: Date.now(), duration: timelineDuration(t) };
  await updateProject(projectId, (p) => {
    p.renders.unshift(record);
    p.renders = p.renders.slice(0, 20);
    p.stages.render = { status: 'running', updatedAt: Date.now() };
  });
  controller = new AbortController();
  const signal = controller.signal;
  active = { projectId, recordId: record.id, engine, status: 'preparing', startedAt: record.startedAt };
  emit();
  const onProgress = (p: Progress & { status?: string }) => {
    if (!active) return;
    active.status = p.status === 'waiting' ? 'waiting' : p.phase;
    active.ratio = p.ratio;
    active.detail = p.detail;
    emit();
  };
  try {
    let mp4: Blob;
    if (engine === 'webcodecs') {
      const r = await renderWithWebCodecs(t, settings.resolution, settings.videoBitrate, onProgress, signal);
      mp4 = r.separateAudio ? await muxAudioWithFfmpegWasm(r.mp4, r.separateAudio, onProgress) : r.mp4;
    } else {
      onProgress({ phase: 'preparing', detail: 'Packaging assets' });
      const pkg = await buildRenderPackage(project, t, settings.resolution, settings.videoBitrate);
      mp4 =
        engine === 'cloud'
          ? await renderInCloud({ url: app.cloudWorkerUrl!, token: app.cloudWorkerToken! }, pkg, onProgress, signal)
          : await renderWithFfmpegWasm(pkg, onProgress, signal);
    }
    onProgress({ phase: 'finalizing', detail: 'Saving video to the project' });
    const meta = await saveAsset({ projectId, kind: 'video', name: `${slugify(project.title)}_${settings.resolution}.mp4`, blob: mp4, duration: timelineDuration(t), source: engine });
    await patchRecord(projectId, record.id, { status: 'completed', finishedAt: Date.now(), outputAssetId: meta.id, sizeBytes: mp4.size });
    await updateProject(projectId, (p) => {
      p.finalVideoAssetId = meta.id;
      p.stages.render = { status: 'done', updatedAt: Date.now() };
    });
    return meta.id;
  } catch (err) {
    const cancelled = isAbort(err) || signal.aborted;
    await patchRecord(projectId, record.id, { status: cancelled ? 'cancelled' : 'failed', finishedAt: Date.now(), error: cancelled ? undefined : errorMessage(err) });
    await updateProject(projectId, (p) => {
      p.stages.render = cancelled ? { status: 'pending' } : { status: 'error', error: errorMessage(err), updatedAt: Date.now() };
    });
    throw cancelled ? new DOMException('Render cancelled', 'AbortError') : err;
  } finally {
    active = null;
    controller = null;
    emit();
  }
}
