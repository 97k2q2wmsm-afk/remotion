/**
 * "Yerçekimi 10 saniyeliğine yok olsaydı" — scenario physics.
 *
 * Pure TypeScript (no JSX, erasable syntax only) so it can be imported by the scenes AND by
 * Node scripts (scripts/bg-score.mjs uses it to put an impact sound on every landing).
 *
 * SCENARIO RULES (shown to the viewer through the visuals):
 *  1. Gravity switches off for 10 s for everything on the surface; the planet holds together
 *     and keeps rotating.
 *  2. Newton's 1st law: every body keeps the velocity it had. Bodies at rest still drift
 *     away from the curving ground: Δh = (v·t)²/2R ≈ 1 m in 10 s at Istanbul (v ≈ 350 m/s).
 *  3. Compressed springs relax: car suspensions push vehicles up at ~0.3–0.7 m/s;
 *     startled people / animals push off at 0.3–2 m/s; the hero was mid-jump at ~2.8 m/s.
 *  4. Air stays (10 s is too short for the atmosphere to escape); liquids ball up.
 *  5. Gravity returns: free fall h = h0 − ½·g·t². Falls are shown at 0.6× slow motion.
 */

export const FPS = 30;
export const G_Y = 1560; // world y of the sidewalk surface
export const PX_PER_M = 100;
export const OFF_FRAME = 330; // "kapanır"
export const ON_FRAME = 1178; // "On!"
export const GRAB_FRAME = 1151; // "tutunuyorsun"
export const FALL_SLOWMO = 0.6;
export const G = 9.81;

/** Story clock: seconds since gravity vanished, as told by the narration (slow-motion storytelling). */
const STORY_KEYS: [number, number][] = [
	[OFF_FRAME, 0],
	[931, 7], // "Yedinci saniye"
	[1071, 8], // "Sekiz"
	[1100, 9], // "dokuz"
	[ON_FRAME, 10], // "On!"
];

export const storySec = (gf: number): number => {
	if (gf < OFF_FRAME) return (gf - OFF_FRAME) / FPS;
	if (gf >= ON_FRAME) return 10;
	for (let i = 1; i < STORY_KEYS.length; i++) {
		const [f1, s1] = STORY_KEYS[i];
		if (gf <= f1) {
			const [f0, s0] = STORY_KEYS[i - 1];
			return s0 + ((gf - f0) / (f1 - f0)) * (s1 - s0);
		}
	}
	return 10;
};

/** Seconds of (slow-motion) free fall since gravity returned. */
export const fallSec = (gf: number): number => Math.max(0, ((gf - ON_FRAME) / FPS) * FALL_SLOWMO);

/** Current gravity in g (for the HUD). */
export const gravityG = (gf: number): number => {
	if (gf < OFF_FRAME - 4) return 1;
	if (gf < OFF_FRAME + 10) return Math.max(0, 1 - (gf - OFF_FRAME + 4) / 14);
	if (gf < ON_FRAME) return 0;
	return Math.min(1, (gf - ON_FRAME) / 3);
};

export type ItemKind = 'person' | 'car' | 'prop' | 'cart' | 'cat' | 'tea' | 'simit' | 'table';

export type Item = {
	id: string;
	kind: ItemKind;
	/** Rendering variant: cast name, car kind, prop kind… */
	variant: string;
	color: string;
	x0: number;
	/** World y of the item's origin when resting. */
	y0: number;
	scale: number;
	/** Horizontal velocity, m/s (kept while floating — Newton!). */
	vx: number;
	/** Upward push at the moment gravity vanished, m/s. */
	v0: number;
	/** Spin while floating, deg per story-second. */
	spin: number;
	/** Angle after landing. */
	rest: number;
	/** Mass class for the sound designer (0..1). */
	mass: number;
	/** Pre-gravity-off walking speed (m/s, 0 = standing). */
	walk: number;
	flip: boolean;
};

const PELVIS_Y = G_Y + 40 - 230 * 0.31;
const CAR_Y = G_Y + 214;

const it = (p: Partial<Item> & Pick<Item, 'id' | 'kind' | 'variant' | 'x0' | 'y0'>): Item => ({
	color: '#fff',
	scale: 1,
	vx: 0,
	v0: 0,
	spin: 0,
	rest: 0,
	mass: 0.3,
	walk: 0,
	flip: false,
	...p,
});

export const ITEMS: Item[] = [
	// Vehicles in the morning jam (crawling at ~0.3–0.4 m/s)
	it({id: 'van', kind: 'car', variant: 'van', color: '#f4f1ea', x0: -520, y0: CAR_Y, scale: 1.2, vx: 0.35, v0: 0.6, spin: 1.2, rest: 3, mass: 1}),
	it({id: 'taxi', kind: 'car', variant: 'taxi', color: '#ffc928', x0: 60, y0: CAR_Y, scale: 1.2, vx: 0.4, v0: 0.68, spin: -2.2, rest: -4, mass: 0.9}),
	it({id: 'sedan', kind: 'car', variant: 'sedan', color: '#e8453c', x0: 520, y0: CAR_Y, scale: 1.2, vx: 0.4, v0: 0.55, spin: 2.6, rest: 6, mass: 0.9}),
	it({id: 'bus', kind: 'car', variant: 'bus', color: '#3f86c9', x0: 1160, y0: CAR_Y, scale: 1.15, vx: 0.3, v0: 0.32, spin: -0.8, rest: -2, mass: 1}),
	// People
	it({id: 'simitci', kind: 'person', variant: 'simitci', x0: 120, y0: PELVIS_Y, scale: 0.31, v0: 0.3, spin: 4, rest: 0, mass: 0.6}),
	it({id: 'cart', kind: 'cart', variant: 'cart', x0: 280, y0: G_Y + 40, scale: 0.62, v0: 0.12, spin: -2, rest: -3, mass: 0.7, vx: 0}),
	it({id: 'ofis', kind: 'person', variant: 'ofis', x0: -60, y0: PELVIS_Y, scale: 0.31, vx: 0.9, v0: 0.45, spin: -9, rest: 0, mass: 0.6, walk: 1}),
	it({id: 'teyze', kind: 'person', variant: 'teyze', x0: 760, y0: PELVIS_Y, scale: 0.3, v0: 0.6, spin: 6, rest: 0, mass: 0.6}),
	it({id: 'kadin', kind: 'person', variant: 'kadin', x0: 630, y0: PELVIS_Y, scale: 0.31, v0: 0.5, spin: -5, rest: 0, mass: 0.6, flip: true}),
	it({id: 'amca', kind: 'person', variant: 'amca', x0: 960, y0: PELVIS_Y + 20, scale: 0.3, v0: 0.15, spin: 3, rest: 0, mass: 0.6}),
	it({id: 'ogrenci', kind: 'person', variant: 'ogrenci', x0: 1380, y0: PELVIS_Y, scale: 0.29, vx: -0.25, v0: 1.7, spin: 14, rest: 0, mass: 0.5, flip: true}),
	it({id: 'kurye', kind: 'person', variant: 'kurye', x0: 1620, y0: PELVIS_Y, scale: 0.31, vx: -1.0, v0: 0.35, spin: -6, rest: 0, mass: 0.6, walk: 1, flip: true}),
	// Things
	it({id: 'table', kind: 'table', variant: 'table', x0: 1080, y0: G_Y + 40, scale: 1, v0: 0.06, spin: 3, rest: 8, mass: 0.4}),
	it({id: 'tea', kind: 'tea', variant: 'tea', x0: 1080, y0: G_Y - 40, scale: 0.42, v0: 0.12, spin: -14, rest: 80, mass: 0.1}),
	it({id: 'chair', kind: 'prop', variant: 'chair', x0: 900, y0: G_Y - 20, scale: 0.7, v0: 0.2, spin: 22, rest: 90, mass: 0.3}),
	it({id: 'ball', kind: 'prop', variant: 'ball', x0: 420, y0: G_Y + 6, scale: 0.6, vx: 0.3, v0: 3.4, spin: 80, rest: 0, mass: 0.15}),
	it({id: 'cat', kind: 'cat', variant: 'cat', x0: 470, y0: G_Y + 36, scale: 0.42, v0: 2.1, spin: -32, rest: 0, mass: 0.2}),
	it({id: 'paper1', kind: 'prop', variant: 'paper', x0: 700, y0: G_Y + 20, scale: 0.5, v0: 0.9, spin: 40, rest: 10, mass: 0.02}),
	it({id: 'paper2', kind: 'prop', variant: 'paper', x0: 740, y0: G_Y + 20, scale: 0.45, v0: 1.3, spin: -55, rest: -20, mass: 0.02}),
	it({id: 'umbrella', kind: 'prop', variant: 'umbrella', x0: 850, y0: G_Y - 60, scale: 0.6, v0: 0.9, spin: 25, rest: 100, mass: 0.1}),
	it({id: 'bin', kind: 'prop', variant: 'bin', x0: 1240, y0: G_Y - 20, scale: 0.75, v0: 0.12, spin: 5, rest: 85, mass: 0.4}),
	it({id: 'crate', kind: 'prop', variant: 'crate', x0: 1480, y0: G_Y + 4, scale: 0.7, v0: 0.25, spin: 12, rest: 20, mass: 0.4}),
	it({id: 'phone', kind: 'prop', variant: 'phone', x0: -20, y0: G_Y - 60, scale: 0.55, vx: 0.9, v0: 1.25, spin: 150, rest: 90, mass: 0.05}),
	it({id: 'shoe', kind: 'prop', variant: 'shoe', x0: 640, y0: G_Y + 30, scale: 0.6, v0: 1.6, spin: 190, rest: 0, mass: 0.05}),
	it({id: 'book', kind: 'prop', variant: 'book', x0: -120, y0: G_Y + 20, scale: 0.55, vx: 0.6, v0: 0.8, spin: -70, rest: 0, mass: 0.05}),
	it({id: 'plant', kind: 'prop', variant: 'plant', x0: -260, y0: G_Y - 10, scale: 0.75, v0: 0.1, spin: 6, rest: 95, mass: 0.3}),
	it({id: 'bag', kind: 'prop', variant: 'bag', x0: 800, y0: G_Y - 10, scale: 0.5, v0: 0.7, spin: -30, rest: 30, mass: 0.1}),
	it({id: 'simit1', kind: 'simit', variant: 'simit', x0: 250, y0: G_Y - 170, scale: 0.5, v0: 0.7, spin: 60, rest: 0, mass: 0.02}),
	it({id: 'simit2', kind: 'simit', variant: 'simit', x0: 290, y0: G_Y - 170, scale: 0.5, v0: 1.0, spin: -80, rest: 0, mass: 0.02}),
	it({id: 'simit3', kind: 'simit', variant: 'simit', x0: 320, y0: G_Y - 170, scale: 0.5, v0: 0.55, spin: 45, rest: 0, mass: 0.02}),
];

export type ItemState = {x: number; y: number; rot: number; h: number; phase: 'pre' | 'float' | 'fall' | 'landed'; vy: number; sinceLand: number};

/** Height (m) at which gravity returns, and the frame at which the item lands. */
export const landing = (v0: number, h0 = 0) => {
	const hOn = h0 + 1 + v0 * 10;
	const tFall = Math.sqrt((2 * hOn) / G);
	return {hOn, frame: Math.round(ON_FRAME + (tFall / FALL_SLOWMO) * FPS), speed: Math.sqrt(2 * G * hOn)};
};

export const itemState = (item: Item, gf: number): ItemState => {
	const s = storySec(gf);
	const {hOn, frame: landF} = landing(item.v0);
	if (gf < OFF_FRAME) {
		return {x: item.x0 + item.vx * s, y: item.y0, rot: 0, h: 0, phase: 'pre', vy: 0, sinceLand: 0};
	}
	if (gf < ON_FRAME) {
		const h = (s / 10) ** 2 + item.v0 * s;
		return {x: item.x0 + item.vx * s, y: item.y0 - h * PX_PER_M, rot: item.spin * s, h, phase: 'float', vy: item.v0, sinceLand: 0};
	}
	const t = fallSec(gf);
	if (gf < landF) {
		const h = hOn - 0.5 * G * t * t;
		return {x: item.x0 + item.vx * (10 + t), y: item.y0 - h * PX_PER_M, rot: item.spin * (10 + t * 1.6), h, phase: 'fall', vy: -G * t, sinceLand: 0};
	}
	const tl = Math.sqrt((2 * hOn) / G);
	const since = gf - landF;
	// small damped bounce on impact
	const bounce = Math.abs(Math.sin(since * 0.45)) * Math.exp(-since / 6) * Math.min(40, hOn * 6);
	const spinEnd = item.spin * (10 + tl * 1.6);
	const settle = Math.min(1, since / 8);
	return {x: item.x0 + item.vx * (10 + tl), y: item.y0 - bounce, rot: spinEnd + (item.rest - spinEnd) * settle, h: 0, phase: 'landed', vy: 0, sinceLand: since};
};

// ─────────────────────────── HERO ("sen") ───────────────────────────
export const HERO_X0 = 520;
export const HERO_SCALE = 0.31;
export const HERO_PELVIS_GROUND = PELVIS_Y;
export const HERO_V = 2.8; // m/s at the instant gravity vanished
export const JUMP_START = 316; // he pushed off just before 08:47:00
export const BALCONY_FLOOR = 9;
export const FLOOR_H = 300;
/** Rail top height above the sidewalk in metres (matches <Apartment> geometry). */
export const RAIL_M = ((BALCONY_FLOOR + 1) * FLOOR_H - FLOOR_H * 0.82 + 70) / PX_PER_M;
const HANG_OFFSET_M = 1.12; // pelvis below the hands when hanging

export const heroHeight = (gf: number): number => {
	if (gf < JUMP_START) return 0;
	if (gf < OFF_FRAME) {
		// normal jump arc, launched at ~3.9 m/s (reaches 2.8 m/s at 08:47:00)
		const t = (gf - JUMP_START) / FPS;
		return 3.9 * t - 0.5 * G * t * t;
	}
	const hOff = 3.9 * ((OFF_FRAME - JUMP_START) / FPS) - 0.5 * G * ((OFF_FRAME - JUMP_START) / FPS) ** 2;
	const free = hOff + (storySec(gf) / 10) ** 2 + HERO_V * storySec(gf);
	const hang = RAIL_M - HANG_OFFSET_M;
	if (gf < GRAB_FRAME) return Math.min(free, hang + 0.3);
	return hang;
};

export const heroX = (gf: number): number => {
	if (gf < JUMP_START) return HERO_X0 - 1.3 * PX_PER_M * ((JUMP_START - gf) / FPS);
	return HERO_X0 + Math.min(storySec(Math.min(gf, GRAB_FRAME)) + (OFF_FRAME - JUMP_START) / FPS, 11) * 0.05 * PX_PER_M;
};

export const heroY = (gf: number) => HERO_PELVIS_GROUND - heroHeight(gf) * PX_PER_M;

/** Every impact the sound designer should hear: [frame, loudness 0..1]. */
export const landingEvents = (): {frame: number; gain: number; id: string}[] =>
	ITEMS.map((i) => {
		const l = landing(i.v0);
		return {id: i.id, frame: l.frame, gain: Math.min(1, i.mass * (0.4 + l.speed / 12))};
	}).sort((a, b) => a.frame - b.frame);
