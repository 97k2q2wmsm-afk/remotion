import React from 'react';
import {random, useCurrentFrame} from 'remotion';
import {INK} from './Shapes';

export type Expression = 'happy' | 'calm' | 'worried' | 'terrified' | 'determined' | 'awe' | 'sad';

export type CharacterPalette = {
	skin: string;
	skinShade: string;
	tunic: string;
	tunicShade: string;
	hair: string;
	accent: string;
	cloak: string | null;
};

export type CharacterProps = {
	x: number;
	y: number;
	scale: number;
	flip?: boolean;
	palette: CharacterPalette;
	hair: 'short' | 'curly' | 'long' | 'bald';
	beard?: boolean;
	headgear?: 'none' | 'tricorn' | 'hood' | 'laurel';
	expression: Expression;
	/** Pupil direction, -1..1 */
	look?: [number, number];
	/** Arm raise in degrees outward (0 = hanging, 90 = horizontal, 170 = up). */
	armL?: number;
	armR?: number;
	/** Bend at the elbow in degrees. */
	elbowL?: number;
	elbowR?: number;
	item?: 'none' | 'bread' | 'amphora' | 'lantern' | 'brush' | 'scroll';
	/** Walk/run cycle speed (0 = standing). */
	walk?: number;
	headTilt?: number;
	/** Extra mouth opening 0..1 (speaking / gasping). */
	mouth?: number;
	seed: string;
};

const EXPR: Record<Expression, {inner: number; lift: number; eye: number; pupil: number; mouth: string}> = {
	happy: {inner: -2, lift: 4, eye: 0.95, pupil: 1, mouth: 'smile'},
	calm: {inner: 0, lift: 0, eye: 1, pupil: 1, mouth: 'neutral'},
	worried: {inner: 11, lift: 5, eye: 1.08, pupil: 0.9, mouth: 'frown'},
	terrified: {inner: 15, lift: 14, eye: 1.35, pupil: 0.6, mouth: 'scream'},
	determined: {inner: -11, lift: -3, eye: 0.82, pupil: 1, mouth: 'grim'},
	awe: {inner: 7, lift: 12, eye: 1.18, pupil: 0.85, mouth: 'o'},
	sad: {inner: 13, lift: 0, eye: 0.85, pupil: 1, mouth: 'frown'},
};

const Item: React.FC<{item: CharacterProps['item']; frame: number}> = ({item, frame}) => {
	if (item === 'bread') {
		return (
			<g transform="translate(0 30)">
				<ellipse cx={0} cy={0} rx={48} ry={32} fill="#c98a3c" stroke={INK} strokeWidth={6} />
				<ellipse cx={-8} cy={-8} rx={28} ry={14} fill="#e2ad60" />
				{[-24, -8, 8, 24].map((x) => (
					<path key={x} d={`M ${x} -26 L ${x} 26`} stroke="#7a4a1d" strokeWidth={5} strokeLinecap="round" />
				))}
			</g>
		);
	}
	if (item === 'amphora') {
		return (
			<g transform="translate(0 20)">
				<path
					d="M -18 -40 L 18 -40 L 14 -20 Q 50 10 30 70 Q 20 110 0 130 Q -20 110 -30 70 Q -50 10 -14 -20 Z"
					fill="#b8532c"
					stroke={INK}
					strokeWidth={6}
					strokeLinejoin="round"
				/>
				<path d="M -14 -24 Q -44 -20 -36 10" fill="none" stroke={INK} strokeWidth={6} />
				<path d="M 14 -24 Q 44 -20 36 10" fill="none" stroke={INK} strokeWidth={6} />
				<path d="M -30 40 Q 0 50 30 40" fill="none" stroke="#e38a55" strokeWidth={6} />
			</g>
		);
	}
	if (item === 'lantern') {
		const flick = 0.85 + 0.15 * Math.sin(frame * 0.7) * Math.sin(frame * 0.23);
		return (
			<g transform="translate(0 50)">
				<circle cx={0} cy={40} r={160} fill="#ffb347" opacity={0.18 * flick} />
				<circle cx={0} cy={40} r={80} fill="#ffd27a" opacity={0.3 * flick} />
				<path d="M 0 -30 L 0 0" stroke={INK} strokeWidth={6} />
				<rect x={-30} y={0} width={60} height={80} rx={8} fill="#ffcf6b" stroke={INK} strokeWidth={6} />
				<ellipse cx={0} cy={44} rx={12} ry={20 * flick} fill="#fff4c2" />
				<path d="M -36 0 L 36 0 M -36 80 L 36 80" stroke={INK} strokeWidth={10} strokeLinecap="round" />
			</g>
		);
	}
	if (item === 'brush') {
		return (
			<g transform="translate(0 10) rotate(-30)">
				<rect x={-8} y={-10} width={16} height={90} rx={6} fill="#8a5a2b" stroke={INK} strokeWidth={5} />
				<path d="M -14 78 L 14 78 L 18 120 L -18 120 Z" fill="#e8d3a3" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
			</g>
		);
	}
	if (item === 'scroll') {
		return (
			<g transform="translate(0 20) rotate(15)">
				<rect x={-60} y={-14} width={120} height={28} rx={14} fill="#f0dfb5" stroke={INK} strokeWidth={6} />
				<circle cx={-60} cy={0} r={16} fill="#c9a96b" stroke={INK} strokeWidth={6} />
				<circle cx={60} cy={0} r={16} fill="#c9a96b" stroke={INK} strokeWidth={6} />
			</g>
		);
	}
	return null;
};

const Arm: React.FC<{
	side: 1 | -1;
	raise: number;
	elbow: number;
	p: CharacterPalette;
	item: CharacterProps['item'];
	frame: number;
}> = ({side, raise, elbow, p, item, frame}) => (
	<g transform={`translate(${92 * side} -452) rotate(${raise * side})`}>
		<rect x={-25} y={-14} width={50} height={96} rx={24} fill={p.tunic} stroke={INK} strokeWidth={6} />
		<g transform={`translate(0 80) rotate(${elbow * side})`}>
			<rect x={-19} y={-8} width={38} height={118} rx={19} fill={p.skin} stroke={INK} strokeWidth={6} />
			<g transform="translate(0 118)">
				<circle cx={0} cy={0} r={25} fill={p.skin} stroke={INK} strokeWidth={6} />
				<Item item={item} frame={frame} />
			</g>
		</g>
	</g>
);

/**
 * Parametric 2D character with bold contours: idle breathing, blinking, walk/run cycle,
 * articulated arms, gaze and expressive faces.
 */
export const Character: React.FC<CharacterProps> = ({
	x,
	y,
	scale,
	flip = false,
	palette: p,
	hair,
	beard = false,
	headgear = 'none',
	expression,
	look = [0, 0],
	armL = 8,
	armR = 8,
	elbowL = 0,
	elbowR = 0,
	item = 'none',
	walk = 0,
	headTilt = 0,
	mouth = 0,
	seed,
}) => {
	const frame = useCurrentFrame();
	const off = random(seed) * 100;
	const e = EXPR[expression];
	const breath = Math.sin((frame + off) * 0.09);
	const blinkCycle = (frame + Math.floor(off * 3)) % 97;
	const blink = expression !== 'terrified' && blinkCycle < 4 ? 0.12 : 1;
	const phase = (frame + off) * 0.32 * walk;
	const legSwing = walk > 0 ? Math.sin(phase) * 26 : 0;
	const bob = walk > 0 ? -Math.abs(Math.cos(phase)) * 14 : breath * 2;
	const armSwing = walk > 0 ? Math.sin(phase) * 24 : breath * 1.5;
	const tremble = expression === 'terrified' ? Math.sin(frame * 2.1) * 1.6 : 0;
	const eyeRy = 15 * e.eye * blink;

	let mouthEl: React.ReactNode;
	const mo = mouth;
	if (e.mouth === 'smile') {
		mouthEl = (
			<path d={`M -22 38 Q 0 ${58 + mo * 14} 22 38 Q 0 ${48 + mo * 6} -22 38 Z`} fill="#7a2a22" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
		);
	} else if (e.mouth === 'neutral') {
		mouthEl = mo > 0.1 ? (
			<ellipse cx={0} cy={42} rx={12} ry={4 + mo * 10} fill="#5a1d17" stroke={INK} strokeWidth={5} />
		) : (
			<path d="M -16 42 Q 0 46 16 42" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
		);
	} else if (e.mouth === 'frown') {
		mouthEl = (
			<path d={`M -18 ${48 + mo * 4} Q 0 ${34 - mo * 6} 18 ${48 + mo * 4}`} fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
		);
	} else if (e.mouth === 'scream') {
		const h = 24 + Math.sin(frame * 0.5) * 3 + mo * 6;
		mouthEl = (
			<g>
				<ellipse cx={0} cy={46} rx={19} ry={h} fill="#3d0f0c" stroke={INK} strokeWidth={5} />
				<ellipse cx={0} cy={46 + h * 0.5} rx={11} ry={h * 0.32} fill="#b0453a" />
			</g>
		);
	} else if (e.mouth === 'grim') {
		mouthEl = <path d="M -20 44 L 20 42" stroke={INK} strokeWidth={6} strokeLinecap="round" />;
	} else {
		mouthEl = <ellipse cx={0} cy={44} rx={10} ry={13 + mo * 6} fill="#3d0f0c" stroke={INK} strokeWidth={5} />;
	}

	const hairBack =
		hair === 'long' ? (
			<path d="M -70 -10 Q -92 120 -62 160 L -28 160 Q -36 70 0 64 Q 36 70 28 160 L 62 160 Q 92 120 70 -10 Q 0 -110 -70 -10 Z" fill={p.hair} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
		) : null;

	let hairFront: React.ReactNode = null;
	if (hair === 'short' || hair === 'long') {
		hairFront = (
			<path
				d="M -68 4 Q -76 -84 0 -86 Q 76 -84 68 4 Q 60 -38 30 -46 Q 10 -30 -20 -44 Q -52 -40 -68 4 Z"
				fill={p.hair}
				stroke={INK}
				strokeWidth={6}
				strokeLinejoin="round"
			/>
		);
	} else if (hair === 'curly') {
		const curls = [
			[-58, -30, 22],
			[-44, -58, 24],
			[-16, -74, 25],
			[16, -74, 25],
			[44, -58, 24],
			[58, -30, 22],
		];
		hairFront = (
			<g>
				{curls.map(([cx, cy, r], i) => (
					<circle key={`o${i}`} cx={cx} cy={cy} r={r + 6} fill={INK} />
				))}
				{curls.map(([cx, cy, r], i) => (
					<circle key={`f${i}`} cx={cx} cy={cy} r={r} fill={p.hair} />
				))}
			</g>
		);
	} else {
		hairFront = (
			<g>
				<path d="M -66 0 Q -70 -30 -52 -44 L -46 -10 Z" fill={p.hair} stroke={INK} strokeWidth={5} />
				<path d="M 66 0 Q 70 -30 52 -44 L 46 -10 Z" fill={p.hair} stroke={INK} strokeWidth={5} />
				<ellipse cx={-22} cy={-56} rx={16} ry={7} fill="#fff" opacity={0.35} />
			</g>
		);
	}

	return (
		<g transform={`translate(${x + tremble} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
			{/* ground shadow */}
			<ellipse cx={0} cy={4} rx={130} ry={22} fill="#000" opacity={0.25} />
			{/* legs */}
			{([-1, 1] as const).map((s) => (
				<g key={s} transform={`translate(${32 * s} -250) rotate(${legSwing * s})`}>
					<rect x={-23} y={-10} width={46} height={240} rx={22} fill={p.skin} stroke={INK} strokeWidth={6} />
					<rect x={-22} y={150} width={44} height={10} fill="#6b3e1f" />
					<rect x={-22} y={180} width={44} height={10} fill="#6b3e1f" />
					<ellipse cx={10} cy={238} rx={38} ry={16} fill="#6b3e1f" stroke={INK} strokeWidth={6} />
				</g>
			))}
			<g transform={`translate(0 ${bob})`}>
				{/* back arm */}
				<Arm side={-1} raise={armL + armSwing} elbow={elbowL} p={p} item="none" frame={frame} />
				{/* torso */}
				<g transform={`translate(0 -250) scale(1 ${1 + breath * 0.012}) translate(0 250)`}>
					<path d="M -90 -472 L 90 -472 L 116 -232 Q 0 -212 -116 -232 Z" fill={p.tunic} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
					<path d="M 20 -472 L 90 -472 L 116 -232 Q 70 -222 40 -220 Z" fill={p.tunicShade} />
					<path d="M -90 -472 L 90 -472 L 116 -232 Q 0 -212 -116 -232 Z" fill="none" stroke={INK} strokeWidth={7} strokeLinejoin="round" />
					<rect x={-100} y={-352} width={200} height={20} rx={6} fill={p.accent} stroke={INK} strokeWidth={5} />
					<path d="M -40 -472 Q 0 -440 40 -472" fill="none" stroke={INK} strokeWidth={5} />
					{p.cloak ? (
						<path
							d="M -96 -470 Q -30 -420 50 -330 L 112 -300 L 104 -240 Q 10 -320 -116 -380 Z"
							fill={p.cloak}
							stroke={INK}
							strokeWidth={6}
							strokeLinejoin="round"
						/>
					) : null}
				</g>
				{/* neck + head */}
				<rect x={-24} y={-520} width={48} height={56} fill={p.skinShade} stroke={INK} strokeWidth={6} />
				<g transform={`translate(0 -590) rotate(${headTilt + breath * 0.8})`}>
					{hairBack}
					{headgear === 'hood' ? (
						<path d="M -92 40 Q -100 -110 0 -112 Q 100 -110 92 40 L 70 110 L -70 110 Z" fill={p.cloak ?? p.accent} stroke={INK} strokeWidth={6} />
					) : null}
					<circle cx={-62} cy={8} r={15} fill={p.skin} stroke={INK} strokeWidth={5} />
					<circle cx={62} cy={8} r={15} fill={p.skin} stroke={INK} strokeWidth={5} />
					<ellipse cx={0} cy={0} rx={64} ry={76} fill={p.skin} stroke={INK} strokeWidth={7} />
					<path d="M 30 -60 Q 70 0 30 70 Q 60 40 62 0 Q 60 -40 30 -60 Z" fill={p.skinShade} opacity={0.7} />
					{beard ? (
						<path d="M -62 6 Q -58 92 0 100 Q 58 92 62 6 Q 44 52 0 56 Q -44 52 -62 6 Z" fill={p.hair} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
					) : null}
					{/* cheeks */}
					<circle cx={-38} cy={26} r={11} fill="#e0705a" opacity={0.3} />
					<circle cx={38} cy={26} r={11} fill="#e0705a" opacity={0.3} />
					{/* eyes */}
					{([-1, 1] as const).map((s) => (
						<g key={s}>
							<ellipse cx={24 * s} cy={0} rx={13} ry={eyeRy} fill="#fffaf0" stroke={INK} strokeWidth={4} />
							{blink > 0.5 ? (
								<circle cx={24 * s + look[0] * 5} cy={look[1] * 5} r={7.5 * e.pupil} fill={INK} />
							) : null}
							<line
								x1={10 * s}
								y1={-24 - e.lift - e.inner}
								x2={40 * s}
								y2={-28 - e.lift + e.inner * 0.3}
								stroke={INK}
								strokeWidth={8}
								strokeLinecap="round"
							/>
						</g>
					))}
					<path d="M 2 4 Q 14 24 -2 28" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
					{mouthEl}
					{hairFront}
					{headgear === 'tricorn' ? (
						<g transform="translate(0 -62)">
							<path d="M -108 10 Q 0 -30 108 10 Q 60 -16 0 -14 Q -60 -16 -108 10 Z" fill="#2b2320" stroke={INK} strokeWidth={6} />
							<path d="M -66 -2 Q -60 -70 0 -72 Q 60 -70 66 -2 Z" fill="#3a302b" stroke={INK} strokeWidth={6} />
							<path d="M -62 -8 L 62 -8" stroke="#a8874a" strokeWidth={8} />
						</g>
					) : null}
					{headgear === 'laurel' ? (
						<g>
							{[-1, 1].map((s) =>
								[0, 1, 2, 3].map((k) => (
									<ellipse
										key={`${s}${k}`}
										cx={s * (60 - k * 14)}
										cy={-30 - k * 12}
										rx={14}
										ry={7}
										transform={`rotate(${s * (60 - k * 15)} ${s * (60 - k * 14)} ${-30 - k * 12})`}
										fill="#6f9a3a"
										stroke={INK}
										strokeWidth={4}
									/>
								)),
							)}
						</g>
					) : null}
				</g>
				{/* front arm (holds the item) */}
				<Arm side={1} raise={armR - armSwing} elbow={elbowR} p={p} item={item} frame={frame} />
			</g>
		</g>
	);
};

export const PALETTES = {
	baker: {skin: '#e0a477', skinShade: '#c27f55', tunic: '#f1e3c2', tunicShade: '#d6c39c', hair: '#3b2416', accent: '#b5462f', cloak: null},
	merchant: {skin: '#c98b5e', skinShade: '#a86c44', tunic: '#2f6f8f', tunicShade: '#24566f', hair: '#1f140e', accent: '#e0b44a', cloak: '#b5462f'},
	woman: {skin: '#efb995', skinShade: '#d39472', tunic: '#c2504a', tunicShade: '#9c3c37', hair: '#4a2a18', accent: '#f0c75e', cloak: '#e9d7b0'},
	child: {skin: '#e6ad84', skinShade: '#c88c63', tunic: '#5d8f4f', tunicShade: '#4a733f', hair: '#2a1a10', accent: '#e9d7b0', cloak: null},
	pliny: {skin: '#dda07a', skinShade: '#b97e59', tunic: '#efe6d2', tunicShade: '#d2c6ab', hair: '#d8d4cc', accent: '#c9a24a', cloak: '#8e1f24'},
	archaeologist: {skin: '#f0c4a0', skinShade: '#d6a37f', tunic: '#5b4636', tunicShade: '#45352a', hair: '#e8e2d6', accent: '#a8874a', cloak: '#2f3f5c'},
} satisfies Record<string, CharacterPalette>;
