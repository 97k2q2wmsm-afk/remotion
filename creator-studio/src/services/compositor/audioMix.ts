import type { AudioClip, Timeline } from '@/types';
import { getAssetBlob } from '@/services/storage/assets';
import { decodeAudio, peakLevel } from '@/services/media/audio';
import { timelineDuration } from '@/services/timeline/math';

const decoded = new Map<string, Promise<AudioBuffer>>();

export function decodeAsset(id: string): Promise<AudioBuffer> {
  let p = decoded.get(id);
  if (!p) {
    p = (async () => {
      const blob = await getAssetBlob(id);
      if (!blob) throw new Error('An audio file used in the timeline is missing from storage.');
      return decodeAudio(blob);
    })();
    p.catch(() => decoded.delete(id));
    decoded.set(id, p);
  }
  return p;
}

export function forgetDecoded() {
  decoded.clear();
}

/** Merged narration intervals used for music ducking. */
export function narrationIntervals(t: Timeline): [number, number][] {
  const iv = t.narration.map((n) => [n.start, n.start + n.duration] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of iv) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 0.6) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export interface MixResult {
  buffer: AudioBuffer;
  peakBefore: number;
  gainApplied: number;
}

/**
 * Renders the full multi-track mix offline (narration, music with ducking and fades, sound effects).
 * The same buffer feeds the preview player and the on-device encoder.
 */
export async function renderMix(t: Timeline, sampleRate = 44100): Promise<MixResult> {
  const total = Math.max(0.1, timelineDuration(t));
  const OAC = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil(total * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.connect(ctx.destination);

  const place = async (clip: AudioClip, level: number, bus: AudioNode, duck?: [number, number][], duckLevel = 1) => {
    if (clip.start >= total) return;
    const buf = await decodeAsset(clip.assetId);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const playLen = Math.max(0, Math.min(clip.duration, total - clip.start));
    if (clip.loop) {
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = buf.duration;
    } else if (clip.offset >= buf.duration) return;
    const g = ctx.createGain();
    const v = clip.volume * level;
    const s = clip.start;
    const e = s + playLen;
    g.gain.setValueAtTime(clip.fadeIn > 0 ? 0 : v, s);
    if (clip.fadeIn > 0) g.gain.linearRampToValueAtTime(v, s + Math.min(clip.fadeIn, playLen / 2));
    if (duck) {
      for (const [a, b] of duck) {
        if (b < s || a > e) continue;
        const da = Math.max(s + 0.01, a - 0.25);
        const db = Math.min(e - 0.01, b + 0.35);
        g.gain.setValueAtTime(v, da);
        g.gain.linearRampToValueAtTime(v * duckLevel, Math.min(db, da + 0.25));
        g.gain.setValueAtTime(v * duckLevel, Math.max(da + 0.25, db - 0.4));
        g.gain.linearRampToValueAtTime(v, db);
      }
    }
    if (clip.fadeOut > 0) {
      const fo = Math.max(s, e - Math.min(clip.fadeOut, playLen / 2));
      g.gain.setValueAtTime(v * (duck?.some(([a, b]) => fo >= a - 0.25 && fo <= b + 0.35) ? duckLevel : 1), fo);
      g.gain.linearRampToValueAtTime(0, e);
    }
    src.connect(g).connect(bus);
    if (clip.loop) src.start(s, clip.offset % buf.duration, playLen);
    else src.start(s, clip.offset, Math.min(playLen, buf.duration - clip.offset));
  };

  const duck = t.mix.ducking ? narrationIntervals(t) : undefined;
  await Promise.all([
    ...t.narration.map((c) => place(c, t.mix.narration, master)),
    ...t.music.map((c) => place(c, t.mix.music, master, duck, t.mix.duckLevel)),
    ...t.sfx.map((c) => place(c, t.mix.sfx, master)),
  ]);

  const buffer = await ctx.startRendering();
  const peakBefore = peakLevel(buffer);
  let gainApplied = 1;
  if (t.mix.normalize && peakBefore > 0.0001) gainApplied = Math.min(4, 0.93 / peakBefore);
  else if (peakBefore > 1) gainApplied = 0.98 / peakBefore; // always prevent clipping in the export
  if (gainApplied !== 1) {
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= gainApplied;
    }
  }
  return { buffer, peakBefore, gainApplied };
}

export function audioSignature(t: Timeline): string {
  return JSON.stringify([t.narration, t.music, t.sfx, t.mix, t.clips.map((c) => c.duration)]);
}
