import type { Channel, Project, ProviderConfig, Scene, StageId } from '@/types';
import type { ProviderKind } from '@/config/states';
import { adapterInfo } from '@/config/providers';
import { getChannel } from '@/services/storage/channels';
import { getProject, updateProject } from '@/services/storage/projects';
import { getSettings, listProviders } from '@/services/storage/settings';
import { errorMessage, estimateNarrationSeconds, round } from '@/utils';
import { completeText } from './client';
import { extractJson, normalizeCharacters, normalizeConcept, normalizeScene, normalizeSeo, normalizeThumbConcepts } from './parse';
import { charactersMessages, conceptMessages, sceneRegenMessages, scriptMessages, seoMessages, thumbConceptMessages } from './prompts';

export class NoProviderError extends Error {
  constructor(kind: ProviderKind) {
    super(
      kind === 'text'
        ? 'No text AI provider is connected. Add one in Settings → Providers (Gemini, Hugging Face, Groq and OpenRouter have free tiers).'
        : kind === 'image'
          ? 'No image provider is connected. Add one in Settings → Providers (Pollinations works without a key).'
          : 'No voice provider is connected. Add one in Settings → Providers, or upload/record your own narration.',
    );
    this.name = 'NoProviderError';
  }
}

/** Picks the provider the person chose. Without a choice, prefers free/self-hosted ones; paid ones still ask before every batch. */
export async function resolveProvider(kind: ProviderKind, preferredId?: string): Promise<ProviderConfig | undefined> {
  const all = (await listProviders()).filter((p) => p.kind === kind && p.enabled);
  const settings = await getSettings();
  const pref = preferredId ?? (kind === 'text' ? settings.preferredText : kind === 'image' ? settings.preferredImage : settings.preferredVoice);
  const chosen = all.find((p) => p.id === pref);
  if (chosen) return chosen;
  return all.find((p) => adapterInfo(p.type)?.billing !== 'paid') ?? all[0];
}

async function requireText(): Promise<ProviderConfig> {
  const p = await resolveProvider('text');
  if (!p) throw new NoProviderError('text');
  return p;
}

async function setStages(id: string, stages: StageId[], status: Project['stages'][StageId]['status'], error?: string) {
  await updateProject(id, (p) => {
    for (const s of stages) p.stages[s] = { status, error, updatedAt: Date.now() };
  });
}

async function withStages<T>(id: string, stages: StageId[], fn: (p: Project, channel?: Channel) => Promise<T>): Promise<T> {
  const project = await getProject(id);
  if (!project) throw new Error('Project not found');
  const channel = await getChannel(project.channelId);
  await setStages(id, stages, 'running');
  try {
    const r = await fn(project, channel);
    await setStages(id, stages, 'done');
    return r;
  } catch (err) {
    await setStages(id, stages, 'error', errorMessage(err));
    throw err;
  }
}

/** Recomputes scene start/end from narration audio length (when present) or an estimate. */
export function retimeScenes(p: Project): Scene[] {
  let t = 0;
  return p.scenes.map((s, i) => {
    const est = estimateNarrationSeconds(s.narration, p.brief.language, p.voice.speed || 1);
    const auto = Math.max(1.5, s.audioDuration ? s.audioDuration + 0.35 : est + 0.3);
    const duration = round(s.durationLocked ? Math.max(0.5, s.duration) : auto, 2);
    const out = { ...s, number: i + 1, start: round(t, 2), duration, end: round(t + duration, 2) };
    t += duration;
    return out;
  });
}

export async function runConcept(id: string, signal?: AbortSignal) {
  return withStages(id, ['research', 'titles', 'structure', 'hook'], async (p, channel) => {
    const provider = await requireText();
    const raw = await completeText(provider, conceptMessages(p, channel), { json: true, maxTokens: 4000, signal, action: 'Research & concept' });
    const concept = normalizeConcept(extractJson(raw));
    await updateProject(id, (d) => {
      d.concept = concept;
      if (concept.titleIdeas[0] && d.title === d.brief.topic.slice(0, 80)) d.title = concept.titleIdeas[0];
    });
    return concept;
  });
}

export async function runScript(id: string, signal?: AbortSignal) {
  return withStages(id, ['script', 'scenes', 'storyboard', 'prompts', 'sfx'], async (p, channel) => {
    const provider = await requireText();
    const raw = await completeText(provider, scriptMessages(p, channel), {
      json: true,
      maxTokens: Math.min(16000, 1500 + p.brief.sceneCount * 450),
      signal,
      action: 'Write script & scenes',
    });
    const j = extractJson<Record<string, unknown>>(raw);
    const list = Array.isArray(j.scenes) ? (j.scenes as Record<string, unknown>[]) : [];
    if (list.length === 0) throw new Error('The AI returned no scenes. Try again.');
    const scenes = list.map(normalizeScene).filter((s) => s.narration || s.imagePrompt);
    await updateProject(id, (d) => {
      d.script = { hook: String(j.hook ?? scenes[0]?.narration ?? ''), ending: String(j.ending ?? ''), cta: String(j.cta ?? '') };
      d.scenes = scenes;
      d.scenes = retimeScenes(d);
      // A new script invalidates timeline sync; edits stay until the person rebuilds.
      d.stages.edit = { status: d.timelines[d.editMode] ? 'error' : 'pending', error: d.timelines[d.editMode] ? 'Script changed — rebuild the edit.' : undefined };
    });
    return scenes;
  });
}

export async function regenerateScene(id: string, sceneId: string, instruction: string) {
  const p = await getProject(id);
  if (!p) throw new Error('Project not found');
  const scene = p.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error('Scene not found');
  const channel = await getChannel(p.channelId);
  const provider = await requireText();
  const raw = await completeText(provider, sceneRegenMessages(p, scene, instruction, channel), { json: true, maxTokens: 1500, action: `Rewrite scene ${scene.number}` });
  const fresh = normalizeScene(extractJson(raw), scene.number - 1);
  await updateProject(id, (d) => {
    d.scenes = d.scenes.map((s) =>
      s.id === sceneId
        ? { ...fresh, id: s.id, number: s.number, imageAssetId: s.imageAssetId, imageHistory: s.imageHistory, imageStatus: s.imageStatus, audioAssetId: undefined, audioDuration: undefined, transition: s.number === 1 ? s.transition : fresh.transition }
        : s,
    );
    d.scenes = retimeScenes(d);
  });
}

export async function runCharacters(id: string, signal?: AbortSignal) {
  return withStages(id, ['characters'], async (p, channel) => {
    const provider = await requireText();
    const raw = await completeText(provider, charactersMessages(p, channel), { json: true, maxTokens: 2500, signal, action: 'Character references' });
    const found = normalizeCharacters(extractJson(raw));
    await updateProject(id, (d) => {
      const byName = new Map(d.characters.map((c) => [c.name.toLowerCase(), c]));
      for (const c of found) {
        const cur = byName.get(c.name.toLowerCase());
        if (cur) {
          // Fill only empty fields so the person's edits and channel references win.
          for (const k of ['face', 'hair', 'clothing', 'age', 'body', 'features', 'style'] as const) if (!cur[k]) cur[k] = c[k];
        } else d.characters.push(c);
      }
    });
  });
}

export async function runThumbConcepts(id: string, signal?: AbortSignal) {
  return withStages(id, ['thumbConcepts'], async (p, channel) => {
    const provider = await requireText();
    const raw = await completeText(provider, thumbConceptMessages(p, channel), { json: true, maxTokens: 2500, signal, action: 'Thumbnail concepts' });
    const concepts = normalizeThumbConcepts(extractJson(raw));
    if (concepts.length < 3) throw new Error('The AI returned fewer than 3 thumbnail concepts. Try again.');
    await updateProject(id, (d) => {
      d.thumbConcepts = concepts;
    });
  });
}

export async function runSeo(id: string, signal?: AbortSignal) {
  return withStages(id, ['seo'], async (p, channel) => {
    const provider = await requireText();
    const raw = await completeText(provider, seoMessages(p, channel), { json: true, maxTokens: 3500, signal, action: 'SEO package' });
    const seo = normalizeSeo(extractJson(raw));
    await updateProject(id, (d) => {
      if (d.seo) d.seoVersions.unshift({ id: `v${Date.now()}`, createdAt: Date.now(), label: 'Before regeneration', data: d.seo });
      d.seoVersions = d.seoVersions.slice(0, 20);
      d.seo = seo;
    });
  });
}

export const TEXT_STEPS = [
  { id: 'concept', label: 'Research, titles, structure & hook', run: runConcept },
  { id: 'script', label: 'Script, scenes, storyboard & prompts', run: runScript },
  { id: 'characters', label: 'Character references', run: runCharacters },
  { id: 'seo', label: 'SEO package', run: runSeo },
  { id: 'thumbs', label: 'Thumbnail concepts', run: runThumbConcepts },
] as const;
