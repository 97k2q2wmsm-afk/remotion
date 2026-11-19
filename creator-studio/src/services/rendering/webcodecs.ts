import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeAudio, canEncodeVideo } from 'mediabunny';
import type { RenderResolution, Timeline } from '@/types';
import { Compositor, loadFonts } from '@/services/compositor/compositor';
import { renderMix } from '@/services/compositor/audioMix';
import { encodeWav } from '@/services/media/audio';
import { aspectSize } from '@/utils';

export interface Progress {
  phase: 'preparing' | 'rendering' | 'finalizing';
  ratio?: number; // only real measured progress
  detail?: string;
}

export async function webCodecsSupport(aspect: Timeline['aspect'], resolution: RenderResolution) {
  if (typeof VideoEncoder === 'undefined') return { video: false, audio: false };
  const { width, height } = aspectSize(aspect, resolution);
  const video = await canEncodeVideo('avc', { width, height, bitrate: QUALITY_HIGH }).catch(() => false);
  const audio = await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 44100 }).catch(() => false);
  return { video, audio };
}

/**
 * Renders the timeline frame by frame on the device: canvas compositor → hardware H.264 (WebCodecs)
 * → MP4 (Mediabunny). Audio is the offline Web Audio mix encoded as AAC when the browser can.
 * Returns the MP4, or a video-only MP4 plus a WAV mix when AAC encoding is unavailable.
 */
export async function renderWithWebCodecs(
  t: Timeline,
  resolution: RenderResolution,
  bitrate: number,
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
): Promise<{ mp4: Blob; separateAudio?: Blob }> {
  const { width, height } = aspectSize(t.aspect, resolution);
  onProgress({ phase: 'preparing', detail: 'Loading fonts and mixing audio' });
  await loadFonts();
  const support = await webCodecsSupport(t.aspect, resolution);
  if (!support.video) throw new Error(`This browser cannot hardware-encode H.264 at ${width}×${height}. Try 720p, FFmpeg in browser, or the cloud worker.`);
  const mix = await renderMix(t, 44100);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const comp = new Compositor(ctx, t, width, height);
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const video = new CanvasSource(canvas, { codec: 'avc', bitrate: bitrate > 0 ? bitrate : QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: t.fps });
  let audio: AudioBufferSource | undefined;
  if (support.audio) {
    audio = new AudioBufferSource({ codec: 'aac', bitrate: 192_000 });
    output.addAudioTrack(audio);
  }
  await output.start();
  try {
    if (audio) {
      await audio.add(mix.buffer);
      audio.close();
    }
    const frames = Math.ceil(comp.duration * t.fps);
    const dt = 1 / t.fps;
    let lastYield = performance.now();
    for (let f = 0; f < frames; f++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const time = f * dt;
      await comp.prepare(time);
      comp.draw(time);
      await video.add(time, dt);
      if (f % 15 === 0) onProgress({ phase: 'rendering', ratio: f / frames, detail: `Frame ${f} / ${frames}` });
      if (performance.now() - lastYield > 200) {
        await new Promise((r) => setTimeout(r, 0));
        lastYield = performance.now();
      }
    }
    video.close();
    onProgress({ phase: 'finalizing', detail: 'Writing MP4' });
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => {});
    throw err;
  } finally {
    comp.cache.clear();
    canvas.width = canvas.height = 0;
  }
  const mp4 = new Blob([target.buffer!], { type: 'video/mp4' });
  return support.audio ? { mp4 } : { mp4, separateAudio: encodeWav(mix.buffer) };
}
