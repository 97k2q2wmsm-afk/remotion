import type { Timeline, VideoClip } from '@/types';

export function clipStarts(t: Timeline): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const c of t.clips) {
    out.push(acc);
    acc += c.duration;
  }
  return out;
}

export function timelineDuration(t: Timeline): number {
  return t.clips.reduce((a, c) => a + c.duration, 0);
}

/** Effective transition length into clip i (limited so it never exceeds half of either neighbour). */
export function transitionLength(t: Timeline, i: number): number {
  const c = t.clips[i];
  if (i === 0 || !c || c.transition === 'cut') return 0;
  const prev = t.clips[i - 1];
  return Math.max(0, Math.min(c.transitionDuration, prev.duration / 2, c.duration / 2));
}

export function clipIndexAt(t: Timeline, time: number, starts = clipStarts(t)): number {
  for (let i = starts.length - 1; i >= 0; i--) if (time >= starts[i]) return i;
  return 0;
}

export function cloneTimeline(t: Timeline): Timeline {
  return structuredClone(t);
}

export function isTitle(c: VideoClip) {
  return c.kind === 'title';
}
