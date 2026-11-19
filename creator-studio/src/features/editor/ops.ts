import type { AudioClip, Timeline, VideoClip } from '@/types';
import { clipStarts, timelineDuration } from '@/services/timeline/math';
import { round, uid } from '@/utils';

/**
 * Applies a structural change to the main track and keeps everything that belongs to a scene in sync:
 * scene narration and scene sound effects move with their clip, their captions shift with them,
 * and a music bed that covered the whole video is stretched to the new length.
 */
export function applyMainTrack(old: Timeline, clips: VideoClip[]): Timeline {
  const oldStarts = clipStarts(old);
  const oldTotal = timelineDuration(old);
  const next: Timeline = { ...old, clips };
  const newStarts = clipStarts(next);
  const newTotal = timelineDuration(next);
  const startOfScene = (t: Timeline, starts: number[], sceneId?: string) => {
    if (!sceneId) return undefined;
    const i = t.clips.findIndex((c) => c.sceneId === sceneId);
    return i >= 0 ? starts[i] : undefined;
  };
  const deltas = new Map<string, number>();
  const move = (a: AudioClip): AudioClip => {
    const o = startOfScene(old, oldStarts, a.sceneId);
    const n = startOfScene(next, newStarts, a.sceneId);
    if (o === undefined || n === undefined) return a;
    const d = n - o;
    if (d !== 0) deltas.set(a.id, d);
    return { ...a, start: round(Math.max(0, a.start + d), 3) };
  };
  const narration = old.narration.filter((a) => !a.sceneId || clips.some((c) => c.sceneId === a.sceneId)).map(move);
  const sfx = old.sfx.filter((a) => !a.sceneId || clips.some((c) => c.sceneId === a.sceneId)).map(move);
  // Shift captions that sit inside a moved narration clip.
  const captions = old.captions
    .map((c) => {
      const owner = old.narration.find((n) => c.start >= n.start - 0.01 && c.start < n.start + n.duration);
      if (owner && !narration.some((n) => n.id === owner.id)) return null;
      const d = owner ? deltas.get(owner.id) ?? 0 : 0;
      if (!d) return c;
      return { ...c, start: round(c.start + d, 3), end: round(c.end + d, 3), words: c.words?.map((w) => ({ ...w, start: round(w.start + d, 3), end: round(w.end + d, 3) })) };
    })
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => a.start - b.start);
  const music = old.music.map((m) => (m.start <= 0.01 && m.start + m.duration >= oldTotal - 0.05 ? { ...m, duration: round(newTotal, 3) } : m));
  const overlays = old.overlays.filter((o) => o.start < newTotal);
  return { ...next, narration, sfx, captions, music, overlays, updatedAt: Date.now() };
}

export function moveClip(t: Timeline, from: number, to: number): Timeline {
  if (to < 0 || to >= t.clips.length || from === to) return t;
  const clips = [...t.clips];
  const [c] = clips.splice(from, 1);
  clips.splice(to, 0, c);
  return applyMainTrack(t, clips);
}

export function patchClip(t: Timeline, id: string, patch: Partial<VideoClip>): Timeline {
  const clips = t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c));
  return 'duration' in patch ? applyMainTrack(t, clips) : { ...t, clips, updatedAt: Date.now() };
}

export function removeClip(t: Timeline, id: string): Timeline {
  return applyMainTrack(t, t.clips.filter((c) => c.id !== id));
}

export function duplicateClip(t: Timeline, id: string): Timeline {
  const i = t.clips.findIndex((c) => c.id === id);
  if (i < 0) return t;
  const copy = { ...t.clips[i], id: uid('v'), sceneId: undefined };
  const clips = [...t.clips];
  clips.splice(i + 1, 0, copy);
  return applyMainTrack(t, clips);
}

export function insertClip(t: Timeline, index: number, clip: VideoClip): Timeline {
  const clips = [...t.clips];
  clips.splice(index, 0, clip);
  return applyMainTrack(t, clips);
}

/** Sets every scene clip to exactly fit its narration (lead + voice + tail). */
export function fitToNarration(t: Timeline, lead = 0.1, tail = 0.3): Timeline {
  const clips = t.clips.map((c) => {
    const n = t.narration.find((a) => a.sceneId && a.sceneId === c.sceneId);
    return n ? { ...c, duration: round(n.duration + lead + tail, 3) } : c;
  });
  const next = applyMainTrack(t, clips);
  // Re-anchor narration exactly at clip start + lead.
  const starts = clipStarts(next);
  return {
    ...next,
    narration: next.narration.map((n) => {
      const i = next.clips.findIndex((c) => c.sceneId && c.sceneId === n.sceneId);
      return i >= 0 ? { ...n, start: round(starts[i] + lead, 3) } : n;
    }),
  };
}

type Track = 'narration' | 'music' | 'sfx';
export function patchAudio(t: Timeline, track: Track, id: string, patch: Partial<AudioClip>): Timeline {
  return { ...t, [track]: t[track].map((a) => (a.id === id ? { ...a, ...patch } : a)), updatedAt: Date.now() };
}
export function removeAudio(t: Timeline, track: Track, id: string): Timeline {
  return { ...t, [track]: t[track].filter((a) => a.id !== id), updatedAt: Date.now() };
}
export function findAudio(t: Timeline, id: string): { track: Track; clip: AudioClip } | undefined {
  for (const track of ['narration', 'music', 'sfx'] as const) {
    const clip = t[track].find((a) => a.id === id);
    if (clip) return { track, clip };
  }
  return undefined;
}
