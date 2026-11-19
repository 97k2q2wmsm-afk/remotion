import type { RenderPackage } from './package';
import { compileFfmpegArgs } from '@/services/ffmpeg/filtergraph';
import type { Progress } from './webcodecs';

interface FFmpegLike {
  load(cfg: { coreURL: string; wasmURL: string }): Promise<boolean>;
  writeFile(path: string, data: Uint8Array): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array | string>;
  createDir(path: string): Promise<boolean>;
  exec(args: string[], timeout?: number): Promise<number>;
  on(ev: 'log', cb: (e: { type: string; message: string }) => void): void;
  terminate(): void;
}

async function loadFfmpeg(onLog: (m: string) => void): Promise<FFmpegLike> {
  const libUrl = new URL('/ffmpeg/lib/index.js', location.href).href;
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ libUrl);
  const ff: FFmpegLike = new mod.FFmpeg();
  ff.on('log', (e) => onLog(e.message));
  try {
    await ff.load({
      coreURL: new URL('/ffmpeg/core/ffmpeg-core.js', location.href).href,
      wasmURL: new URL('/ffmpeg/core/ffmpeg-core.wasm', location.href).href,
    });
  } catch (err) {
    throw new Error(`FFmpeg.wasm could not start (${(err as Error).message}). It needs ~32 MB download and enough free memory.`);
  }
  return ff;
}

function parseTime(line: string): number | undefined {
  const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined;
}

/** Full render in the browser with FFmpeg.wasm (single-threaded). Progress comes from FFmpeg's own time= log. */
export async function renderWithFfmpegWasm(pkg: RenderPackage, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<Blob> {
  onProgress({ phase: 'preparing', detail: 'Starting FFmpeg.wasm' });
  const ff = await loadFfmpeg((m) => {
    const t = parseTime(m);
    if (t !== undefined) onProgress({ phase: 'rendering', ratio: Math.min(0.999, t / pkg.manifest.duration), detail: 'Encoding with FFmpeg.wasm' });
  });
  const abort = () => ff.terminate();
  signal.addEventListener('abort', abort);
  try {
    if ([...pkg.files.keys()].some((k) => k.startsWith('fonts/'))) await ff.createDir('fonts');
    for (const [name, blob] of pkg.files) await ff.writeFile(name, new Uint8Array(await blob.arrayBuffer()));
    const args = compileFfmpegArgs(pkg.manifest, { output: 'final.mp4', preset: 'ultrafast' });
    const code = await ff.exec(args);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) throw new Error(`FFmpeg.wasm failed (exit ${code}). The project may be too large for browser rendering — use the cloud worker.`);
    onProgress({ phase: 'finalizing', detail: 'Reading output' });
    const data = await ff.readFile('final.mp4');
    if (typeof data === 'string' || data.length < 1000) throw new Error('FFmpeg.wasm produced no video.');
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
  } finally {
    signal.removeEventListener('abort', abort);
    ff.terminate();
  }
}

/** Adds AAC audio to a video-only MP4 (used when the browser has no AAC encoder). Video is stream-copied. */
export async function muxAudioWithFfmpegWasm(video: Blob, wav: Blob, onProgress: (p: Progress) => void): Promise<Blob> {
  onProgress({ phase: 'finalizing', detail: 'Encoding AAC audio with FFmpeg.wasm' });
  const ff = await loadFfmpeg(() => {});
  try {
    await ff.writeFile('v.mp4', new Uint8Array(await video.arrayBuffer()));
    await ff.writeFile('a.wav', new Uint8Array(await wav.arrayBuffer()));
    const code = await ff.exec(['-i', 'v.mp4', '-i', 'a.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'out.mp4']);
    if (code !== 0) throw new Error('Audio muxing failed.');
    const data = await ff.readFile('out.mp4');
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
  } finally {
    ff.terminate();
  }
}
