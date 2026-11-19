import type { AudioClip, CaptionCue } from '@/types';
import { round, uid } from '@/utils';

/**
 * Splits narration into caption cues timed inside the narration audio span.
 * Word times are estimated from character length (no forced alignment), so they are labelled
 * "estimated" in the UI; cue boundaries follow the real audio clip boundaries.
 */
export function cuesForSpan(text: string, start: number, duration: number, maxWords: number): CaptionCue[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length || duration <= 0) return [];
  // Weight = characters + pause bonus after punctuation.
  const weights = words.map((w) => w.length + 1 + (/[.!?…:;]$/.test(w) ? 4 : /[,]$/.test(w) ? 2 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const lead = Math.min(0.12, duration * 0.03);
  const usable = duration - lead * 2;
  let t = start + lead;
  const timed = words.map((w, i) => {
    const d = (weights[i] / total) * usable;
    const r = { text: w, start: round(t, 3), end: round(t + d * 0.92, 3) };
    t += d;
    return r;
  });
  const cues: CaptionCue[] = [];
  let group: typeof timed = [];
  const flush = () => {
    if (!group.length) return;
    cues.push({ id: uid('c'), start: group[0].start, end: group.at(-1)!.end, text: group.map((g) => g.text).join(' '), words: group });
    group = [];
  };
  for (const w of timed) {
    group.push(w);
    const chars = group.reduce((a, g) => a + g.text.length + 1, 0);
    if (group.length >= maxWords || chars > 38 || /[.!?…]$/.test(w.text)) flush();
  }
  flush();
  // Extend each cue to the next start (max 0.4 s) to avoid flicker.
  for (let i = 0; i < cues.length - 1; i++) {
    const gap = cues[i + 1].start - cues[i].end;
    if (gap > 0 && gap < 0.4) cues[i].end = cues[i + 1].start;
  }
  return cues;
}

export function buildCaptions(narration: AudioClip[], texts: Map<string, string>, maxWords: number): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const clip of narration) {
    const text = clip.sceneId ? texts.get(clip.sceneId) : texts.get('__full__');
    if (!text) continue;
    cues.push(...cuesForSpan(text, clip.start, clip.duration, maxWords));
  }
  return cues.sort((a, b) => a.start - b.start);
}

export function captionAt(cues: CaptionCue[], t: number): CaptionCue | undefined {
  // Cues are sorted; binary search for speed during preview/render.
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return c;
  }
  return undefined;
}
