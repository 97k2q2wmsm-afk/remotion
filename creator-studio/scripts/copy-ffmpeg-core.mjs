// Copies the FFmpeg.wasm runtime into public/ffmpeg so the app serves it from
// its own origin (works offline once cached and needs no third-party CDN).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ffmpeg');
const pairs = [
  ['node_modules/@ffmpeg/ffmpeg/dist/esm', 'lib'],
  ['node_modules/@ffmpeg/core/dist/esm', 'core'],
];
for (const [from, to] of pairs) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.warn(`[copy-ffmpeg-core] missing ${from}; browser FFmpeg rendering will be unavailable`);
    continue;
  }
  mkdirSync(join(out, to), { recursive: true });
  cpSync(src, join(out, to), { recursive: true, filter: (p) => !p.endsWith('.d.ts') && !p.endsWith('.d.mts') });
}
console.log('[copy-ffmpeg-core] FFmpeg.wasm runtime copied to public/ffmpeg');
