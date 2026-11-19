import type { AudioClip, Channel, EditMode, MotionType, Project, Timeline, TransitionType, VideoClip } from '@/types';
import { DEFAULT_MIX } from '@/config/defaults';
import { ensureMusicLoop, ensureSfx } from '@/services/media/library';
import { sfxKindFor } from '@/services/media/synth';
import { getAssetMeta } from '@/services/storage/assets';
import { estimateNarrationSeconds, round, uid, wordCount } from '@/utils';
import { buildCaptions } from './captions';

interface Preset {
  pad: number; // seconds of picture after narration ends
  lead: number; // narration starts this long after the cut
  intensity: number;
  transitionDuration: number;
  allowed: TransitionType[];
  sceneSfx: boolean;
  opening: boolean;
}

const PRESETS: Record<Exclude<EditMode, 'manual'>, Preset> = {
  auto: { pad: 0.25, lead: 0.1, intensity: 0.85, transitionDuration: 0.5, allowed: ['cut', 'dissolve', 'fadeBlack'], sceneSfx: false, opening: false },
  cinematic: {
    pad: 0.45,
    lead: 0.2,
    intensity: 1.25,
    transitionDuration: 0.8,
    allowed: ['cut', 'dissolve', 'fadeBlack', 'fadeWhite', 'blur', 'zoom', 'slideLeft', 'slideUp', 'film'],
    sceneSfx: true,
    opening: true,
  },
};

const VARIETY: MotionType[] = ['zoomIn', 'panRight', 'kenBurns', 'zoomOut', 'panLeft', 'pushIn', 'panUp', 'pullOut'];

function mapTransition(t: TransitionType, preset: Preset, index: number): TransitionType {
  if (preset.allowed.includes(t)) return t;
  if (t === 'fadeWhite' || t === 'zoom' || t === 'blur' || t === 'film') return index % 3 === 0 ? 'fadeBlack' : 'dissolve';
  if (t === 'slideLeft' || t === 'slideUp') return 'cut';
  return 'dissolve';
}

export interface BuildResult {
  timeline: Timeline;
  notes: string[];
}

/**
 * Builds a complete timeline from real project assets: scene images in order, narration synced to
 * each scene's audio, camera movement, transitions, music bed with ducking, sound effects and captions.
 */
export async function buildTimeline(project: Project, mode: Exclude<EditMode, 'manual'>, channel?: Channel): Promise<BuildResult> {
  const preset = PRESETS[mode];
  const notes: string[] = [];
  const scenes = [...project.scenes].sort((a, b) => a.number - b.number);
  if (!scenes.length) throw new Error('This project has no scenes yet. Generate or write the script first.');

  const clips: VideoClip[] = [];
  const narration: AudioClip[] = [];
  const sfx: AudioClip[] = [];
  const texts = new Map<string, string>();
  const titleFont = channel?.titleFont ?? 'Anton';
  const brand = channel?.brandColors ?? ['#7C5CFF', '#3EA6FF', '#0B0D17'];
  let t = 0;

  const addTitle = (text: string, subtitle: string, duration: number, transition: TransitionType) => {
    clips.push({
      id: uid('v'),
      kind: 'title',
      title: { text, subtitle, background: brand[brand.length - 1] ?? '#0B0D17', color: brand[0] ?? '#FFFFFF', font: titleFont },
      duration,
      motion: 'zoomIn',
      motionIntensity: 0.5,
      transition,
      transitionDuration: 0.6,
    });
    t += duration;
  };

  if (channel?.intro.enabled && channel.intro.text) addTitle(channel.intro.text, channel.intro.subtitle, channel.intro.duration, 'fadeBlack');
  else if (preset.opening && mode === 'cinematic' && project.brief.format === 'standard') addTitle(project.title, '', 2.5, 'fadeBlack');

  // Full narration file (uploaded or single TTS) when scenes lack individual audio.
  const perScene = scenes.every((s) => s.audioAssetId || !s.narration.trim());
  const full = !perScene && project.voice.fullAssetId ? await getAssetMeta(project.voice.fullAssetId) : undefined;
  if (!perScene && !full) notes.push('Some scenes have no narration audio yet; their length is estimated from the text and they will be silent.');

  let fullScale = 1;
  if (full?.duration) {
    const est = scenes.reduce((a, s) => a + estimateNarrationSeconds(s.narration, project.brief.language), 0);
    fullScale = est > 0 ? full.duration / est : 1;
    notes.push('Using one narration file for the whole video: scene cuts are placed by word count, so check them in the timeline.');
    narration.push({ id: uid('n'), assetId: full.id, label: 'Full narration', start: t + preset.lead, offset: 0, duration: full.duration, volume: 1, fadeIn: 0, fadeOut: 0.1 });
    texts.set('__full__', scenes.map((s) => s.narration).join(' '));
  }

  let prevMotion: MotionType | undefined;
  scenes.forEach((s, i) => {
    let dur: number;
    if (full?.duration) {
      dur = Math.max(1.2, estimateNarrationSeconds(s.narration, project.brief.language) * fullScale);
      if (i === 0) dur += preset.lead;
    } else if (s.audioAssetId && s.audioDuration) {
      dur = s.audioDuration + preset.lead + preset.pad;
    } else {
      dur = Math.max(2, estimateNarrationSeconds(s.narration, project.brief.language, project.voice.speed) + preset.pad);
    }
    let motion = s.camera;
    if (motion === prevMotion) motion = VARIETY[(VARIETY.indexOf(motion) + 3 + i) % VARIETY.length];
    prevMotion = motion;
    if (!s.imageAssetId) notes.push(`Scene ${s.number} has no image — it will render as a dark placeholder until you add one.`);
    const transition = i === 0 && clips.length === 0 ? 'fadeBlack' : mapTransition(s.transition, preset, i);
    clips.push({
      id: uid('v'),
      kind: 'image',
      sceneId: s.id,
      assetId: s.imageAssetId,
      duration: round(dur, 3),
      motion,
      motionIntensity: preset.intensity,
      transition,
      transitionDuration: transition === 'cut' ? 0 : preset.transitionDuration,
    });
    if (perScene && s.audioAssetId && s.audioDuration) {
      narration.push({
        id: uid('n'),
        assetId: s.audioAssetId,
        label: `Scene ${s.number}`,
        start: round(t + preset.lead, 3),
        offset: 0,
        duration: s.audioDuration,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0.05,
        sceneId: s.id,
      });
      texts.set(s.id, s.narration);
    }
    t += dur;
  });

  if (channel?.outro.enabled && channel.outro.text) addTitle(channel.outro.text, channel.outro.subtitle, channel.outro.duration, 'fadeBlack');
  const total = t;

  // Sound effects: transition accents (both modes) + scene suggestions (cinematic).
  let acc = 0;
  for (const c of clips) {
    let kind = c.transition === 'fadeWhite' ? 'impact' : c.transition === 'slideLeft' || c.transition === 'slideUp' || c.transition === 'zoom' ? 'whoosh' : undefined;
    if (preset.sceneSfx && c.sceneId) {
      const scene = scenes.find((s) => s.id === c.sceneId);
      const suggested = scene?.sfx.map(sfxKindFor).find(Boolean);
      kind = suggested ?? kind;
    }
    if (kind) {
      const meta = await ensureSfx(kind as Parameters<typeof ensureSfx>[0]);
      const start = Math.max(0, acc - (kind === 'whoosh' ? 0.45 : kind === 'riser' ? (meta.duration ?? 2) - 0.1 : 0));
      sfx.push({ id: uid('x'), assetId: meta.id, label: kind, start: round(start, 3), offset: 0, duration: meta.duration ?? 1, volume: 1, fadeIn: 0, fadeOut: 0.2, sceneId: c.sceneId });
    }
    acc += c.duration;
  }
  if (preset.opening && clips.length > 1) {
    const riser = await ensureSfx('riser');
    sfx.push({ id: uid('x'), assetId: riser.id, label: 'opening riser', start: 0, offset: 0, duration: Math.min(riser.duration ?? 3, clips[0].duration + 0.5), volume: 0.7, fadeIn: 0.5, fadeOut: 0.3 });
  }

  // Music bed.
  const music: AudioClip[] = [];
  if (project.music.source !== 'none') {
    const meta =
      project.music.source === 'library' && project.music.assetId ? await getAssetMeta(project.music.assetId) : await ensureMusicLoop(project.music.mood);
    if (meta) {
      const loop = (meta.duration ?? 0) < total;
      music.push({ id: uid('m'), assetId: meta.id, label: meta.name, start: 0, offset: 0, duration: round(total, 3), volume: 1, fadeIn: DEFAULT_MIX.musicFadeIn, fadeOut: DEFAULT_MIX.musicFadeOut, loop });
    } else notes.push('The selected music file is missing; no music was added.');
  }

  const captionStyle = {
    ...project.captionStyle,
    ...(mode === 'cinematic' ? { font: 'Anton' as const, uppercase: true, animation: 'pop' as const, size: Math.max(project.captionStyle.size, 6) } : {}),
  };
  const timeline: Timeline = {
    version: 1,
    aspect: project.brief.aspect,
    fps: project.render.fps || 30,
    clips,
    narration,
    music,
    sfx,
    captions: buildCaptions(narration, texts, captionStyle.maxWords),
    overlays: [],
    captionStyle,
    mix: { ...DEFAULT_MIX, music: mode === 'cinematic' ? 0.42 : DEFAULT_MIX.music },
    updatedAt: Date.now(),
  };
  if (!narration.length) notes.push('No narration audio found: subtitles cannot be synchronized yet. Add a voice-over in the Voice step.');
  return { timeline, notes };
}

export function rebuildCaptions(project: Project, timeline: Timeline): Timeline {
  const texts = new Map<string, string>();
  for (const s of project.scenes) texts.set(s.id, s.narration);
  texts.set('__full__', project.scenes.map((s) => s.narration).join(' '));
  return { ...timeline, captions: buildCaptions(timeline.narration, texts, timeline.captionStyle.maxWords), updatedAt: Date.now() };
}

export function narrationWords(project: Project) {
  return project.scenes.reduce((a, s) => a + wordCount(s.narration), 0);
}
