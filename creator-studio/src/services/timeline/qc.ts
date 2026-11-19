import type { Project, Timeline } from '@/types';
import { getAssetBlob, getAssetMeta } from '@/services/storage/assets';
import { averageLuma } from '@/services/media/image';
import { renderMix } from '@/services/compositor/audioMix';
import { webCodecsSupport } from '@/services/rendering/webcodecs';
import { aspectSize } from '@/utils';
import { clipStarts, timelineDuration } from './math';

export interface QcIssue {
  level: 'error' | 'warning' | 'ok';
  check: string;
  message: string;
  fix?: string;
}

/** Pre-export quality control on the real assets of the active timeline. */
export async function runQualityChecks(project: Project, t: Timeline): Promise<QcIssue[]> {
  const out: QcIssue[] = [];
  const total = timelineDuration(t);
  const starts = clipStarts(t);
  const { width, height } = aspectSize(t.aspect, project.render.resolution);

  // Images
  const missing = t.clips.filter((c) => c.kind === 'image' && !c.assetId);
  out.push(
    missing.length
      ? { level: 'error', check: 'Missing images', message: `${missing.length} clip(s) have no image and will render as dark placeholders.`, fix: 'Generate or upload images in the Images step, or replace them in the timeline.' }
      : { level: 'ok', check: 'Missing images', message: 'Every clip has an image.' },
  );

  // Scene ordering
  const sceneOrder = t.clips.filter((c) => c.sceneId).map((c) => project.scenes.find((s) => s.id === c.sceneId)?.number ?? 0);
  const ordered = sceneOrder.every((n, i) => i === 0 || n >= sceneOrder[i - 1]);
  out.push(
    ordered
      ? { level: 'ok', check: 'Scene order', message: 'Scenes follow the script order.' }
      : { level: 'warning', check: 'Scene order', message: 'Clips are not in script order.', fix: 'This is fine if intentional; otherwise reorder clips in the timeline.' },
  );

  // Timing
  const short = t.clips.filter((c) => c.duration < 1);
  const overrun = t.narration.filter((n) => {
    const clip = t.clips.findIndex((c) => c.sceneId && c.sceneId === n.sceneId);
    return clip >= 0 && n.start + n.duration > starts[clip] + t.clips[clip].duration + 0.05;
  });
  if (short.length) out.push({ level: 'warning', check: 'Scene timing', message: `${short.length} clip(s) are shorter than 1 second.`, fix: 'Lengthen them so viewers can register the image.' });
  if (overrun.length)
    out.push({ level: 'warning', check: 'Scene timing', message: `Narration of ${overrun.length} scene(s) runs past its image.`, fix: 'Use "Fit clips to narration" in the editor or lengthen those clips.' });
  if (!short.length && !overrun.length) out.push({ level: 'ok', check: 'Scene timing', message: 'Clip lengths match narration.' });

  // Audio presence & gaps
  if (!t.narration.length) out.push({ level: 'error', check: 'Missing audio', message: 'There is no narration in the timeline.', fix: 'Generate a voice-over or upload/record narration in the Voice step, then rebuild the edit.' });
  else {
    const sorted = [...t.narration].sort((a, b) => a.start - b.start);
    let maxGap = sorted[0].start;
    for (let i = 1; i < sorted.length; i++) maxGap = Math.max(maxGap, sorted[i].start - (sorted[i - 1].start + sorted[i - 1].duration));
    out.push(
      maxGap > 3
        ? { level: 'warning', check: 'Empty sections', message: `There is a ${maxGap.toFixed(1)} s stretch without narration.`, fix: 'Shorten the clip or add narration / a text overlay there.' }
        : { level: 'ok', check: 'Empty sections', message: 'No long silent stretches.' },
    );
  }
  for (const a of [...t.narration, ...t.music, ...t.sfx]) {
    if (!(await getAssetMeta(a.assetId))) {
      out.push({ level: 'error', check: 'Missing audio', message: `Audio "${a.label}" is no longer in storage.`, fix: 'Remove it from the timeline or rebuild the edit.' });
      break;
    }
  }

  // Black frames, resolution and aspect of images
  let dark = 0;
  let lowRes = 0;
  let aspectOff = 0;
  for (const c of t.clips) {
    if (c.kind !== 'image' || !c.assetId) continue;
    const meta = await getAssetMeta(c.assetId);
    const blob = await getAssetBlob(c.assetId);
    if (!meta || !blob) continue;
    if ((await averageLuma(blob)) < 10) dark++;
    if (meta.width && meta.height) {
      const cover = Math.max(width / meta.width, height / meta.height);
      if (cover > 1.6) lowRes++;
      const ar = meta.width / meta.height;
      const target = width / height;
      if (Math.abs(Math.log(ar / target)) > 0.45) aspectOff++;
    }
  }
  out.push(
    dark
      ? { level: 'warning', check: 'Black frames', message: `${dark} image(s) are almost completely black.`, fix: 'Regenerate or replace those images.' }
      : { level: 'ok', check: 'Black frames', message: 'No black images detected.' },
  );
  out.push(
    lowRes
      ? { level: 'warning', check: 'Resolution', message: `${lowRes} image(s) will be upscaled more than 1.6× at ${project.render.resolution}.`, fix: 'Render at 720p or regenerate those images at higher quality.' }
      : { level: 'ok', check: 'Resolution', message: `Images are sharp enough for ${width}×${height}.` },
  );
  out.push(
    aspectOff
      ? { level: 'warning', check: 'Aspect ratio', message: `${aspectOff} image(s) have a very different shape from ${t.aspect}; they will be cropped.`, fix: 'Regenerate them with the project aspect ratio.' }
      : { level: 'ok', check: 'Aspect ratio', message: `Images fit ${t.aspect}.` },
  );

  // Subtitles
  const badCues = t.captions.filter((c, i) => c.end <= c.start || c.end > total + 0.1 || (i > 0 && c.start < t.captions[i - 1].end - 0.05));
  if (t.captionStyle.enabled && !t.captions.length && t.narration.length)
    out.push({ level: 'warning', check: 'Subtitle sync', message: 'Subtitles are enabled but empty.', fix: 'Press "Rebuild subtitles" in the editor.' });
  else
    out.push(
      badCues.length
        ? { level: 'warning', check: 'Subtitle sync', message: `${badCues.length} subtitle cue(s) overlap or fall outside the video.`, fix: 'Rebuild subtitles or adjust their timing.' }
        : { level: 'ok', check: 'Subtitle sync', message: `${t.captions.length} cues inside the video.` },
    );

  // Clipping
  try {
    if (total < 900) {
      const mix = await renderMix({ ...t, mix: { ...t.mix, normalize: false } }, 22050);
      out.push(
        mix.peakBefore > 1
          ? { level: t.mix.normalize ? 'ok' : 'warning', check: 'Audio clipping', message: `Mix peaks at ${(20 * Math.log10(mix.peakBefore)).toFixed(1)} dBFS.`, fix: t.mix.normalize ? 'Normalization is on and will prevent clipping.' : 'Turn on normalization or lower track volumes.' }
          : { level: 'ok', check: 'Audio clipping', message: `Peak ${(20 * Math.log10(Math.max(1e-6, mix.peakBefore))).toFixed(1)} dBFS — no clipping.` },
      );
    }
  } catch (err) {
    out.push({ level: 'warning', check: 'Audio clipping', message: `Could not analyse the mix: ${(err as Error).message}` });
  }

  // Format support
  const wc = await webCodecsSupport(t.aspect, project.render.resolution);
  out.push({
    level: project.render.resolution === '2160p' && !wc.video && project.render.engine !== 'cloud' ? 'error' : 'ok',
    check: 'Export format',
    message: `MP4 · H.264 · AAC · ${width}×${height} · ${t.fps} fps. On-device encoder: ${wc.video ? 'available' : 'not available'}${wc.video && !wc.audio ? ' (audio via FFmpeg.wasm)' : ''}.`,
    fix: project.render.resolution === '2160p' && !wc.video ? '4K needs the cloud worker on this device.' : undefined,
  });
  if (total > 240 && project.render.engine !== 'cloud')
    out.push({ level: 'warning', check: 'Device limits', message: `This video is ${Math.round(total / 60)} minutes long. Rendering on an iPhone may run out of memory or pause in the background.`, fix: 'Use the cloud render worker, or keep the screen on and the app in the foreground.' });
  return out;
}
