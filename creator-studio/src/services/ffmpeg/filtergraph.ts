// Compiles a render manifest into FFmpeg arguments. Shared by FFmpeg.wasm (browser) and the
// native-FFmpeg cloud render worker. Only type imports and relative .ts imports are allowed here.
import type { MotionKeys } from '../compositor/motion.ts';

export interface ManifestClip {
  file: string;
  imgW: number;
  imgH: number;
  duration: number;
  motion: MotionKeys;
  transition: string; // xfade transition name, or 'cut'
  transitionDuration: number; // effective (already clamped)
}

export interface ManifestAudio {
  file: string;
  track: 'narration' | 'music' | 'sfx';
  start: number;
  offset: number;
  duration: number;
  volume: number; // already multiplied by the track level
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
}

export interface ManifestOverlay {
  file: string; // full-frame transparent PNG
  start: number;
  end: number;
}

export interface RenderManifest {
  version: 1;
  width: number;
  height: number;
  fps: number;
  duration: number;
  videoBitrate: number; // 0 = CRF
  clips: ManifestClip[];
  audio: ManifestAudio[];
  overlays: ManifestOverlay[];
  ducking: { enabled: boolean; level: number };
  normalize: boolean;
  subtitles?: string;
  fontsDir?: string;
}

export interface CompileOptions {
  output: string;
  preset: 'ultrafast' | 'veryfast' | 'medium';
  progress?: boolean; // add -progress pipe:1 (native only)
  supersample?: number;
}

const n = (v: number) => (Math.round(v * 100000) / 100000).toString();

function validate(m: RenderManifest) {
  if (m.version !== 1) throw new Error('Unsupported manifest version');
  const files = [...m.clips.map((c) => c.file), ...m.audio.map((a) => a.file), ...m.overlays.map((o) => o.file), m.subtitles ?? ''];
  for (const f of files) if (f && !/^[\w.\-]+$/.test(f)) throw new Error(`Invalid file name in manifest: ${f}`);
  if (m.fontsDir && !/^[\w.\-]+$/.test(m.fontsDir)) throw new Error('Invalid fonts dir');
  if (!(m.width >= 64 && m.width <= 4096 && m.height >= 64 && m.height <= 4096)) throw new Error('Invalid output size');
  if (!(m.fps >= 12 && m.fps <= 60)) throw new Error('Invalid fps');
  if (!m.clips.length) throw new Error('The timeline has no clips');
  if (!(m.duration > 0 && m.duration < 4 * 3600)) throw new Error('Invalid duration');
}

export function compileFfmpegArgs(m: RenderManifest, opts: CompileOptions): string[] {
  validate(m);
  const ss = Math.max(1, Math.min(2, opts.supersample ?? 1));
  const W = m.width;
  const H = m.height;
  const OW = W * ss;
  const OH = H * ss;
  const args: string[] = ['-hide_banner', '-y'];
  const filters: string[] = [];
  let idx = 0;

  // ---- video segments
  const segLabels: string[] = [];
  const segLens: number[] = [];
  m.clips.forEach((c, i) => {
    const tin = i === 0 ? 0 : c.transition === 'cut' ? 0 : c.transitionDuration;
    const next = m.clips[i + 1];
    const tout = next && next.transition !== 'cut' ? next.transitionDuration : 0;
    const len = c.duration + tin / 2 + tout / 2;
    segLens.push(len);
    args.push('-loop', '1', '-framerate', String(m.fps), '-t', n(len), '-i', c.file);
    const cover = Math.max(W / c.imgW, H / c.imgH);
    const p = `min(1\\,max(0\\,t/${n(len)}))`;
    const e = c.motion.ease ? `(0.5-0.5*cos(PI*${p}))` : p;
    const z = `(${n(c.motion.z0)}+${n(c.motion.z1 - c.motion.z0)}*${e})`;
    const px = `(${n(c.motion.x0)}+${n(c.motion.x1 - c.motion.x0)}*${e})`;
    const py = `(${n(c.motion.y0)}+${n(c.motion.y1 - c.motion.y0)}*${e})`;
    const sw = `max(${OW}\\,trunc(${n(c.imgW * cover * ss)}*${z}/2)*2)`;
    const sh = `max(${OH}\\,trunc(${n(c.imgH * cover * ss)}*${z}/2)*2)`;
    const label = `v${i}`;
    filters.push(
      `[${idx}:v]format=yuv420p,scale=w='${sw}':h='${sh}':eval=frame:flags=bicubic,` +
        `crop=${OW}:${OH}:x='(iw-${OW})/2*(1+${px})':y='(ih-${OH})/2*(1+${py})'` +
        `${ss > 1 ? `,scale=${W}:${H}:flags=area` : ''},setsar=1,fps=${m.fps},settb=AVTB[${label}]`,
    );
    segLabels.push(label);
    idx++;
  });

  // ---- chain with xfade / concat
  let cur = segLabels[0];
  let curLen = segLens[0];
  for (let i = 1; i < segLabels.length; i++) {
    const c = m.clips[i];
    const out = `x${i}`;
    if (c.transition === 'cut' || c.transitionDuration <= 0) {
      filters.push(`[${cur}][${segLabels[i]}]concat=n=2:v=1:a=0[${out}]`);
      curLen += segLens[i];
    } else {
      const d = c.transitionDuration;
      filters.push(`[${cur}][${segLabels[i]}]xfade=transition=${c.transition}:duration=${n(d)}:offset=${n(curLen - d)}[${out}]`);
      curLen += segLens[i] - d;
    }
    cur = out;
  }

  // ---- overlays (text graphics rasterized by the app)
  for (const o of m.overlays) {
    args.push('-loop', '1', '-framerate', String(m.fps), '-t', n(m.duration), '-i', o.file);
    const ol = `o${idx}`;
    const fadeOutStart = Math.max(o.start, o.end - 0.25);
    filters.push(
      `[${idx}:v]format=rgba,fade=t=in:st=${n(o.start)}:d=0.25:alpha=1,fade=t=out:st=${n(fadeOutStart)}:d=0.25:alpha=1[${ol}]`,
      `[${cur}][${ol}]overlay=0:0:enable='between(t\\,${n(o.start)}\\,${n(o.end)})'[${ol}m]`,
    );
    cur = `${ol}m`;
    idx++;
  }

  // ---- subtitles
  if (m.subtitles) {
    filters.push(`[${cur}]ass=${m.subtitles}${m.fontsDir ? `:fontsdir=${m.fontsDir}` : ''}[subbed]`);
    cur = 'subbed';
  }
  filters.push(`[${cur}]format=yuv420p,trim=duration=${n(m.duration)}[vout]`);

  // ---- audio
  args.push('-f', 'lavfi', '-t', n(m.duration), '-i', 'anullsrc=r=48000:cl=stereo');
  const silence = idx++;
  const tracks: Record<ManifestAudio['track'], string[]> = { narration: [], music: [], sfx: [] };
  m.audio.forEach((a, k) => {
    if (a.start >= m.duration) return;
    if (a.loop) args.push('-stream_loop', '-1');
    args.push('-i', a.file);
    const dur = Math.max(0.05, Math.min(a.duration, m.duration - a.start));
    const chain = [
      `atrim=start=${n(a.loop ? 0 : a.offset)}:duration=${n(dur)}`,
      'asetpts=PTS-STARTPTS',
      'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo',
      `volume=${n(a.volume)}`,
    ];
    if (a.fadeIn > 0) chain.push(`afade=t=in:st=0:d=${n(Math.min(a.fadeIn, dur / 2))}`);
    if (a.fadeOut > 0) chain.push(`afade=t=out:st=${n(Math.max(0, dur - a.fadeOut))}:d=${n(Math.min(a.fadeOut, dur / 2))}`);
    const ms = Math.round(a.start * 1000);
    if (ms > 0) chain.push(`adelay=${ms}|${ms}`);
    const label = `a${k}`;
    filters.push(`[${idx}:a]${chain.join(',')}[${label}]`);
    tracks[a.track].push(label);
    idx++;
  });
  const mixTrack = (labels: string[], name: string) => {
    if (!labels.length) return undefined;
    if (labels.length === 1) return labels[0];
    filters.push(`${labels.map((l) => `[${l}]`).join('')}amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0[${name}]`);
    return name;
  };
  const nar = mixTrack(tracks.narration, 'nar');
  let mus = mixTrack(tracks.music, 'mus');
  const sfx = mixTrack(tracks.sfx, 'sfxm');
  const finalInputs: string[] = [`${silence}:a`];
  if (nar && mus && m.ducking.enabled) {
    filters.push(`[${nar}]asplit=2[narout][narsc]`);
    // Ratio chosen so speech pulls music down to roughly the configured duck level.
    const ratio = Math.max(2, Math.min(20, 1 / Math.max(0.05, m.ducking.level)));
    filters.push(`[${mus}][narsc]sidechaincompress=threshold=0.015:ratio=${n(ratio)}:attack=15:release=450:makeup=1[musd]`);
    mus = 'musd';
    finalInputs.push('narout');
  } else if (nar) finalInputs.push(nar);
  if (mus) finalInputs.push(mus);
  if (sfx) finalInputs.push(sfx);
  const post = m.normalize ? 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000' : 'alimiter=limit=0.95';
  filters.push(
    `${finalInputs.map((l) => `[${l}]`).join('')}amix=inputs=${finalInputs.length}:duration=first:dropout_transition=0:normalize=0,${post},atrim=duration=${n(m.duration)}[aout]`,
  );

  args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]');
  args.push('-c:v', 'libx264', '-preset', opts.preset, '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(m.fps));
  if (m.videoBitrate > 0) args.push('-b:v', String(m.videoBitrate), '-maxrate', String(Math.round(m.videoBitrate * 1.5)), '-bufsize', String(m.videoBitrate * 2));
  else args.push('-crf', opts.preset === 'ultrafast' ? '23' : '20');
  args.push('-g', String(m.fps * 2), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', n(m.duration));
  if (opts.progress) args.push('-progress', 'pipe:1', '-nostats');
  args.push(opts.output);
  return args;
}
