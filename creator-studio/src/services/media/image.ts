import type { AspectRatio } from '@/types';

export async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const d = { width: bmp.width, height: bmp.height };
  bmp.close();
  return d;
}

/** Generation size per aspect. Kept ≤ 1536 px on the long edge to respect provider limits and phone memory. */
export function generationSize(aspect: AspectRatio | 'custom', quality: 'draft' | 'standard' | 'high', custom?: { w: number; h: number }) {
  const long = quality === 'draft' ? 1024 : quality === 'standard' ? 1344 : 1536;
  const short = Math.round(((long * 9) / 16) / 64) * 64;
  if (aspect === 'custom' && custom) return { width: Math.round(custom.w / 64) * 64, height: Math.round(custom.h / 64) * 64 };
  if (aspect === '16:9') return { width: long, height: short };
  if (aspect === '9:16') return { width: short, height: long };
  const sq = quality === 'draft' ? 768 : 1024;
  return { width: sq, height: sq };
}

/** Downscales an image blob (keeps aspect) — used for reference images and thumbnails to save memory. */
export async function resizeImage(blob: Blob, maxEdge: number, type = 'image/jpeg', quality = 0.9): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
  canvas.width = canvas.height = 0;
  if (!out) throw new Error('Could not encode image');
  return out;
}

/** Average luminance 0..255 of a small downscaled copy. Used by quality control to flag black frames. */
export async function averageLuma(blob: Blob): Promise<number> {
  const bmp = await createImageBitmap(blob, { resizeWidth: 32, resizeHeight: 32 });
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, 32, 32);
  bmp.close();
  const d = ctx.getImageData(0, 0, 32, 32).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return sum / (d.length / 4);
}

export async function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  const b = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
  if (!b) throw new Error('Canvas export failed');
  return b;
}
