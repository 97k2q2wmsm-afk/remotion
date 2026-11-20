// Cinematic camera rig: shot framing × movement path × lens × handheld noise.
// Pure function of normalized shot time t∈[0,1] → camera position/target/fov.
// Easing comes from Motion Canvas (already the project's motion library).
import {easeInOutCubic, easeInOutSine, easeOutCubic} from '@motion-canvas/core';
import type {CameraSpec, FocusTarget} from '../schema';
import {lensToFov} from '../schema';
import {noise1} from './noise';

export type Vec3 = [number, number, number];
export type CameraPose = {position: Vec3; target: Vec3; fov: number; roll: number; focusDistance: number};

/** Where the scene's subject sits and how big the stage is — supplied by the environment. */
export type Stage = {
	subject: Vec3;
	/** Typical size of the subject (m) — scales the framing distances. */
	subjectSize: number;
	/** Direction the "front" of the set faces (radians around Y). Camera starts on this side. */
	heading: number;
	/** Ground height lookup so the camera never goes underground. */
	groundAt: (x: number, z: number) => number;
	/** World radius of the built set (aerial shots stay inside it). */
	radius: number;
	/** Optional hard limits for the lens (interiors keep the camera inside the room). */
	bounds?: {min: Vec3; max: Vec3};
};

// Framing per shot: distance and height as multiples of subjectSize, plus pitch bias.
// lookAhead pushes the aim point past the subject so wide/aerial frames hold the horizon.
const SHOT = {
	aerial_establishing: {dist: 7.5, height: 2.4, side: 0, lookUp: 0, lookAhead: 3.2},
	wide: {dist: 4, height: 0.75, side: 0, lookUp: 0.15, lookAhead: 1},
	medium: {dist: 1.9, height: 0.5, side: 0.12, lookUp: 0.35, lookAhead: 0},
	close_up: {dist: 1.0, height: 0.45, side: 0.05, lookUp: 0.45, lookAhead: 0},
	low_angle: {dist: 1.6, height: 0.08, side: 0.15, lookUp: 0.75, lookAhead: 0},
	over_shoulder: {dist: 0.9, height: 0.5, side: 0.32, lookUp: 0.45, lookAhead: 0},
} as const;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const cameraPose = (
	spec: CameraSpec,
	stage: Stage,
	t: number,
	seconds: number,
	frame: {width: number; height: number},
): CameraPose => {
	const S = SHOT[spec.shot];
	const size = stage.subjectSize;
	const e = easeInOutSine(t);
	const ec = easeInOutCubic(t);
	let d = S.dist * size;
	let h = S.height * size;
	let angle = stage.heading;
	let lateral = S.side * size;
	let forward = 0; // camera + target slide along the view direction
	let targetLift = S.lookUp * size * 0.25;
	let fovMul = 1;
	let roll = 0;

	switch (spec.movement) {
		case 'static':
			lateral += Math.sin(t * Math.PI) * size * 0.02;
			break;
		case 'slow_forward_dolly':
			d *= 1 - 0.28 * e;
			break;
		case 'push_in':
			d *= 1 - 0.45 * ec;
			fovMul = 1 - 0.12 * ec;
			break;
		case 'dolly_out':
			d *= 0.72 + 0.5 * easeOutCubic(t);
			h *= 0.85 + 0.35 * e;
			break;
		case 'tracking_left':
		case 'tracking_right': {
			const dir = spec.movement === 'tracking_left' ? -1 : 1;
			lateral += dir * (e - 0.5) * size * 1.6;
			break;
		}
		case 'crane_up':
			h = h * 0.25 + (h + size * 2.2) * e;
			targetLift -= size * 0.1 * e;
			break;
		case 'crane_down':
			h = h * 0.25 + (h + size * 2.2) * (1 - e);
			break;
		case 'aerial_flyover':
			h = Math.max(h, size * 3.5);
			forward = (e - 0.35) * size * 5;
			angle += (e - 0.5) * 0.25;
			break;
		case 'orbit':
			angle += (e - 0.5) * 1.1;
			break;
		case 'handheld':
			d *= 1 - 0.08 * e;
			break;
	}

	// Camera on a circle around the subject at `angle`, `d` away, `h` up.
	const dirX = Math.sin(angle);
	const dirZ = Math.cos(angle);
	const rightX = Math.cos(angle);
	const rightZ = -Math.sin(angle);
	let position: Vec3 = [
		stage.subject[0] + dirX * d + rightX * lateral - dirX * forward,
		stage.subject[1] + h,
		stage.subject[2] + dirZ * d + rightZ * lateral - dirZ * forward,
	];
	const ahead = S.lookAhead * size;
	let target: Vec3 = [
		stage.subject[0] + rightX * lateral * 0.5 - dirX * (forward * 1.15 + ahead),
		stage.subject[1] + targetLift + size * 0.15,
		stage.subject[2] + rightZ * lateral * 0.5 - dirZ * (forward * 1.15 + ahead),
	];

	// Handheld: layered smooth noise (breathing + operator sway + micro jitter).
	const shake = spec.movement === 'handheld' ? Math.max(0.6, spec.shake) : spec.shake;
	if (shake > 0) {
		const k = shake * Math.min(1, size * 0.12 + 0.1);
		const s = seconds;
		const j: Vec3 = [
			(noise1(s * 0.7, 1) * 0.6 + noise1(s * 2.3, 2) * 0.25 + noise1(s * 9, 3) * 0.04) * k,
			(noise1(s * 0.5, 4) * 0.4 + noise1(s * 2.9, 5) * 0.2 + noise1(s * 11, 6) * 0.03) * k,
			noise1(s * 0.6, 7) * 0.3 * k,
		];
		position = add(position, j);
		target = add(target, scale(j, 0.4));
		roll = noise1(s * 0.8, 8) * 0.012 * shake;
	}

	// Keep the lens above terrain and inside the set's bounds.
	const floor = stage.groundAt(position[0], position[2]) + 0.35;
	if (position[1] < floor) position[1] = floor;
	if (stage.bounds) position = position.map((v, i) => Math.min(stage.bounds!.max[i], Math.max(stage.bounds!.min[i], v))) as Vec3;

	const fov = lensToFov(spec.lens, frame.width, frame.height) * fovMul;

	// Rack focus: blend between foreground (40 % of subject distance), subject, background (×3.5).
	const subjDist = dist(position, stage.subject);
	const focusOf = (f: FocusTarget) => (f === 'foreground' ? subjDist * 0.4 : f === 'background' ? subjDist * 3.5 : subjDist);
	const ft = spec.focus_transition;
	const pull = ft ? easeInOutCubic(Math.min(1, Math.max(0, (t - 0.3) / 0.4))) : 0;
	const focusDistance = ft ? focusOf(ft.from) + (focusOf(ft.to) - focusOf(ft.from)) * pull : subjDist;

	return {position, target, fov, roll, focusDistance};
};
