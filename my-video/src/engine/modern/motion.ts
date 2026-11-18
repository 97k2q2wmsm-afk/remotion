/**
 * Motion layer of the BAŞINA GELSEYDİ engine.
 *
 * Easing / tweening comes from Motion Canvas (`@motion-canvas/core`, same 3.17.2 release
 * as the local motion-canvas checkout) so animations authored in Motion Canvas and in
 * Remotion share the exact same curves. Remotion supplies the frame clock; Motion Canvas
 * supplies the timing functions and interpolation maths.
 */
import {
	clampRemap,
	easeInCubic,
	easeInExpo,
	easeInOutCubic,
	easeInOutSine,
	easeInQuad,
	easeOutBack,
	easeOutBounce,
	easeOutCubic,
	easeOutElastic,
	easeOutExpo,
	easeOutQuart,
	map,
} from '@motion-canvas/core/lib/tweening';

export type TimingFn = (value: number, from?: number, to?: number) => number;

export const MC = {
	easeInCubic,
	easeInExpo,
	easeInOutCubic,
	easeInOutSine,
	easeInQuad,
	easeOutBack,
	easeOutBounce,
	easeOutCubic,
	easeOutElastic,
	easeOutExpo,
	easeOutQuart,
} satisfies Record<string, TimingFn>;

/** Motion-Canvas-style tween evaluated on Remotion's clock: value at `frame` of a tween [start, start+dur]. */
export const tween = (frame: number, start: number, dur: number, from: number, to: number, ease: TimingFn = easeInOutCubic) => {
	const t = clampRemap(start, start + dur, 0, 1, frame);
	return map(from, to, ease(t));
};

/** Piecewise keyframes [[frame, value], ...] with a Motion Canvas easing per segment. */
export const keys = (frame: number, k: [number, number][], ease: TimingFn = easeInOutCubic) => {
	if (frame <= k[0][0]) return k[0][1];
	for (let i = 1; i < k.length; i++) {
		if (frame <= k[i][0]) {
			const [f0, v0] = k[i - 1];
			const [f1, v1] = k[i];
			return map(v0, v1, ease((frame - f0) / Math.max(1e-6, f1 - f0)));
		}
	}
	return k[k.length - 1][1];
};

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Kick-and-decay shake amplitude. */
export const kick = (frame: number, at: number | null, amp: number, decay: number) =>
	at === null || frame < at ? 0 : amp * Math.exp(-(frame - at) / decay);
