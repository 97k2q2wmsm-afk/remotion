// Pure camera-motion math shared by the on-device compositor and the FFmpeg filtergraph compiler.
// Keep this file free of runtime imports so the Node render worker can load it directly.
import type { MotionType, TransitionType } from '@/types';

export interface MotionKeys {
  z0: number;
  z1: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  ease: boolean;
}

export function motionKeys(type: MotionType, intensity: number): MotionKeys {
  const k = Math.max(0.2, Math.min(2, intensity));
  const a = Math.min(0.95, 0.75 * k);
  const pz = 1.1 + 0.05 * k; // zoom used for pans so there is room to travel
  switch (type) {
    case 'zoomIn':
      return { z0: 1, z1: 1 + 0.14 * k, x0: 0, x1: 0, y0: 0, y1: 0, ease: false };
    case 'zoomOut':
      return { z0: 1 + 0.14 * k, z1: 1, x0: 0, x1: 0, y0: 0, y1: 0, ease: false };
    case 'panLeft':
      return { z0: pz, z1: pz, x0: a, x1: -a, y0: 0, y1: 0, ease: true };
    case 'panRight':
      return { z0: pz, z1: pz, x0: -a, x1: a, y0: 0, y1: 0, ease: true };
    case 'panUp':
      return { z0: pz, z1: pz, x0: 0, x1: 0, y0: a, y1: -a, ease: true };
    case 'panDown':
      return { z0: pz, z1: pz, x0: 0, x1: 0, y0: -a, y1: a, ease: true };
    case 'pushIn':
      return { z0: 1, z1: 1 + 0.24 * k, x0: 0, x1: 0, y0: 0.1, y1: -0.15, ease: true };
    case 'pullOut':
      return { z0: 1 + 0.24 * k, z1: 1, x0: 0, x1: 0, y0: -0.15, y1: 0.1, ease: true };
    case 'kenBurns':
      return { z0: 1.04, z1: 1.04 + 0.16 * k, x0: -0.5 * k, x1: 0.5 * k, y0: 0.35 * k, y1: -0.35 * k, ease: false };
    case 'static':
    default:
      return { z0: 1, z1: 1, x0: 0, x1: 0, y0: 0, y1: 0, ease: false };
  }
}

export function easeProgress(p: number, ease: boolean): number {
  const c = Math.max(0, Math.min(1, p));
  return ease ? 0.5 - 0.5 * Math.cos(Math.PI * c) : c;
}

/** Source rectangle (in image pixels) to draw for a cover-fitted, moving camera at progress p (0..1). */
export function sourceRect(imgW: number, imgH: number, outW: number, outH: number, keys: MotionKeys, p: number) {
  const e = easeProgress(p, keys.ease);
  const z = keys.z0 + (keys.z1 - keys.z0) * e;
  const px = keys.x0 + (keys.x1 - keys.x0) * e;
  const py = keys.y0 + (keys.y1 - keys.y0) * e;
  const cover = Math.max(outW / imgW, outH / imgH);
  const sw = outW / (cover * z);
  const sh = outH / (cover * z);
  const cx = imgW / 2 + (px * (imgW - sw)) / 2;
  const cy = imgH / 2 + (py * (imgH - sh)) / 2;
  return { sx: cx - sw / 2, sy: cy - sh / 2, sw, sh };
}

/** FFmpeg xfade name for each transition (cut is handled with concat). */
export const XFADE: Record<TransitionType, string> = {
  cut: 'fade',
  dissolve: 'fade',
  fadeBlack: 'fadeblack',
  fadeWhite: 'fadewhite',
  blur: 'hblur',
  zoom: 'zoomin',
  slideLeft: 'slideleft',
  slideUp: 'slideup',
  film: 'fadegrays',
};
