import type { Project } from '@/types';
import { approvePaid } from '@/services/ai/approval';
import { generateVoice } from '@/services/ai/client';
import { NoProviderError, resolveProvider, retimeScenes } from '@/services/ai/pipeline';
import { audioDuration } from '@/services/media/audio';
import { saveAsset } from '@/services/storage/assets';
import { getProject, updateProject } from '@/services/storage/projects';
import { errorMessage, pad, round } from '@/utils';

function ext(mime: string) {
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'webm';
  return 'audio';
}

function toneStyle(p: Project) {
  return p.brief.tone ? `Read in ${p.brief.language} with a ${p.brief.tone} tone` : `Read naturally in ${p.brief.language}`;
}

export async function attachSceneAudio(projectId: string, sceneId: string, blob: Blob, source: string) {
  const duration = round(await audioDuration(blob), 3);
  const p = await getProject(projectId);
  const scene = p?.scenes.find((s) => s.id === sceneId);
  if (!p || !scene) throw new Error('Scene not found');
  const meta = await saveAsset({ projectId, kind: 'narration', name: `narration_scene_${pad(scene.number)}.${ext(blob.type)}`, blob, duration, source });
  await updateProject(projectId, (d) => {
    const s = d.scenes.find((x) => x.id === sceneId);
    if (s) {
      s.audioAssetId = meta.id;
      s.audioDuration = duration;
    }
    d.scenes = retimeScenes(d);
    if (d.scenes.every((x) => x.audioAssetId)) d.stages.voice = { status: 'done', updatedAt: Date.now() };
  });
  return meta;
}

export async function attachFullNarration(projectId: string, blob: Blob, source: string) {
  const duration = round(await audioDuration(blob), 3);
  const meta = await saveAsset({ projectId, kind: 'narration', name: `narration_full.${ext(blob.type)}`, blob, duration, source });
  await updateProject(projectId, (d) => {
    d.voice.fullAssetId = meta.id;
    d.stages.voice = { status: 'done', updatedAt: Date.now() };
  });
  return meta;
}

export async function generateSceneVoice(projectId: string, sceneId: string, signal?: AbortSignal) {
  const p = await getProject(projectId);
  const scene = p?.scenes.find((s) => s.id === sceneId);
  if (!p || !scene) throw new Error('Scene not found');
  if (!scene.narration.trim()) throw new Error(`Scene ${scene.number} has no narration text.`);
  const provider = await resolveProvider('voice', p.voice.providerId);
  if (!provider) throw new NoProviderError('voice');
  const blob = await generateVoice(provider, { text: scene.narration, voiceId: p.voice.voiceId, speed: p.voice.speed, style: toneStyle(p), signal });
  return attachSceneAudio(projectId, sceneId, blob, provider.name);
}

/** Generates narration scene by scene (exact sync). Paid providers are approved once for the whole batch. */
export async function generateAllVoices(projectId: string, opts: { onlyMissing?: boolean; signal?: AbortSignal; onProgress?: (done: number, total: number, error?: string) => void } = {}) {
  const p = await getProject(projectId);
  if (!p) throw new Error('Project not found');
  const provider = await resolveProvider('voice', p.voice.providerId);
  if (!provider) throw new NoProviderError('voice');
  const todo = p.scenes.filter((s) => s.narration.trim() && (!opts.onlyMissing || !s.audioAssetId));
  await approvePaid(provider, `Generate narration for ${todo.length} scenes`, todo.length);
  await updateProject(projectId, (d) => {
    d.stages.voice = { status: 'running', updatedAt: Date.now() };
  });
  let done = 0;
  const errors: string[] = [];
  for (const s of todo) {
    if (opts.signal?.aborted) break;
    try {
      await generateSceneVoice(projectId, s.id, opts.signal);
    } catch (err) {
      if (opts.signal?.aborted) break;
      errors.push(`Scene ${s.number}: ${errorMessage(err)}`);
      opts.onProgress?.(done, todo.length, errors.at(-1));
      // Authentication or quota failures will fail every scene — stop instead of burning requests.
      if (/authentication|quota|credits|402|401|403/i.test(errorMessage(err))) break;
      continue;
    }
    done++;
    opts.onProgress?.(done, todo.length);
  }
  await updateProject(projectId, (d) => {
    const complete = d.scenes.every((x) => x.audioAssetId || !x.narration.trim());
    d.stages.voice = errors.length
      ? { status: 'error', error: errors.join(' · ').slice(0, 500), updatedAt: Date.now() }
      : { status: complete ? 'done' : 'pending', updatedAt: Date.now() };
  });
  return { done, errors };
}
