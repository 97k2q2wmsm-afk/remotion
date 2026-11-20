// Deterministic randomness + noise. Everything the renderer draws must be a pure
// function of (seed, frame) so parallel Remotion workers produce identical frames.

export const rng = (seed: number) => {
	let a = seed >>> 0 || 1;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

export const hash2 = (x: number, y: number, seed: number) => {
	let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

export const valueNoise = (x: number, y: number, seed = 0) => {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const xf = smooth(x - xi);
	const yf = smooth(y - yi);
	const a = hash2(xi, yi, seed);
	const b = hash2(xi + 1, yi, seed);
	const c = hash2(xi, yi + 1, seed);
	const d = hash2(xi + 1, yi + 1, seed);
	return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; // 0..1
};

export const fbm = (x: number, y: number, octaves = 5, seed = 0) => {
	let amp = 0.5;
	let f = 1;
	let sum = 0;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		sum += amp * valueNoise(x * f, y * f, seed + i * 17);
		norm += amp;
		amp *= 0.5;
		f *= 2.03;
	}
	return sum / norm; // 0..1
};

export const ridged = (x: number, y: number, octaves = 5, seed = 0) => {
	let amp = 0.5;
	let f = 1;
	let sum = 0;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		const n = 1 - Math.abs(valueNoise(x * f, y * f, seed + i * 31) * 2 - 1);
		sum += amp * n * n;
		norm += amp;
		amp *= 0.5;
		f *= 2.1;
	}
	return sum / norm;
};

/** Smooth 1-D noise in -1..1, for handheld shake and flicker. */
export const noise1 = (t: number, seed = 0) => valueNoise(t, seed * 7.13, seed) * 2 - 1;

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
	const t = clamp((v - a) / (b - a));
	return t * t * (3 - 2 * t);
};
