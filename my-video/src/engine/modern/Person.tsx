import React from 'react';
import {random, useCurrentFrame} from 'remotion';

/**
 * BAŞINA GELSEYDİ — modern parametric 2D character.
 *
 * Bold-outline cel style: every limb is drawn twice (ink pass, then colour pass) so the
 * silhouette gets one clean contour. The rig is joint based (shoulder/elbow, hip/knee,
 * torso lean, head tilt) so scenes can animate jumping, flailing, reaching, hanging and
 * falling with plain numbers. Origin = pelvis. Up is -y. ~570px tall at scale 1.
 */

export const INK = '#15121c';

export type Face = 'neutral' | 'happy' | 'shock' | 'scared' | 'scream' | 'determined' | 'awe' | 'relief' | 'dizzy';
export type Hair = 'messy' | 'short' | 'bun' | 'long' | 'curly' | 'bald' | 'cap' | 'hijab';
export type Top = 'hoodie' | 'shirt' | 'jacket' | 'dress' | 'apron';

export type Look = {
	skin: string;
	skinShade: string;
	hair: string;
	top: string;
	topShade: string;
	pants: string;
	shoes: string;
	hairStyle: Hair;
	topStyle: Top;
	mustache?: boolean;
	glasses?: boolean;
	beard?: boolean;
};

/** Limb angles in degrees. 0 = hanging straight down, positive swings toward -x. */
export type Pose = {
	lean: number;
	head: number;
	armL: [number, number];
	armR: [number, number];
	legL: [number, number];
	legR: [number, number];
};

export const POSES = {
	stand: {lean: 0, head: 0, armL: [-8, 6], armR: [8, -6], legL: [-4, 0], legR: [4, 0]},
	float: {lean: -6, head: -4, armL: [-120, -30], armR: [120, 30], legL: [-24, 30], legR: [18, 46]},
	flail: {lean: 8, head: 10, armL: [-150, -40], armR: [160, 50], legL: [-40, 60], legR: [30, 20]},
	jump: {lean: -10, head: -8, armL: [-160, -10], armR: [165, 10], legL: [-30, 70], legR: [40, 80]},
	reach: {lean: -8, head: -20, armL: [-30, 20], armR: [142, 8], legL: [-20, 40], legR: [26, 30]},
	hang: {lean: 0, head: -10, armL: [-176, 6], armR: [176, -6], legL: [-6, 14], legR: [10, 22]},
	fall: {lean: 10, head: 14, armL: [-140, 40], armR: [150, -50], legL: [-50, 20], legR: [40, 60]},
	sit: {lean: -6, head: 6, armL: [-30, 50], armR: [34, -60], legL: [-80, -84], legR: [-74, -80]},
	cheer: {lean: 0, head: -6, armL: [-150, -20], armR: [150, 20], legL: [-10, 0], legR: [10, 0]},
	hold: {lean: 0, head: 6, armL: [-20, 90], armR: [24, -96], legL: [-4, 0], legR: [4, 0]},
} satisfies Record<string, Pose>;

export const mixPose = (a: Pose, b: Pose, t: number): Pose => {
	const l = (x: number, y: number) => x + (y - x) * t;
	const p = (x: [number, number], y: [number, number]): [number, number] => [l(x[0], y[0]), l(x[1], y[1])];
	return {
		lean: l(a.lean, b.lean),
		head: l(a.head, b.head),
		armL: p(a.armL, b.armL),
		armR: p(a.armR, b.armR),
		legL: p(a.legL, b.legL),
		legR: p(a.legR, b.legR),
	};
};

/** Adds organic secondary motion (flailing / swimming in the air) to a pose. */
export const wobblePose = (pose: Pose, frame: number, amount: number, seed = 0): Pose => {
	const w = (k: number, sp: number) => Math.sin(frame * sp + seed * 3.1 + k) * amount;
	return {
		lean: pose.lean + w(0, 0.07) * 6,
		head: pose.head + w(1, 0.09) * 6,
		armL: [pose.armL[0] + w(2, 0.21) * 22, pose.armL[1] + w(3, 0.27) * 20],
		armR: [pose.armR[0] + w(4, 0.19) * 22, pose.armR[1] + w(5, 0.25) * 20],
		legL: [pose.legL[0] + w(6, 0.17) * 16, pose.legL[1] + w(7, 0.23) * 18],
		legR: [pose.legR[0] + w(8, 0.15) * 16, pose.legR[1] + w(9, 0.2) * 18],
	};
};

const rad = (d: number) => (d * Math.PI) / 180;
const dir = (a: number): [number, number] => [-Math.sin(rad(a)), Math.cos(rad(a))];

const Limb: React.FC<{
	x: number;
	y: number;
	a: [number, number];
	l1: number;
	l2: number;
	w: number;
	c1: string;
	c2: string;
	end: 'hand' | 'shoe';
	endColor: string;
	cuff: string | null;
}> = ({x, y, a, l1, l2, w, c1, c2, end, endColor, cuff}) => {
	const [dx1, dy1] = dir(a[0]);
	const [dx2, dy2] = dir(a[0] + a[1]);
	const x2 = x + dx1 * l1;
	const y2 = y + dy1 * l1;
	const x3 = x2 + dx2 * l2;
	const y3 = y2 + dy2 * l2;
	const seg = (ax: number, ay: number, bx: number, by: number, width: number, color: string) => (
		<line x1={ax} y1={ay} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeLinecap="round" />
	);
	const endAngle = a[0] + a[1];
	const endEl =
		end === 'hand' ? (
			<circle cx={x3 + dx2 * 6} cy={y3 + dy2 * 6} r={w * 0.62} fill={endColor} stroke={INK} strokeWidth={6} />
		) : (
			<g transform={`translate(${x3 + dx2 * 8} ${y3 + dy2 * 8}) rotate(${endAngle})`}>
				<path d={`M ${-w * 0.55} -10 Q ${-w * 0.6} 22 ${-w * 0.2} 24 L ${w * 1.25} 24 Q ${w * 1.4} 6 ${w * 0.6} -6 Z`} fill={endColor} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
				<path d={`M ${-w * 0.45} 16 L ${w * 1.2} 16`} stroke="#fff" strokeWidth={6} opacity={0.85} />
			</g>
		);
	return (
		<g>
			{seg(x, y, x2, y2, w + 12, INK)}
			{seg(x2, y2, x3, y3, w * 0.9 + 12, INK)}
			{seg(x, y, x2, y2, w, c1)}
			{seg(x2, y2, x3, y3, w * 0.9, c2)}
			{cuff ? seg(x3 - dx2 * 10, y3 - dy2 * 10, x3 - dx2 * 2, y3 - dy2 * 2, w * 0.95, cuff) : null}
			{endEl}
		</g>
	);
};

const FACES: Record<Face, {brow: number; lift: number; eye: number; pupil: number; mouth: string}> = {
	neutral: {brow: 0, lift: 0, eye: 1, pupil: 1, mouth: 'line'},
	happy: {brow: -3, lift: 3, eye: 0.9, pupil: 1, mouth: 'smile'},
	shock: {brow: 6, lift: 16, eye: 1.4, pupil: 0.55, mouth: 'o'},
	scared: {brow: 14, lift: 10, eye: 1.25, pupil: 0.65, mouth: 'wobble'},
	scream: {brow: 16, lift: 14, eye: 1.35, pupil: 0.55, mouth: 'scream'},
	determined: {brow: -12, lift: -2, eye: 0.85, pupil: 1, mouth: 'grit'},
	awe: {brow: 6, lift: 12, eye: 1.2, pupil: 0.9, mouth: 'o'},
	relief: {brow: 10, lift: 2, eye: 0.6, pupil: 1, mouth: 'smile'},
	dizzy: {brow: 8, lift: 6, eye: 1.1, pupil: 0.8, mouth: 'wobble'},
};

const HeadEl: React.FC<{look: Look; face: Face; gaze: [number, number]; frame: number; off: number; mouthOpen: number}> = ({
	look,
	face,
	gaze,
	frame,
	off,
	mouthOpen,
}) => {
	const f = FACES[face];
	const blinkCycle = (frame + Math.floor(off * 7)) % 83;
	const blink = face !== 'shock' && face !== 'scream' && blinkCycle < 3 ? 0.1 : 1;
	const eyeRy = 13 * f.eye * blink;
	const eyeRx = 11 * Math.min(1.25, f.eye);
	let mouth: React.ReactNode;
	if (f.mouth === 'smile') {
		mouth = <path d={`M -20 34 Q 2 ${54 + mouthOpen * 10} 22 32 Q 2 ${42 + mouthOpen * 4} -20 34 Z`} fill="#7b2430" stroke={INK} strokeWidth={5} strokeLinejoin="round" />;
	} else if (f.mouth === 'o') {
		mouth = <ellipse cx={2} cy={40} rx={11 + mouthOpen * 3} ry={15 + mouthOpen * 7} fill="#3b0d17" stroke={INK} strokeWidth={5} />;
	} else if (f.mouth === 'scream') {
		const h = 22 + Math.sin(frame * 0.6) * 3 + mouthOpen * 6;
		mouth = (
			<g>
				<path d={`M -24 30 Q 2 22 28 30 Q 24 ${34 + h * 2} 2 ${34 + h * 2} Q -20 ${34 + h * 2} -24 30 Z`} fill="#3b0d17" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
				<path d={`M -18 32 Q 2 28 22 32 L 20 38 Q 2 34 -16 38 Z`} fill="#fff" />
				<ellipse cx={2} cy={30 + h * 1.6} rx={12} ry={6} fill="#d0505e" />
			</g>
		);
	} else if (f.mouth === 'wobble') {
		const w = Math.sin(frame * 0.9) * 3;
		mouth = <path d={`M -18 40 Q -9 ${32 + w} 0 40 Q 9 ${48 - w} 20 38`} fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />;
	} else if (f.mouth === 'grit') {
		mouth = (
			<g>
				<rect x={-20} y={32} width={42} height={16} rx={6} fill="#fff" stroke={INK} strokeWidth={5} />
				<path d="M -20 40 L 22 40" stroke={INK} strokeWidth={3} />
			</g>
		);
	} else {
		mouth = <path d="M -14 38 Q 2 42 18 37" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />;
	}

	const hs = look.hairStyle;
	const back =
		hs === 'long' ? (
			<path d="M -64 -10 Q -84 110 -54 150 L 58 150 Q 88 110 66 -10 Q 0 -100 -64 -10 Z" fill={look.hair} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
		) : hs === 'bun' ? (
			<circle cx={18} cy={-82} r={30} fill={look.hair} stroke={INK} strokeWidth={6} />
		) : hs === 'hijab' ? (
			<path d="M -78 -6 Q -86 -96 2 -98 Q 90 -96 82 -6 L 92 120 Q 2 150 -88 120 Z" fill={look.top} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
		) : null;

	let front: React.ReactNode = null;
	if (hs === 'messy') {
		front = (
			<path
				d="M -62 6 Q -78 -40 -54 -66 Q -60 -92 -26 -88 Q -14 -112 14 -96 Q 40 -112 52 -84 Q 82 -80 70 -44 Q 82 -20 64 4 Q 58 -26 40 -34 Q 30 -18 8 -30 Q -4 -14 -24 -30 Q -44 -22 -62 6 Z"
				fill={look.hair}
				stroke={INK}
				strokeWidth={6}
				strokeLinejoin="round"
			/>
		);
	} else if (hs === 'short' || hs === 'long' || hs === 'bun') {
		front = (
			<path d="M -62 2 Q -70 -80 2 -82 Q 72 -80 64 2 Q 54 -36 26 -44 Q 6 -28 -22 -42 Q -50 -36 -62 2 Z" fill={look.hair} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
		);
	} else if (hs === 'curly') {
		const c = [[-54, -30, 22], [-38, -60, 24], [-8, -74, 25], [24, -72, 25], [50, -54, 23], [60, -24, 20]];
		front = (
			<g>
				{c.map(([x, y, r], i) => (
					<circle key={`o${i}`} cx={x} cy={y} r={r + 6} fill={INK} />
				))}
				{c.map(([x, y, r], i) => (
					<circle key={`f${i}`} cx={x} cy={y} r={r} fill={look.hair} />
				))}
			</g>
		);
	} else if (hs === 'cap') {
		front = (
			<g>
				<path d="M -62 -12 Q -64 -84 2 -86 Q 66 -84 64 -12 Z" fill={look.top} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
				<path d="M 30 -16 Q 90 -22 104 -6 Q 70 -2 30 -4 Z" fill={look.topShade} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
			</g>
		);
	} else if (hs === 'hijab') {
		front = <path d="M -66 30 Q -72 -78 2 -80 Q 76 -78 68 30 Q 62 -40 2 -46 Q -58 -40 -66 30 Z" fill={look.top} stroke={INK} strokeWidth={6} strokeLinejoin="round" />;
	} else {
		front = <ellipse cx={-18} cy={-50} rx={16} ry={7} fill="#fff" opacity={0.3} />;
	}

	return (
		<g>
			{back}
			{hs !== 'hijab' ? (
				<>
					<circle cx={-58} cy={8} r={14} fill={look.skin} stroke={INK} strokeWidth={5} />
					<circle cx={62} cy={8} r={14} fill={look.skin} stroke={INK} strokeWidth={5} />
				</>
			) : null}
			<path d="M -60 -6 Q -62 -76 2 -78 Q 66 -76 64 -6 Q 62 60 20 74 Q 2 80 -16 74 Q -58 60 -60 -6 Z" fill={look.skin} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
			<path d="M 34 -60 Q 70 -10 40 62 Q 62 40 62 -4 Q 60 -44 34 -60 Z" fill={look.skinShade} opacity={0.75} />
			{look.beard ? <path d="M -58 10 Q -50 88 2 92 Q 56 88 62 10 Q 44 56 2 60 Q -40 56 -58 10 Z" fill={look.hair} stroke={INK} strokeWidth={6} strokeLinejoin="round" /> : null}
			<circle cx={-34} cy={24} r={11} fill="#ff6f6f" opacity={face === 'scared' || face === 'scream' ? 0.12 : 0.28} />
			<circle cx={40} cy={24} r={11} fill="#ff6f6f" opacity={face === 'scared' || face === 'scream' ? 0.12 : 0.28} />
			{([-1, 1] as const).map((s) => (
				<g key={s}>
					{face === 'dizzy' ? (
						<path d={`M ${22 * s - 10 + 2} -8 L ${22 * s + 10 + 2} 8 M ${22 * s + 10 + 2} -8 L ${22 * s - 10 + 2} 8`} stroke={INK} strokeWidth={6} strokeLinecap="round" />
					) : (
						<>
							<ellipse cx={22 * s + 2} cy={0} rx={eyeRx} ry={eyeRy} fill="#fffdf6" stroke={INK} strokeWidth={4.5} />
							{blink > 0.5 ? (
								<>
									<circle cx={22 * s + 2 + gaze[0] * 4} cy={gaze[1] * 5} r={6.5 * f.pupil} fill={INK} />
									<circle cx={22 * s + 4 + gaze[0] * 4} cy={-3 + gaze[1] * 5} r={2.2} fill="#fff" />
								</>
							) : null}
						</>
					)}
					<path
						d={`M ${22 * s + 2 - 14 * s} ${-22 - f.lift - f.brow * 0.6} Q ${22 * s + 2} ${-30 - f.lift} ${22 * s + 2 + 14 * s} ${-24 - f.lift + f.brow * 0.5}`}
						fill="none"
						stroke={INK}
						strokeWidth={7}
						strokeLinecap="round"
					/>
				</g>
			))}
			{look.glasses ? (
				<g fill="none" stroke={INK} strokeWidth={5}>
					<circle cx={-20} cy={0} r={18} />
					<circle cx={24} cy={0} r={18} />
					<path d="M -2 0 L 6 0" />
				</g>
			) : null}
			<path d="M 6 6 Q 18 22 2 26" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
			{look.mustache ? <path d="M -22 30 Q -4 18 2 26 Q 8 18 28 30 Q 8 34 2 30 Q -4 34 -22 30 Z" fill={look.hair} stroke={INK} strokeWidth={4} strokeLinejoin="round" /> : null}
			{mouth}
			{front}
			{face === 'scared' || face === 'shock' || face === 'scream' ? (
				<path d="M 66 -40 Q 76 -24 66 -18 Q 56 -24 66 -40 Z" fill="#8fd3ff" stroke={INK} strokeWidth={3.5} />
			) : null}
		</g>
	);
};

export const Person: React.FC<{
	x: number;
	y: number;
	scale: number;
	rot?: number;
	flip?: boolean;
	look: Look;
	pose: Pose;
	face: Face;
	gaze?: [number, number];
	mouthOpen?: number;
	/** Walk cycle speed (0 = none). Overrides legs + arm swing. */
	walk?: number;
	seed: string;
	shadow?: number | null;
	item?: React.ReactNode;
}> = ({x, y, scale, rot = 0, flip = false, look, pose, face, gaze = [0, 0], mouthOpen = 0, walk = 0, seed, shadow = null, item = null}) => {
	const frame = useCurrentFrame();
	const off = random(seed);
	let p = pose;
	let bob = Math.sin((frame + off * 50) * 0.09) * 2;
	if (walk > 0) {
		const ph = (frame + off * 100) * 0.3 * walk;
		const s = Math.sin(ph);
		p = {
			...pose,
			armL: [-s * 26, 10],
			armR: [s * 26, -10],
			legL: [s * 30, Math.max(0, -Math.cos(ph)) * 40],
			legR: [-s * 30, Math.max(0, Math.cos(ph)) * 40],
		};
		bob = -Math.abs(Math.cos(ph)) * 10;
	}
	// Pose convention: arm/leg angles swing outward-left for the L limbs; mirror for drawing.
	const neg = (a: [number, number]): [number, number] => [-a[0], -a[1]];
	p = {...p, armL: neg(p.armL), legL: neg(p.legL), armR: neg(p.armR), legR: neg(p.legR)};
	const pants = look.topStyle === 'dress' ? look.top : look.pants;
	const skirt = look.topStyle === 'dress';
	return (
		<g transform={`translate(${x} ${y}) rotate(${rot}) scale(${flip ? -scale : scale} ${scale})`}>
			{shadow !== null ? <ellipse cx={0} cy={235 + shadow} rx={110 / (1 + Math.max(0, shadow) / 300)} ry={18} fill="#000" opacity={0.22 / (1 + Math.max(0, shadow) / 200)} /> : null}
			<g transform={`translate(0 ${bob})`}>
				{/* back leg */}
				<Limb x={20} y={0} a={p.legR} l1={118} l2={112} w={44} c1={pants} c2={skirt ? look.skinShade : pants} end="shoe" endColor={look.shoes} cuff={null} />
				<g transform={`rotate(${p.lean})`}>
					{/* back arm */}
					<Limb x={54} y={-176} a={p.armR} l1={92} l2={86} w={34} c1={look.topShade} c2={look.topStyle === 'shirt' || look.topStyle === 'apron' ? look.skinShade : look.topShade} end="hand" endColor={look.skinShade} cuff={null} />
				</g>
				{/* front leg */}
				<Limb x={-22} y={0} a={p.legL} l1={118} l2={112} w={46} c1={pants} c2={skirt ? look.skin : pants} end="shoe" endColor={look.shoes} cuff={null} />
				<g transform={`rotate(${p.lean})`}>
					{/* torso */}
					{skirt ? (
						<path d="M -64 -190 L 64 -190 L 96 40 Q 0 58 -96 40 Z" fill={look.top} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
					) : (
						<path d="M -66 -196 Q 0 -212 66 -196 L 70 -20 Q 72 12 40 18 L -40 18 Q -72 12 -70 -20 Z" fill={look.top} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
					)}
					<path d="M 26 -200 Q 66 -196 68 -150 L 70 -20 Q 70 10 40 16 Q 60 -60 26 -200 Z" fill={look.topShade} opacity={0.9} />
					{look.topStyle === 'hoodie' ? (
						<g>
							<path d="M -50 -204 Q 2 -170 54 -204 Q 30 -230 2 -230 Q -28 -230 -50 -204 Z" fill={look.topShade} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
							<path d="M -44 -64 L 44 -64 L 54 -10 L -54 -10 Z" fill={look.topShade} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
							<path d="M -14 -186 L -18 -130 M 18 -186 L 22 -132" stroke="#fff" strokeWidth={5} strokeLinecap="round" />
						</g>
					) : null}
					{look.topStyle === 'jacket' ? (
						<g>
							<path d="M 0 -200 L 0 16" stroke={INK} strokeWidth={5} />
							<path d="M -28 -202 L 0 -150 L 28 -202" fill="#fff" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
						</g>
					) : null}
					{look.topStyle === 'shirt' ? <path d="M -26 -204 L 2 -170 L 30 -204" fill="none" stroke={INK} strokeWidth={5} strokeLinejoin="round" /> : null}
					{look.topStyle === 'apron' ? <path d="M -50 -150 L 50 -150 L 60 30 L -60 30 Z" fill="#f4efe4" stroke={INK} strokeWidth={6} strokeLinejoin="round" /> : null}
					{/* neck + head */}
					<rect x={-20} y={-232} width={42} height={44} rx={10} fill={look.skinShade} stroke={INK} strokeWidth={6} />
					<g transform={`translate(0 -292) rotate(${p.head})`}>
						<HeadEl look={look} face={face} gaze={gaze} frame={frame} off={off} mouthOpen={mouthOpen} />
					</g>
					{/* front arm */}
					<Limb x={-56} y={-178} a={p.armL} l1={92} l2={86} w={36} c1={look.top} c2={look.topStyle === 'shirt' || look.topStyle === 'apron' ? look.skin : look.top} end="hand" endColor={look.skin} cuff={null} />
					{item}
				</g>
			</g>
		</g>
	);
};

/** Channel cast. KAAN is the recurring hero ("sen") of every episode. */
export const CAST = {
	kaan: {skin: '#f2bf94', skinShade: '#d89a6e', hair: '#2b1d1a', top: '#ff7a2f', topShade: '#d9561a', pants: '#24435c', shoes: '#f5f5f0', hairStyle: 'messy', topStyle: 'hoodie'},
	simitci: {skin: '#d9a07a', skinShade: '#b97c58', hair: '#3a3330', top: '#4b6b8a', topShade: '#3a536d', pants: '#3b3b44', shoes: '#4a3428', hairStyle: 'cap', topStyle: 'apron', mustache: true},
	ofis: {skin: '#f0c8a8', skinShade: '#d4a382', hair: '#5a3a26', top: '#2f4a7a', topShade: '#24395f', pants: '#2b2b33', shoes: '#1d1d22', hairStyle: 'short', topStyle: 'jacket', glasses: true},
	ogrenci: {skin: '#e8b48c', skinShade: '#c8916a', hair: '#1f1a18', top: '#3fae8f', topShade: '#2f8a71', pants: '#e6d3b0', shoes: '#ff5470', hairStyle: 'bun', topStyle: 'hoodie'},
	teyze: {skin: '#efc19e', skinShade: '#d29c7a', hair: '#7a2f45', top: '#c2416b', topShade: '#9c3254', pants: '#5b4a6e', shoes: '#3a2a2a', hairStyle: 'hijab', topStyle: 'dress'},
	amca: {skin: '#d8a585', skinShade: '#b98565', hair: '#d9d4cc', top: '#8a6a4a', topShade: '#6e5238', pants: '#4a4a52', shoes: '#2a2018', hairStyle: 'bald', topStyle: 'jacket', mustache: true},
	kurye: {skin: '#c98d66', skinShade: '#a8704c', hair: '#151212', top: '#f2c230', topShade: '#cf9f1c', pants: '#2d2d36', shoes: '#e44', hairStyle: 'curly', topStyle: 'jacket', beard: true},
	kadin: {skin: '#f5cfb0', skinShade: '#dcab88', hair: '#a4522b', top: '#6a5acd', topShade: '#5243a8', pants: '#232a3a', shoes: '#f0e6d2', hairStyle: 'long', topStyle: 'shirt'},
} satisfies Record<string, Look>;

export type CastName = keyof typeof CAST;
