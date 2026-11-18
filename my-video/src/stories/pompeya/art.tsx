import React from 'react';
import {random, useCurrentFrame} from 'remotion';
import {Blob, Circle, INK} from '../../engine/Shapes';

/** Sky gradient covering the frame with generous bleed for camera moves. */
export const Sky: React.FC<{id: string; stops: [number, string][]}> = ({id, stops}) => (
	<g>
		<defs>
			<linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
				{stops.map(([o, c]) => (
					<stop key={o} offset={o} stopColor={c} />
				))}
			</linearGradient>
		</defs>
		<rect x={-600} y={-800} width={2280} height={3500} fill={`url(#sky-${id})`} />
	</g>
);

export const Sun: React.FC<{x: number; y: number; r: number; color: string}> = ({x, y, r, color}) => (
	<g>
		<circle cx={x} cy={y} r={r * 2.6} fill={color} opacity={0.18} />
		<circle cx={x} cy={y} r={r * 1.6} fill={color} opacity={0.3} />
		<circle cx={x} cy={y} r={r} fill="#fff4d6" stroke={INK} strokeWidth={6} />
	</g>
);

export const CloudBank: React.FC<{x: number; y: number; s: number; fill: string; seed: string}> = ({x, y, s, fill, seed}) => {
	const frame = useCurrentFrame();
	const circles: Circle[] = new Array(6).fill(0).map((_, i) => ({
		cx: x + (i - 2.5) * 70 * s + Math.sin(frame * 0.01 + i) * 4,
		cy: y - Math.sin((i / 5) * Math.PI) * 40 * s,
		r: (45 + random(`${seed}${i}`) * 30) * s,
	}));
	return <Blob circles={circles} fill={fill} stroke={5} highlight="rgba(255,255,255,0.35)" />;
};

/**
 * Mount Vesuvius. `erupt` (0..1) grows the Plinian column, `glow` lights the crater/lava,
 * `green` blends from a calm green mountain to a scorched one.
 */
export const Vesuvius: React.FC<{
	x: number;
	y: number;
	s: number;
	erupt: number;
	glow: number;
	green: number;
	seed: string;
}> = ({x, y, s, erupt, glow, green, seed}) => {
	const frame = useCurrentFrame();
	const body = green > 0.5 ? '#5f8a4a' : '#5b4a42';
	const ridge = green > 0.5 ? '#46703a' : '#41332d';
	const hi = green > 0.5 ? '#86ad62' : '#7a655a';
	const craterY = -455;
	const H = erupt * 1450;
	const col: Circle[] = [];
	if (erupt > 0) {
		const n = 26;
		for (let k = 0; k < n; k++) {
			const p = k / (n - 1);
			const h = p * H;
			const wob = Math.sin(frame * 0.09 + k * 1.3) * 10 + Math.sin(frame * 0.05 + k) * 8;
			const r = 55 + p * 120 + random(`${seed}-c${k}`) * 30;
			col.push({cx: 10 + wob + (random(`${seed}-x${k}`) - 0.5) * 60 * p, cy: craterY - h, r: r * Math.min(1, erupt * 3)});
			if (p > 0.15) {
				col.push({cx: 10 + wob + 80 * p, cy: craterY - h + 30, r: r * 0.75});
				col.push({cx: 10 + wob - 80 * p, cy: craterY - h + 20, r: r * 0.7});
			}
		}
		// Umbrella ("pine tree", as Pliny the Younger described it)
		const um = Math.max(0, (erupt - 0.55) / 0.45);
		if (um > 0) {
			for (let k = 0; k < 16; k++) {
				const side = (k / 15 - 0.5) * 2;
				const spread = um * 620;
				col.push({
					cx: 10 + side * spread + Math.sin(frame * 0.06 + k) * 12,
					cy: craterY - H + Math.abs(side) * 70 + Math.sin(k * 2.1) * 30,
					r: (110 + random(`${seed}-u${k}`) * 70) * (0.5 + um * 0.5),
				});
			}
		}
	}
	const lava = glow > 0;
	return (
		<g transform={`translate(${x} ${y}) scale(${s})`}>
			{erupt > 0 ? (
				<g>
					<Blob circles={col} fill="#4a403b" shade="#3a312d" highlight="#6b5f57" stroke={8} />
					{/* hot underside of the column */}
					{col.slice(0, 10).map((c, i) => (
						<circle key={i} cx={c.cx} cy={c.cy + c.r * 0.3} r={c.r * 0.6} fill="#ff6a1a" opacity={0.28 * glow} />
					))}
				</g>
			) : (
				// lazy steam wisp
				<g opacity={0.7}>
					{[0, 1, 2].map((k) => (
						<circle key={k} cx={20 + Math.sin(frame * 0.03 + k) * 14 + k * 18} cy={craterY - 40 - k * 50 - ((frame * 0.4) % 50)} r={22 + k * 10} fill="#f4efe8" opacity={0.5 - k * 0.12} />
					))}
				</g>
			)}
			<path
				d="M -760 0 Q -520 -170 -360 -320 Q -280 -395 -180 -420 L -100 -405 L -50 -458 L 70 -462 L 130 -425 Q 280 -320 450 -185 Q 600 -70 760 0 Z"
				fill={body}
				stroke={INK}
				strokeWidth={8}
				strokeLinejoin="round"
			/>
			{/* ridges */}
			{[-260, -150, -40, 70, 180, 300].map((rx, i) => (
				<path key={i} d={`M ${rx * 0.25} -440 Q ${rx * 0.9} -220 ${rx * 1.9} 0`} fill="none" stroke={ridge} strokeWidth={14} strokeLinecap="round" opacity={0.8} />
			))}
			<path d="M -360 -320 Q -280 -395 -180 -420 L -100 -405 L -150 -380 Q -260 -340 -330 -270 Z" fill={hi} opacity={0.8} />
			{lava ? (
				<g>
					<ellipse cx={10} cy={craterY + 4} rx={62} ry={14} fill="#ffcf5a" opacity={glow} />
					{[[-20, 1], [40, 0.8], [-70, 0.6]].map(([dx, k], i) => (
						<path
							key={i}
							d={`M ${10 + dx * 0.3} ${craterY + 10} Q ${dx * 1.6} -300 ${dx * 3.2} ${-180 + i * 40}`}
							fill="none"
							stroke="#ff7b22"
							strokeWidth={12 * k}
							strokeLinecap="round"
							opacity={glow * (0.7 + 0.3 * Math.sin(frame * 0.2 + i))}
						/>
					))}
					<circle cx={10} cy={craterY} r={220} fill="#ff5a12" opacity={0.22 * glow} />
				</g>
			) : (
				<path d="M -50 -458 L 70 -462 L 50 -444 L -30 -442 Z" fill={ridge} />
			)}
		</g>
	);
};

type BuildingSpec = {x: number; w: number; h: number; roof: 'gable' | 'flat' | 'temple'; wall: string};

const WALLS = ['#e9c99a', '#d9a273', '#f0dcb4', '#c98762', '#e4b88a', '#b9714f'];

/** A row of Roman buildings. `collapse` lets a single roof fall in (index + progress). */
export const CityRow: React.FC<{
	seed: string;
	baseY: number;
	count: number;
	x0: number;
	x1: number;
	minH: number;
	maxH: number;
	tint?: string | null;
	windowsLit?: number;
	collapse?: {index: number; p: number} | null;
}> = ({seed, baseY, count, x0, x1, minH, maxH, tint = null, windowsLit = 0, collapse = null}) => {
	const frame = useCurrentFrame();
	const specs: BuildingSpec[] = [];
	const step = (x1 - x0) / count;
	for (let i = 0; i < count; i++) {
		const r = random(`${seed}-${i}`);
		specs.push({
			x: x0 + i * step + (random(`${seed}-o${i}`) - 0.5) * step * 0.3,
			w: step * (0.85 + random(`${seed}-w${i}`) * 0.5),
			h: minH + r * (maxH - minH),
			roof: r > 0.82 ? 'temple' : r > 0.25 ? 'gable' : 'flat',
			wall: WALLS[Math.floor(random(`${seed}-c${i}`) * WALLS.length)],
		});
	}
	return (
		<g>
			{specs.map((b, i) => {
				const top = baseY - b.h;
				const falling = collapse && collapse.index === i ? collapse.p : 0;
				const roofT = falling > 0 ? `translate(${falling * 40} ${falling * falling * 520}) rotate(${falling * 28} ${b.x + b.w / 2} ${top})` : undefined;
				return (
					<g key={i}>
						<rect x={b.x} y={top} width={b.w} height={b.h + 400} fill={tint ?? b.wall} stroke={INK} strokeWidth={6} />
						{!tint ? <rect x={b.x + b.w * 0.62} y={top} width={b.w * 0.38} height={b.h + 400} fill="#000" opacity={0.12} /> : null}
						{/* windows / doors */}
						{new Array(Math.max(1, Math.floor(b.w / 70))).fill(0).map((_, k) => {
							const wx = b.x + 22 + k * 70;
							const lit = windowsLit > 0 && random(`${seed}-l${i}-${k}`) > 0.4;
							const fl = 0.75 + 0.25 * Math.sin(frame * 0.3 + k + i);
							return (
								<g key={k}>
									<rect x={wx} y={top + 40} width={26} height={40} rx={4} fill={lit ? '#ffb347' : '#3a2318'} stroke={INK} strokeWidth={4} opacity={lit ? windowsLit * fl : 1} />
									{lit ? <circle cx={wx + 13} cy={top + 60} r={46} fill="#ff9a3c" opacity={0.25 * windowsLit * fl} /> : null}
								</g>
							);
						})}
						{b.roof === 'temple' ? (
							<g transform={roofT}>
								{[0.15, 0.38, 0.62, 0.85].map((k) => (
									<rect key={k} x={b.x + b.w * k - 9} y={top + 26} width={18} height={b.h * 0.7} fill={tint ?? '#f6ead0'} stroke={INK} strokeWidth={4} />
								))}
								<path d={`M ${b.x - 14} ${top + 28} L ${b.x + b.w / 2} ${top - 60} L ${b.x + b.w + 14} ${top + 28} Z`} fill={tint ?? '#f6ead0'} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
							</g>
						) : b.roof === 'gable' ? (
							<path
								transform={roofT}
								d={`M ${b.x - 16} ${top + 6} L ${b.x + b.w / 2} ${top - 46} L ${b.x + b.w + 16} ${top + 6} Z`}
								fill={tint ?? '#b6492c'}
								stroke={INK}
								strokeWidth={6}
								strokeLinejoin="round"
							/>
						) : (
							<rect transform={roofT} x={b.x - 8} y={top - 12} width={b.w + 16} height={16} fill={tint ?? '#9c3d24'} stroke={INK} strokeWidth={5} />
						)}
					</g>
				);
			})}
		</g>
	);
};

export const Column: React.FC<{x: number; y: number; h: number; w: number; broken?: number; fill?: string}> = ({
	x,
	y,
	h,
	w,
	broken = 0,
	fill = '#efe2c4',
}) => {
	const top = y - h * (1 - broken);
	return (
		<g>
			<rect x={x - w / 2 - 14} y={y - 24} width={w + 28} height={30} fill={fill} stroke={INK} strokeWidth={6} />
			<rect x={x - w / 2} y={top} width={w} height={h * (1 - broken)} fill={fill} stroke={INK} strokeWidth={7} />
			{[0.25, 0.5, 0.75].map((k) => (
				<line key={k} x1={x - w / 2 + w * k} y1={top + 10} x2={x - w / 2 + w * k} y2={y - 30} stroke="#c9b48c" strokeWidth={5} />
			))}
			<rect x={x + w * 0.15} y={top} width={w * 0.35} height={h * (1 - broken)} fill="#000" opacity={0.1} />
			{broken > 0 ? (
				<path d={`M ${x - w / 2} ${top} L ${x - w / 4} ${top - 22} L ${x} ${top - 6} L ${x + w / 4} ${top - 30} L ${x + w / 2} ${top} Z`} fill={fill} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
			) : (
				<g>
					<rect x={x - w / 2 - 20} y={top - 30} width={w + 40} height={30} fill={fill} stroke={INK} strokeWidth={6} />
					<path d={`M ${x - w / 2 - 20} ${top - 30} q -18 15 0 30 M ${x + w / 2 + 20} ${top - 30} q 18 15 0 30`} fill="none" stroke={INK} strokeWidth={6} />
				</g>
			)}
		</g>
	);
};

export const Cypress: React.FC<{x: number; y: number; h: number; fill?: string}> = ({x, y, h, fill = '#2f5b34'}) => {
	const frame = useCurrentFrame();
	const sway = Math.sin(frame * 0.04 + x) * 3;
	return (
		<g transform={`rotate(${sway} ${x} ${y})`}>
			<path d={`M ${x} ${y - h} Q ${x + h * 0.16} ${y - h * 0.5} ${x + h * 0.1} ${y} L ${x - h * 0.1} ${y} Q ${x - h * 0.16} ${y - h * 0.5} ${x} ${y - h} Z`} fill={fill} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
			<path d={`M ${x} ${y - h * 0.9} Q ${x + h * 0.08} ${y - h * 0.5} ${x + h * 0.06} ${y}`} fill="none" stroke="#000" strokeOpacity={0.18} strokeWidth={h * 0.06} />
		</g>
	);
};

/** Layered animated sea. */
export const Sea: React.FC<{y: number; colors: string[]; reflect?: string | null; reflectX?: number}> = ({y, colors, reflect = null, reflectX = 540}) => {
	const frame = useCurrentFrame();
	return (
		<g>
			<rect x={-600} y={y} width={2280} height={2000} fill={colors[0]} />
			{reflect ? (
				<g opacity={0.8}>
					{new Array(9).fill(0).map((_, k) => (
						<rect
							key={k}
							x={reflectX - 80 + Math.sin(frame * 0.1 + k) * 30 - k * 6}
							y={y + 20 + k * 38}
							width={160 + k * 14}
							height={10}
							rx={5}
							fill={reflect}
							opacity={0.8 - k * 0.07}
						/>
					))}
				</g>
			) : null}
			{colors.slice(1).map((c, i) => {
				const yy = y + 90 + i * 150;
				const amp = 14 + i * 8;
				const len = 160 + i * 40;
				let d = `M -600 ${yy}`;
				for (let x = -600; x <= 1700; x += len / 2) {
					const k = Math.round(x / (len / 2));
					d += ` Q ${x + len / 4} ${yy + (k % 2 === 0 ? -amp : amp) + Math.sin(frame * 0.06 + i) * 6} ${x + len / 2} ${yy}`;
				}
				d += ' L 1700 3000 L -600 3000 Z';
				return (
					<path
						key={i}
						d={d}
						transform={`translate(${Math.sin(frame * 0.03 + i) * 40 + ((frame * (0.6 + i * 0.4)) % len)} 0)`}
						fill={c}
						stroke={INK}
						strokeWidth={5}
					/>
				);
			})}
		</g>
	);
};

/** Roman galley with animated oars. */
export const Galley: React.FC<{x: number; y: number; s: number; sail: string; seed: string; children?: React.ReactNode}> = ({
	x,
	y,
	s,
	sail,
	seed,
	children,
}) => {
	const frame = useCurrentFrame();
	const roll = Math.sin(frame * 0.07 + random(seed) * 5) * 2.5;
	const heave = Math.sin(frame * 0.09 + random(seed) * 5) * 8;
	const stroke = Math.sin(frame * 0.22);
	return (
		<g transform={`translate(${x} ${y + heave}) rotate(${roll}) scale(${s})`}>
			{/* oars */}
			{new Array(9).fill(0).map((_, k) => {
				const ox = -300 + k * 72;
				const a = 30 + stroke * 18;
				const rad = (a * Math.PI) / 180;
				return (
					<line key={k} x1={ox} y1={-10} x2={ox - Math.cos(rad) * 60} y2={-10 + Math.sin(rad) * 190} stroke="#6b3e1f" strokeWidth={10} strokeLinecap="round" />
				);
			})}
			{/* mast & sail */}
			<rect x={-12} y={-560} width={24} height={520} fill="#7a4a24" stroke={INK} strokeWidth={6} />
			<path d="M -230 -500 Q 0 -540 230 -500 Q 250 -330 220 -180 Q 0 -150 -220 -180 Q -250 -330 -230 -500 Z" fill={sail} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
			<path d="M 60 -500 Q 90 -340 70 -168 L 220 -180 Q 250 -330 230 -500 Z" fill="#000" opacity={0.12} />
			<circle cx={0} cy={-340} r={60} fill="none" stroke="#f2c25b" strokeWidth={10} />
			<path d="M -30 -340 L 30 -340 M 0 -370 L 0 -310" stroke="#f2c25b" strokeWidth={10} strokeLinecap="round" />
			{children}
			{/* hull */}
			<path
				d="M -380 -60 L 360 -60 Q 420 -70 470 -150 Q 480 -60 420 20 Q 0 70 -360 20 Q -420 -10 -380 -60 Z"
				fill="#8a4a26"
				stroke={INK}
				strokeWidth={8}
				strokeLinejoin="round"
			/>
			<path d="M -370 -30 L 420 -30" stroke="#c9a24a" strokeWidth={10} />
			<path d="M -360 10 Q 0 40 410 0" stroke="#5b2f17" strokeWidth={10} fill="none" />
			<circle cx={-420} cy={-40} r={10} fill={INK} />
		</g>
	);
};

/** Pyroclastic density current: a boiling front of ash with incandescent core. */
export const PyroCloud: React.FC<{x: number; y: number; s: number; seed: string; heat?: number}> = ({x, y, s, seed, heat = 1}) => {
	const frame = useCurrentFrame();
	const circles: Circle[] = [];
	for (let k = 0; k < 34; k++) {
		const r1 = random(`${seed}-${k}`);
		const r2 = random(`${seed}-y${k}`);
		const boil = Math.sin(frame * 0.12 + k * 1.7) * 14;
		circles.push({
			cx: (r1 - 0.5) * 1500,
			cy: -r2 * 900 + Math.abs(r1 - 0.5) * 500,
			r: 120 + random(`${seed}-r${k}`) * 160 + boil,
		});
	}
	return (
		<g transform={`translate(${x} ${y}) scale(${s})`}>
			<Blob circles={circles} fill="#5d524c" shade="#4d433e" stroke={10} />
			{circles.slice(0, 18).map((c, i) => (
				<circle key={i} cx={c.cx} cy={c.cy + c.r * 0.35} r={c.r * 0.55} fill="#ff6a1a" opacity={(0.16 + 0.1 * Math.sin(frame * 0.3 + i)) * heat} />
			))}
		</g>
	);
};

/** Ash-covered ground / dunes. */
export const Ground: React.FC<{y: number; fill: string; hill?: number}> = ({y, fill, hill = 40}) => (
	<path
		d={`M -600 ${y} Q -200 ${y - hill} 200 ${y} Q 600 ${y + hill} 1000 ${y - hill * 0.5} Q 1400 ${y - hill} 1700 ${y} L 1700 ${y + 2000} L -600 ${y + 2000} Z`}
		fill={fill}
		stroke={INK}
		strokeWidth={7}
	/>
);
