import type { Channel, FontId, ThumbConcept, ThumbDesign, ThumbImageLayer, ThumbLayer, ThumbShapeLayer, ThumbTextLayer } from '@/types';
import { getAssetBlob } from '@/services/storage/assets';
import { fontStack, loadFonts, wrap } from '@/services/compositor/compositor';
import { uid } from '@/utils';

export const THUMB_W = 1280;
export const THUMB_H = 720;

const base = { visible: true, rotation: 0, opacity: 1 };

export function textLayer(p: Partial<ThumbTextLayer> & { text: string }): ThumbTextLayer {
  return {
    ...base,
    id: uid('l'),
    type: 'text',
    name: 'Text',
    x: 60,
    y: 60,
    w: 640,
    h: 300,
    font: 'Anton',
    size: 120,
    weight: 900,
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 14,
    shadowColor: 'rgba(0,0,0,0.6)',
    shadowBlur: 18,
    align: 'left',
    uppercase: true,
    lineHeight: 0.95,
    highlightColor: '',
    ...p,
  };
}

export function imageLayer(assetId: string, p: Partial<ThumbImageLayer> = {}): ThumbImageLayer {
  return { ...base, id: uid('l'), type: 'image', name: 'Image', assetId, x: 0, y: 0, w: THUMB_W, h: THUMB_H, crop: { x: 0, y: 0, w: 1, h: 1 }, flipX: false, ...p };
}

export function shapeLayer(p: Partial<ThumbShapeLayer>): ThumbShapeLayer {
  return { ...base, id: uid('l'), type: 'shape', name: 'Shape', shape: 'rect', x: 0, y: 0, w: THUMB_W, h: THUMB_H, color: '#000000', color2: 'rgba(0,0,0,0)', angle: 90, radius: 0, ...p };
}

/** Builds a distinct, editable layout from an AI concept — four different compositions, never one template. */
export function designFromConcept(concept: ThumbConcept, imageAssetId: string | undefined, channel?: Channel): ThumbDesign {
  const c1 = concept.colors[0] ?? channel?.brandColors[0] ?? '#FFD23F';
  const c2 = concept.colors[1] ?? channel?.brandColors[1] ?? '#FF4F7B';
  const font: FontId = channel?.titleFont ?? 'Anton';
  const text = concept.text || concept.title;
  const layers: ThumbLayer[] = [];
  if (imageAssetId) layers.push(imageLayer(imageAssetId, { name: 'Artwork' }));
  switch (concept.layout) {
    case 'text-right':
      layers.push(shapeLayer({ name: 'Shade', shape: 'gradient', color: 'rgba(0,0,0,0)', color2: 'rgba(0,0,0,0.85)', angle: 0, x: 520, w: 760 }));
      layers.push(textLayer({ text, font, x: 660, y: 120, w: 580, h: 480, align: 'right', color: c1, size: 130 }));
      break;
    case 'bottom-bar':
      layers.push(shapeLayer({ name: 'Bar', shape: 'rect', color: c2, x: 0, y: 520, w: THUMB_W, h: 200, opacity: 0.92 }));
      layers.push(textLayer({ text, font, x: 50, y: 535, w: 1180, h: 170, align: 'center', color: '#FFFFFF', size: 110, strokeWidth: 0, shadowBlur: 0 }));
      break;
    case 'center-impact':
      layers.push(shapeLayer({ name: 'Vignette', shape: 'circle', color: 'rgba(0,0,0,0)', color2: 'rgba(0,0,0,0.75)' }));
      layers.push(textLayer({ text, font, x: 90, y: 200, w: 1100, h: 320, align: 'center', color: c1, size: 150, strokeWidth: 18, rotation: -3 }));
      break;
    case 'text-left':
    default:
      layers.push(shapeLayer({ name: 'Shade', shape: 'gradient', color: 'rgba(0,0,0,0.85)', color2: 'rgba(0,0,0,0)', angle: 0, x: 0, w: 760 }));
      layers.push(textLayer({ text, font, x: 50, y: 110, w: 620, h: 500, color: c1, size: 135, highlightColor: '' }));
  }
  return { id: uid('td'), name: concept.title, conceptId: concept.id, background: '#0b0d17', layers, updatedAt: Date.now() };
}

const bitmapCache = new Map<string, Promise<ImageBitmap | undefined>>();
function bitmap(id: string) {
  let p = bitmapCache.get(id);
  if (!p) {
    p = getAssetBlob(id).then((b) => (b ? createImageBitmap(b) : undefined));
    bitmapCache.set(id, p);
  }
  return p;
}
export function forgetThumbBitmap(id: string) {
  bitmapCache.delete(id);
}

/** Draws a design at 1280×720 (or scaled). Used by the editor canvas and PNG/JPG export. */
export async function renderDesign(ctx: CanvasRenderingContext2D, d: ThumbDesign, selectedId?: string) {
  await loadFonts();
  const bitmaps = new Map<string, ImageBitmap | undefined>();
  for (const l of d.layers) if (l.type === 'image') bitmaps.set(l.assetId, await bitmap(l.assetId));
  ctx.save();
  ctx.clearRect(0, 0, THUMB_W, THUMB_H);
  ctx.fillStyle = d.background;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  for (const l of d.layers) {
    if (!l.visible) continue;
    ctx.save();
    ctx.globalAlpha = l.opacity;
    ctx.translate(l.x + l.w / 2, l.y + l.h / 2);
    ctx.rotate((l.rotation * Math.PI) / 180);
    ctx.translate(-l.w / 2, -l.h / 2);
    if (l.type === 'image') {
      const bmp = bitmaps.get(l.assetId);
      if (bmp) {
        const sx = l.crop.x * bmp.width;
        const sy = l.crop.y * bmp.height;
        const sw = l.crop.w * bmp.width;
        const sh = l.crop.h * bmp.height;
        // cover-fit the crop into the layer box
        const scale = Math.max(l.w / sw, l.h / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        ctx.beginPath();
        ctx.rect(0, 0, l.w, l.h);
        ctx.clip();
        if (l.flipX) {
          ctx.translate(l.w, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(bmp, sx, sy, sw, sh, (l.w - dw) / 2, (l.h - dh) / 2, dw, dh);
      }
    } else if (l.type === 'shape') {
      if (l.shape === 'gradient') {
        const a = (l.angle * Math.PI) / 180;
        const g = ctx.createLinearGradient(l.w / 2 - (Math.cos(a) * l.w) / 2, l.h / 2 - (Math.sin(a) * l.h) / 2, l.w / 2 + (Math.cos(a) * l.w) / 2, l.h / 2 + (Math.sin(a) * l.h) / 2);
        g.addColorStop(0, l.color);
        g.addColorStop(1, l.color2);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, l.w, l.h);
      } else if (l.shape === 'circle') {
        const g = ctx.createRadialGradient(l.w / 2, l.h / 2, Math.min(l.w, l.h) * 0.25, l.w / 2, l.h / 2, Math.max(l.w, l.h) * 0.7);
        g.addColorStop(0, l.color);
        g.addColorStop(1, l.color2);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, l.w, l.h);
      } else {
        ctx.fillStyle = l.color;
        if (l.radius > 0) {
          ctx.beginPath();
          ctx.roundRect(0, 0, l.w, l.h, l.radius);
          ctx.fill();
        } else ctx.fillRect(0, 0, l.w, l.h);
      }
    } else {
      drawThumbText(ctx, l);
    }
    ctx.restore();
    if (l.id === selectedId) {
      ctx.save();
      ctx.translate(l.x + l.w / 2, l.y + l.h / 2);
      ctx.rotate((l.rotation * Math.PI) / 180);
      ctx.strokeStyle = '#3ea6ff';
      ctx.setLineDash([12, 8]);
      ctx.lineWidth = 4;
      ctx.strokeRect(-l.w / 2, -l.h / 2, l.w, l.h);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawThumbText(ctx: CanvasRenderingContext2D, l: ThumbTextLayer) {
  const text = l.uppercase ? l.text.toLocaleUpperCase() : l.text;
  ctx.font = `${l.weight} ${l.size}px ${fontStack(l.font)}`;
  ctx.textBaseline = 'top';
  const lines = text.split('\n').flatMap((para) => wrap(ctx, para, l.w));
  const lh = l.size * l.lineHeight * 1.1;
  const x = l.align === 'left' ? 0 : l.align === 'right' ? l.w : l.w / 2;
  ctx.textAlign = l.align;
  lines.forEach((line, i) => {
    const y = i * lh;
    if (l.highlightColor) {
      const w = ctx.measureText(line).width;
      const bx = l.align === 'left' ? 0 : l.align === 'right' ? l.w - w : (l.w - w) / 2;
      ctx.fillStyle = l.highlightColor;
      ctx.fillRect(bx - l.size * 0.12, y - l.size * 0.04, w + l.size * 0.24, lh * 0.98);
    }
    if (l.shadowBlur > 0) {
      ctx.shadowColor = l.shadowColor;
      ctx.shadowBlur = l.shadowBlur;
      ctx.shadowOffsetY = l.shadowBlur / 3;
    }
    if (l.strokeWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = l.strokeWidth;
      ctx.strokeStyle = l.strokeColor;
      ctx.strokeText(line, x, y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = l.color;
    ctx.fillText(line, x, y);
    ctx.shadowColor = 'transparent';
  });
}

export async function exportDesign(d: ThumbDesign, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = THUMB_W;
  c.height = THUMB_H;
  const ctx = c.getContext('2d')!;
  await renderDesign(ctx, d);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.92));
  if (!blob) throw new Error('Export failed');
  return blob;
}
