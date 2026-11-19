import type { Project, RenderResolution, Timeline } from '@/types';
import { XFADE, motionKeys } from '@/services/compositor/motion';
import { Compositor, drawOverlay, loadFonts } from '@/services/compositor/compositor';
import type { RenderManifest } from '@/services/ffmpeg/filtergraph';
import { getAssetBlob, getAssetMeta } from '@/services/storage/assets';
import { imageDimensions, canvasToBlob } from '@/services/media/image';
import { toAss } from '@/services/export/subtitles';
import { timelineDuration, transitionLength } from '@/services/timeline/math';
import { aspectSize, pad } from '@/utils';

export interface RenderPackage {
  manifest: RenderManifest;
  files: Map<string, Blob>;
}

const FONT_FILES = ['Anton-latin.woff2', 'Anton-latin-ext.woff2', 'Montserrat-latin.woff2', 'Montserrat-latin-ext.woff2', 'Cinzel.woff2'];

function extOf(mime: string, fallback: string) {
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  return fallback;
}

/** Collects every real asset the timeline uses into an FFmpeg manifest (used by FFmpeg.wasm and the cloud worker). */
export async function buildRenderPackage(project: Project, t: Timeline, resolution: RenderResolution, bitrate = 0): Promise<RenderPackage> {
  const { width, height } = aspectSize(t.aspect, resolution);
  const files = new Map<string, Blob>();
  const total = timelineDuration(t);
  await loadFonts();

  // Title cards and missing images are rasterized with the same compositor used for preview.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const comp = new Compositor(ctx, t, width, height);

  const clips: RenderManifest['clips'] = [];
  for (let i = 0; i < t.clips.length; i++) {
    const c = t.clips[i];
    let file: string;
    let dims: { width: number; height: number };
    const blob = c.kind === 'image' && c.assetId ? await getAssetBlob(c.assetId) : undefined;
    if (blob) {
      const meta = await getAssetMeta(c.assetId!);
      file = `clip_${pad(i)}.${extOf(blob.type, 'png')}`;
      dims = meta?.width && meta.height ? { width: meta.width, height: meta.height } : await imageDimensions(blob);
      files.set(file, blob);
    } else {
      ctx.clearRect(0, 0, width, height);
      if (c.kind === 'title') comp.drawTitle(ctx, c, 0);
      else {
        ctx.fillStyle = '#0d0f18';
        ctx.fillRect(0, 0, width, height);
      }
      file = `clip_${pad(i)}.png`;
      files.set(file, await canvasToBlob(canvas));
      dims = { width, height };
    }
    const d = transitionLength(t, i);
    clips.push({
      file,
      imgW: dims.width,
      imgH: dims.height,
      duration: c.duration,
      motion: motionKeys(c.kind === 'title' ? 'zoomIn' : c.motion, c.kind === 'title' ? 0.4 : c.motionIntensity),
      transition: i === 0 || d <= 0 ? 'cut' : XFADE[c.transition],
      transitionDuration: d,
    });
  }

  const audio: RenderManifest['audio'] = [];
  const tracks = [
    ['narration', t.narration, t.mix.narration],
    ['music', t.music, t.mix.music],
    ['sfx', t.sfx, t.mix.sfx],
  ] as const;
  const audioNames = new Map<string, string>();
  for (const [track, list, level] of tracks) {
    for (const a of list) {
      let name = audioNames.get(a.assetId);
      if (!name) {
        const blob = await getAssetBlob(a.assetId);
        if (!blob) throw new Error(`Audio "${a.label}" is missing from storage.`);
        name = `audio_${pad(audioNames.size)}.${extOf(blob.type, 'audio')}`;
        audioNames.set(a.assetId, name);
        files.set(name, blob);
      }
      audio.push({ file: name, track, start: a.start, offset: a.offset, duration: a.duration, volume: a.volume * level, fadeIn: a.fadeIn, fadeOut: a.fadeOut, loop: Boolean(a.loop) });
    }
  }

  // Overlays rasterized to transparent full-frame PNGs.
  const overlays: RenderManifest['overlays'] = [];
  for (const [k, o] of t.overlays.entries()) {
    const oc = document.createElement('canvas');
    oc.width = width;
    oc.height = height;
    const octx = oc.getContext('2d')!;
    // Full opacity frame; FFmpeg applies the same 0.25 s fades as the preview.
    drawOverlay(octx, { ...o, start: -1, end: 1e9 }, width, height, 0);
    const file = `overlay_${pad(k)}.png`;
    files.set(file, await canvasToBlob(oc));
    overlays.push({ file, start: o.start, end: o.end });
  }

  let subtitles: string | undefined;
  let fontsDir: string | undefined;
  if (t.captionStyle.enabled && t.captions.length) {
    subtitles = 'captions.ass';
    files.set(subtitles, new Blob([toAss(t.captions, t.captionStyle, width, height)], { type: 'text/plain' }));
    fontsDir = 'fonts';
    for (const f of FONT_FILES) {
      try {
        const res = await fetch(`/fonts/${f}`);
        if (res.ok) files.set(`fonts/${f}`, await res.blob());
      } catch {
        /* offline: libass falls back to a system font */
      }
    }
  }

  return {
    manifest: {
      version: 1,
      width,
      height,
      fps: t.fps,
      duration: Math.round(total * 1000) / 1000,
      videoBitrate: bitrate,
      clips,
      audio,
      overlays,
      ducking: { enabled: t.mix.ducking, level: t.mix.duckLevel },
      normalize: t.mix.normalize,
      subtitles,
      fontsDir,
    },
    files,
  };
}

export function packageSize(pkg: RenderPackage) {
  let s = 0;
  for (const b of pkg.files.values()) s += b.size;
  return s;
}

export function projectTitleFile(p: Project) {
  return p.title;
}
