import type { CaptionStyle, FontId, TextOverlay, Timeline, VideoClip } from '@/types';
import { getAssetBlob } from '@/services/storage/assets';
import { captionAt } from '@/services/timeline/captions';
import { clipStarts, timelineDuration, transitionLength } from '@/services/timeline/math';
import { motionKeys, sourceRect } from './motion';

// Canvas compositor: draws any frame of a timeline. Used by the live preview, the on-device
// WebCodecs encoder and to rasterize title cards for FFmpeg — so all outputs look the same.

export function fontStack(font: FontId): string {
  if (font === 'system-ui') return 'system-ui, -apple-system, sans-serif';
  if (font === 'Georgia') return 'Georgia, serif';
  return `"${font}", system-ui, sans-serif`;
}

export async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.allSettled(['900 48px Anton', '700 48px Montserrat', '800 48px Montserrat', '700 48px Cinzel'].map((f) => document.fonts.load(f, 'AaŞşĞğİıÑñ')));
}

/** LRU cache of decoded, downscaled bitmaps so phones never hold all images at full size. */
export class BitmapCache {
  private map = new Map<string, ImageBitmap>();
  private loading = new Map<string, Promise<ImageBitmap | undefined>>();
  constructor(
    private maxEdge: number,
    private capacity = 6,
  ) {}

  get(id?: string): ImageBitmap | undefined {
    if (!id) return undefined;
    const b = this.map.get(id);
    if (b) {
      this.map.delete(id);
      this.map.set(id, b);
    } else void this.load(id);
    return b;
  }

  load(id: string): Promise<ImageBitmap | undefined> {
    if (this.map.has(id)) return Promise.resolve(this.map.get(id));
    const cur = this.loading.get(id);
    if (cur) return cur;
    const p = (async () => {
      const blob = await getAssetBlob(id);
      if (!blob) return undefined;
      const probe = await createImageBitmap(blob);
      const scale = Math.min(1, this.maxEdge / Math.max(probe.width, probe.height));
      let bmp = probe;
      if (scale < 1) {
        bmp = await createImageBitmap(blob, { resizeWidth: Math.round(probe.width * scale), resizeHeight: Math.round(probe.height * scale), resizeQuality: 'high' });
        probe.close();
      }
      this.map.set(id, bmp);
      while (this.map.size > this.capacity) {
        const [oldId, old] = this.map.entries().next().value as [string, ImageBitmap];
        old.close();
        this.map.delete(oldId);
      }
      return bmp;
    })().finally(() => this.loading.delete(id));
    this.loading.set(id, p);
    return p;
  }

  clear() {
    for (const b of this.map.values()) b.close();
    this.map.clear();
  }
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class Compositor {
  private starts: number[];
  private total: number;
  private scratch: HTMLCanvasElement | OffscreenCanvas;
  readonly cache: BitmapCache;

  constructor(
    private ctx: Ctx,
    private timeline: Timeline,
    readonly width: number,
    readonly height: number,
    cache?: BitmapCache,
  ) {
    this.starts = clipStarts(timeline);
    this.total = timelineDuration(timeline);
    this.cache = cache ?? new BitmapCache(Math.max(width, height) * 1.35);
    this.scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(64, 64) : document.createElement('canvas');
  }

  setTimeline(t: Timeline) {
    this.timeline = t;
    this.starts = clipStarts(t);
    this.total = timelineDuration(t);
  }

  get duration() {
    return this.total;
  }

  /** Clip indices visible at time t (1 or 2 during a transition). */
  private active(t: number): { a: number; b?: number; q: number } {
    const n = this.timeline.clips.length;
    let i = 0;
    for (let k = n - 1; k >= 0; k--)
      if (t >= this.starts[k]) {
        i = k;
        break;
      }
    const tin = transitionLength(this.timeline, i);
    if (tin > 0 && t < this.starts[i] + tin / 2) return { a: i - 1, b: i, q: (t - (this.starts[i] - tin / 2)) / tin };
    const tout = transitionLength(this.timeline, i + 1);
    const next = this.starts[i + 1];
    if (tout > 0 && next !== undefined && t >= next - tout / 2) return { a: i, b: i + 1, q: (t - (next - tout / 2)) / tout };
    return { a: i, q: 0 };
  }

  /** Awaits the bitmaps needed for time t and preloads the next clip (for exact export frames). */
  async prepare(t: number) {
    const { a, b } = this.active(t);
    const ids = [this.timeline.clips[a]?.assetId, b !== undefined ? this.timeline.clips[b]?.assetId : undefined, this.timeline.clips[a + 1]?.assetId];
    await Promise.all(ids.filter(Boolean).map((id) => this.cache.load(id!)));
  }

  draw(t: number) {
    const { ctx, width: W, height: H } = this;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (this.timeline.clips.length) {
      const { a, b, q } = this.active(Math.min(t, this.total - 1e-6));
      if (b === undefined) this.drawClip(a, t, 1);
      else this.drawTransition(a, b, t, q);
    }
    this.drawOverlays(t);
    this.drawCaption(t);
    ctx.restore();
  }

  private progress(i: number, t: number) {
    const c = this.timeline.clips[i];
    const tin = transitionLength(this.timeline, i);
    const tout = transitionLength(this.timeline, i + 1);
    return (t - (this.starts[i] - tin / 2)) / (c.duration + tin / 2 + tout / 2);
  }

  private drawClip(i: number, t: number, alpha: number, target: Ctx = this.ctx, dx = 0, dy = 0, scale = 1) {
    const c = this.timeline.clips[i];
    if (!c) return;
    const p = this.progress(i, t);
    target.save();
    target.globalAlpha = alpha;
    if (scale !== 1 || dx || dy) {
      target.translate(this.width / 2 + dx, this.height / 2 + dy);
      target.scale(scale, scale);
      target.translate(-this.width / 2, -this.height / 2);
    }
    if (c.kind === 'title') this.drawTitle(target, c, p);
    else {
      const bmp = this.cache.get(c.assetId);
      if (bmp) {
        const r = sourceRect(bmp.width, bmp.height, this.width, this.height, motionKeys(c.motion, c.motionIntensity), p);
        target.imageSmoothingQuality = 'high';
        target.drawImage(bmp, r.sx, r.sy, r.sw, r.sh, 0, 0, this.width, this.height);
      } else {
        const g = target.createLinearGradient(0, 0, this.width, this.height);
        g.addColorStop(0, '#141826');
        g.addColorStop(1, '#0a0b12');
        target.fillStyle = g;
        target.fillRect(0, 0, this.width, this.height);
        if (!c.assetId) {
          target.fillStyle = 'rgba(255,255,255,0.35)';
          target.font = `600 ${Math.round(this.height * 0.03)}px ${fontStack('Montserrat')}`;
          target.textAlign = 'center';
          target.fillText('Missing image', this.width / 2, this.height / 2);
        }
      }
    }
    target.restore();
  }

  private drawTransition(a: number, b: number, t: number, qRaw: number) {
    const q = Math.max(0, Math.min(1, qRaw));
    const type = this.timeline.clips[b].transition;
    const W = this.width;
    const H = this.height;
    const ease = 0.5 - 0.5 * Math.cos(Math.PI * q);
    switch (type) {
      case 'fadeBlack':
      case 'fadeWhite': {
        const first = q < 0.5;
        this.drawClip(first ? a : b, t, 1);
        this.ctx.fillStyle = type === 'fadeBlack' ? '#000' : '#fff';
        this.ctx.globalAlpha = first ? q * 2 : 2 - q * 2;
        this.ctx.fillRect(0, 0, W, H);
        this.ctx.globalAlpha = 1;
        break;
      }
      case 'slideLeft':
        this.drawClip(a, t, 1, this.ctx, -ease * W, 0);
        this.drawClip(b, t, 1, this.ctx, (1 - ease) * W, 0);
        break;
      case 'slideUp':
        this.drawClip(a, t, 1, this.ctx, 0, -ease * H);
        this.drawClip(b, t, 1, this.ctx, 0, (1 - ease) * H);
        break;
      case 'zoom':
        this.drawClip(b, t, 1, this.ctx, 0, 0, 1.25 - 0.25 * ease);
        this.drawClip(a, t, 1 - ease, this.ctx, 0, 0, 1 + 0.6 * ease);
        break;
      case 'blur': {
        // Downscale/upscale blur works in every browser (canvas filter is not universal on iOS).
        this.drawClip(a, t, 1);
        this.drawClip(b, t, q);
        const amount = Math.sin(Math.PI * q);
        if (amount > 0.05) {
          const f = 1 + amount * 18;
          const sw = Math.max(8, Math.round(W / f));
          const sh = Math.max(8, Math.round(H / f));
          this.scratch.width = sw;
          this.scratch.height = sh;
          const sctx = this.scratch.getContext('2d') as Ctx;
          sctx.imageSmoothingEnabled = true;
          sctx.drawImage(this.ctx.canvas, 0, 0, sw, sh);
          this.ctx.imageSmoothingEnabled = true;
          this.ctx.drawImage(this.scratch, 0, 0, W, H);
        }
        break;
      }
      case 'film': {
        this.drawClip(a, t, 1);
        this.drawClip(b, t, q);
        const burn = Math.sin(Math.PI * q);
        const g = this.ctx.createRadialGradient(W * 0.8, H * 0.2, 0, W * 0.8, H * 0.2, Math.max(W, H));
        g.addColorStop(0, `rgba(255,200,120,${0.75 * burn})`);
        g.addColorStop(0.5, `rgba(255,90,20,${0.35 * burn})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.fillStyle = g;
        this.ctx.fillRect(0, 0, W, H);
        break;
      }
      case 'dissolve':
      case 'cut':
      default:
        this.drawClip(a, t, 1);
        this.drawClip(b, t, q);
    }
  }

  drawTitle(target: Ctx, c: VideoClip, p: number) {
    const W = this.width;
    const H = this.height;
    const title = c.title ?? { text: '', subtitle: '', background: '#0B0D17', color: '#FFFFFF', font: 'Anton' as FontId };
    target.fillStyle = title.background;
    target.fillRect(0, 0, W, H);
    const g = target.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    target.fillStyle = g;
    target.fillRect(0, 0, W, H);
    const s = 1 + 0.06 * Math.max(0, Math.min(1, p));
    target.save();
    target.translate(W / 2, H / 2);
    target.scale(s, s);
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    const maxW = W * 0.84;
    let size = Math.round(Math.min(W, H) * 0.12);
    target.font = `900 ${size}px ${fontStack(title.font)}`;
    const lines = wrap(target, title.text, maxW);
    while (lines.length > 3 && size > 20) {
      size -= 4;
      target.font = `900 ${size}px ${fontStack(title.font)}`;
      lines.splice(0, lines.length, ...wrap(target, title.text, maxW));
    }
    const lh = size * 1.1;
    const y0 = -((lines.length - 1) * lh) / 2 - (title.subtitle ? size * 0.35 : 0);
    target.fillStyle = title.color;
    target.shadowColor = 'rgba(0,0,0,0.6)';
    target.shadowBlur = size * 0.2;
    lines.forEach((l, i) => target.fillText(l, 0, y0 + i * lh));
    if (title.subtitle) {
      target.shadowBlur = 0;
      const ss = Math.round(size * 0.38);
      target.font = `600 ${ss}px ${fontStack('Montserrat')}`;
      target.fillStyle = 'rgba(255,255,255,0.85)';
      target.fillText(title.subtitle, 0, y0 + lines.length * lh + ss * 0.4);
    }
    target.restore();
  }

  private drawOverlays(t: number) {
    for (const o of this.timeline.overlays) if (t >= o.start && t < o.end) drawOverlay(this.ctx, o, this.width, this.height, t);
  }

  private drawCaption(t: number) {
    const style = this.timeline.captionStyle;
    if (!style.enabled) return;
    const cue = captionAt(this.timeline.captions, t);
    if (!cue) return;
    drawCaptionCue(this.ctx, cue, style, this.width, this.height, t);
  }
}

export function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function drawOverlay(ctx: Ctx, o: TextOverlay, W: number, H: number, t: number) {
  const size = Math.round((o.size / 100) * H);
  ctx.save();
  ctx.font = `800 ${size}px ${fontStack(o.font)}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrap(ctx, o.text, W * 0.86);
  const lh = size * 1.15;
  const x = o.x * W;
  const y = o.y * H - ((lines.length - 1) * lh) / 2;
  const fade = Math.min(1, (t - o.start) / 0.25, (o.end - t) / 0.25);
  ctx.globalAlpha = Math.max(0, fade);
  if (o.background) {
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + size;
    ctx.fillStyle = o.background;
    roundRect(ctx, x - w / 2, y - lh / 2 - size * 0.15, w, lh * lines.length + size * 0.3, size * 0.25);
    ctx.fill();
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.12;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.fillStyle = o.color;
  lines.forEach((l, i) => {
    if (!o.background) ctx.strokeText(l, x, y + i * lh);
    ctx.fillText(l, x, y + i * lh);
  });
  ctx.restore();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawCaptionCue(
  ctx: Ctx,
  cue: { start: number; end: number; text: string; words?: { text: string; start: number; end: number }[] },
  style: CaptionStyle,
  W: number,
  H: number,
  t: number,
) {
  const size = Math.round((style.size / 100) * H);
  const up = (s: string) => (style.uppercase ? s.toLocaleUpperCase() : s);
  ctx.save();
  ctx.font = `800 ${size}px ${fontStack(style.font)}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const words = (cue.words?.length ? cue.words : cue.text.split(/\s+/).map((w) => ({ text: w, start: cue.start, end: cue.end }))).map((w) => ({ ...w, text: up(w.text) }));
  const space = ctx.measureText(' ').width;
  const maxW = W * 0.86;
  const lines: (typeof words)[] = [[]];
  let lw = 0;
  for (const w of words) {
    const ww = ctx.measureText(w.text).width;
    if (lw + ww > maxW && lines[lines.length - 1].length) {
      lines.push([]);
      lw = 0;
    }
    lines[lines.length - 1].push(w);
    lw += ww + space;
  }
  const lh = size * 1.18;
  const blockH = lh * lines.length;
  const anchor = style.position === 'bottom' ? H - (style.offset / 100) * H - blockH : style.position === 'top' ? (style.offset / 100) * H : H / 2 - blockH / 2;
  const age = t - cue.start;
  let scale = 1;
  if (style.animation === 'pop') scale = age < 0.12 ? 0.85 + (0.15 * age) / 0.12 : 1;
  if (style.animation === 'fade') ctx.globalAlpha = Math.min(1, age / 0.15);
  ctx.translate(W / 2, anchor + blockH / 2);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -(anchor + blockH / 2));
  lines.forEach((line, li) => {
    const widths = line.map((w) => ctx.measureText(w.text).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (line.length - 1);
    let x = (W - total) / 2;
    const y = anchor + lh * li + lh / 2;
    if (style.background) {
      ctx.save();
      ctx.globalAlpha *= style.backgroundOpacity;
      ctx.fillStyle = style.backgroundColor;
      roundRect(ctx, x - size * 0.35, y - lh / 2, total + size * 0.7, lh, size * 0.2);
      ctx.fill();
      ctx.restore();
    }
    line.forEach((w, wi) => {
      const active = style.wordHighlight && t >= w.start && t < (line[wi + 1]?.start ?? words[words.indexOf(w) + 1]?.start ?? cue.end);
      if (style.outlineWidth > 0 && !style.background) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = (style.outlineWidth * H) / 1080;
        ctx.strokeStyle = style.outlineColor;
        ctx.strokeText(w.text, x, y);
      }
      ctx.fillStyle = active ? style.highlightColor : style.color;
      ctx.fillText(w.text, x, y);
      x += widths[wi] + space;
    });
  });
  ctx.restore();
}
