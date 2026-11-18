import React from 'react';
import {random} from 'remotion';
import {INK} from './Person';

/**
 * BAŞINA GELSEYDİ — modern city kit (SVG, 1080×1920 world units, ground-up = -y).
 * Everything is procedural and deterministic (seeded), drawn with bold ink contours and
 * cel shading so it matches the character style.
 */

const r = (seed: string) => random(seed);

export const SkyGrad: React.FC<{id: string; stops: [number, string][]; y0?: number; y1?: number}> = ({id, stops, y0 = -2400, y1 = 1900}) => (
	<>
		<defs>
			<linearGradient id={id} x1={0} y1={y0} x2={0} y2={y1} gradientUnits="userSpaceOnUse">
				{stops.map(([o, c]) => (
					<stop key={o} offset={o} stopColor={c} />
				))}
			</linearGradient>
		</defs>
		<rect x={-3000} y={y0} width={7080} height={y1 - y0 + 3000} fill={`url(#${id})`} />
	</>
);

export const Sun: React.FC<{x: number; y: number; r: number; color?: string}> = ({x, y, r: rr, color = '#ffe6a3'}) => (
	<g>
		<circle cx={x} cy={y} r={rr * 3.4} fill={color} opacity={0.12} />
		<circle cx={x} cy={y} r={rr * 2} fill={color} opacity={0.22} />
		<circle cx={x} cy={y} r={rr} fill="#fff7dc" />
	</g>
);

export const Cloud: React.FC<{x: number; y: number; s: number; fill?: string; shade?: string; seed: string}> = ({x, y, s, fill = '#fff6ee', shade = '#f2d6d0', seed}) => {
	const circles = new Array(6).fill(0).map((_, i) => ({cx: (i - 2.5) * 70 + r(`${seed}${i}`) * 30, cy: -Math.sin((i / 5) * Math.PI) * 60 - r(`${seed}y${i}`) * 30, rr: 55 + r(`${seed}r${i}`) * 40}));
	return (
		<g transform={`translate(${x} ${y}) scale(${s})`}>
			{circles.map((c, i) => (
				<circle key={`o${i}`} cx={c.cx} cy={c.cy} r={c.rr + 6} fill={INK} opacity={0.9} />
			))}
			<rect x={-230} y={-10} width={460} height={56} rx={28} fill={INK} opacity={0.9} />
			{circles.map((c, i) => (
				<circle key={`f${i}`} cx={c.cx} cy={c.cy} r={c.rr} fill={fill} />
			))}
			<rect x={-224} y={-4} width={448} height={44} rx={22} fill={shade} />
			{circles.map((c, i) => (
				<circle key={`h${i}`} cx={c.cx - 10} cy={c.cy - 14} r={c.rr * 0.7} fill={fill} />
			))}
		</g>
	);
};

/** Original Istanbul-flavoured far skyline: hills, domes, minarets, towers and a bridge. */
export const Skyline: React.FC<{y: number; color: string; light: string; seed: string; bridge?: boolean}> = ({y, color, light, seed, bridge = true}) => {
	const els: React.ReactNode[] = [];
	els.push(<path key="hill" d={`M -900 ${y} Q -400 ${y - 160} 100 ${y - 90} Q 600 ${y - 200} 1100 ${y - 110} Q 1600 ${y - 180} 2000 ${y} Z`} fill={color} />);
	const domes = [
		[120, 120, 1],
		[700, 150, 0.8],
		[-260, 100, 0.7],
	];
	domes.forEach(([dx, h, sc], i) => {
		const bx = dx;
		const by = y - h;
		els.push(
			<g key={`d${i}`} transform={`translate(${bx} ${by}) scale(${sc})`}>
				<rect x={-110} y={0} width={220} height={120} fill={color} />
				<path d="M -90 0 A 90 90 0 0 1 90 0 Z" fill={color} />
				<path d="M -50 -60 A 70 70 0 0 1 50 -60 Z" fill={light} opacity={0.35} />
				<rect x={-4} y={-118} width={8} height={36} fill={color} />
				{[-1, 1].map((s) => (
					<g key={s}>
						<rect x={s * 150 - 7} y={-160} width={14} height={280} fill={color} />
						<path d={`M ${s * 150 - 10} -160 L ${s * 150} -205 L ${s * 150 + 10} -160 Z`} fill={color} />
						<rect x={s * 150 - 12} y={-110} width={24} height={8} fill={color} />
					</g>
				))}
				<path d="M -140 40 A 40 40 0 0 1 -60 40 Z M 60 40 A 40 40 0 0 1 140 40 Z" fill={color} />
			</g>,
		);
	});
	// Tower blocks
	for (let i = 0; i < 9; i++) {
		const tx = -500 + i * 240 + r(`${seed}t${i}`) * 80;
		const th = 60 + r(`${seed}h${i}`) * 140;
		els.push(<rect key={`t${i}`} x={tx} y={y - 60 - th} width={50 + r(`${seed}w${i}`) * 40} height={th + 80} fill={color} />);
	}
	// A round stone tower with a conical cap
	els.push(
		<g key="tower" transform={`translate(420 ${y - 120})`}>
			<rect x={-26} y={-150} width={52} height={170} fill={color} />
			<path d="M -34 -150 L 0 -230 L 34 -150 Z" fill={color} />
			<rect x={-30} y={-120} width={60} height={10} fill={light} opacity={0.3} />
		</g>,
	);
	if (bridge) {
		const by = y - 40;
		els.push(
			<g key="bridge" opacity={0.85}>
				<path d={`M -900 ${by} L 2000 ${by}`} stroke={color} strokeWidth={10} />
				{[-200, 1300].map((px) => (
					<rect key={px} x={px - 10} y={by - 220} width={20} height={240} fill={color} />
				))}
				<path d={`M -900 ${by - 60} Q -550 ${by - 30} -200 ${by - 220} Q 550 ${by} 1300 ${by - 220} Q 1650 ${by - 30} 2000 ${by - 60}`} fill="none" stroke={color} strokeWidth={5} />
			</g>,
		);
	}
	return <g>{els}</g>;
};

export const Sea: React.FC<{y: number; h: number; frame: number; color?: string; light?: string}> = ({y, h, frame, color = '#3c7fa8', light = '#bfe6f5'}) => (
	<g>
		<rect x={-1500} y={y} width={4080} height={h} fill={color} />
		{new Array(26).fill(0).map((_, i) => {
			const sx = ((r(`sea${i}`) * 2400 + frame * (0.6 + r(`sv${i}`))) % 2400) - 700;
			const sy = y + 12 + r(`sy${i}`) * (h - 24);
			return <rect key={i} x={sx} y={sy} width={40 + r(`sw${i}`) * 90} height={5} rx={3} fill={light} opacity={0.5 + 0.4 * Math.sin(frame * 0.1 + i)} />;
		})}
	</g>
);

export const Ferry: React.FC<{x: number; y: number; s: number}> = ({x, y, s}) => (
	<g transform={`translate(${x} ${y}) scale(${s})`}>
		<path d="M -150 0 L 150 0 L 120 50 L -130 50 Z" fill="#f4f1ea" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
		<rect x={-100} y={-50} width={190} height={50} fill="#fff" stroke={INK} strokeWidth={6} />
		<rect x={-20} y={-90} width={30} height={40} fill="#d8443a" stroke={INK} strokeWidth={6} />
		{[-80, -50, -20, 10, 40, 70].map((wx) => (
			<rect key={wx} x={wx} y={-38} width={20} height={20} fill="#6fa8c9" />
		))}
		<path d="M -150 30 L 150 30" stroke="#d8443a" strokeWidth={8} />
	</g>
);

export type ApartmentProps = {
	x: number;
	baseY: number;
	w: number;
	floors: number;
	floorH?: number;
	color: string;
	shade: string;
	trim: string;
	seed: string;
	shop?: string | null;
	awning?: string;
	lights?: number;
	/** Force balconies on these floors (0 = ground). Default: seeded alternate floors. */
	balconies?: number[] | null;
};

/** A detailed apartment block: windows, balconies, AC units, laundry, rooftop tanks, shop. */
export const Apartment: React.FC<ApartmentProps> = ({x, baseY, w, floors, floorH = 210, color, shade, trim, seed, shop = null, awning = '#d8443a', lights = 0, balconies = null}) => {
	const top = baseY - floors * floorH;
	const cols = Math.max(2, Math.round(w / 170));
	const cw = w / cols;
	const els: React.ReactNode[] = [];
	els.push(<rect key="body" x={x} y={top} width={w} height={floors * floorH} fill={color} stroke={INK} strokeWidth={8} />);
	els.push(<rect key="shade" x={x + w * 0.78} y={top} width={w * 0.22} height={floors * floorH} fill={shade} opacity={0.7} />);
	els.push(<rect key="cornice" x={x - 16} y={top - 24} width={w + 32} height={30} fill={trim} stroke={INK} strokeWidth={7} />);
	for (let f = 0; f < floors; f++) {
		const fy = baseY - (f + 1) * floorH;
		if (f === 0 && shop) {
			continue;
		}
		els.push(<rect key={`band${f}`} x={x} y={fy + floorH - 10} width={w} height={10} fill={shade} opacity={0.6} />);
		for (let c = 0; c < cols; c++) {
			const k = `${seed}-${f}-${c}`;
			const wx = x + c * cw + cw * 0.22;
			const ww = cw * 0.56;
			const wy = fy + floorH * 0.18;
			const wh = floorH * 0.56;
			const lit = r(`${k}l`) < lights;
			els.push(
				<g key={`w${k}`}>
					<rect x={wx - 6} y={wy - 6} width={ww + 12} height={wh + 12} fill={trim} stroke={INK} strokeWidth={5} />
					<rect x={wx} y={wy} width={ww} height={wh} fill={lit ? '#ffd98a' : '#2d4a63'} />
					<path d={`M ${wx} ${wy + wh} L ${wx + ww * 0.6} ${wy} L ${wx + ww} ${wy} L ${wx + ww} ${wy + wh * 0.25} L ${wx + ww * 0.3} ${wy + wh} Z`} fill="#fff" opacity={lit ? 0.15 : 0.12} />
					<path d={`M ${wx + ww / 2} ${wy} L ${wx + ww / 2} ${wy + wh}`} stroke={trim} strokeWidth={5} />
					{r(`${k}c`) > 0.55 ? <path d={`M ${wx} ${wy} L ${wx + ww * 0.3} ${wy} Q ${wx + ww * 0.15} ${wy + wh * 0.5} ${wx + ww * 0.22} ${wy + wh} L ${wx} ${wy + wh} Z`} fill={r(`${k}cc`) > 0.5 ? '#f0e2c0' : '#e8a0a0'} opacity={0.9} /> : null}
				</g>,
			);
			if (r(`${k}ac`) > 0.8) {
				els.push(
					<g key={`ac${k}`}>
						<rect x={wx + ww + 10} y={wy + wh * 0.5} width={50} height={36} rx={4} fill="#e9ebe6" stroke={INK} strokeWidth={4} />
						<circle cx={wx + ww + 35} cy={wy + wh * 0.5 + 18} r={11} fill="none" stroke={INK} strokeWidth={3} />
					</g>,
				);
			}
		}
		// Balconies on alternate floors
		if (balconies ? balconies.includes(f) : f > 0 && (f + Math.floor(r(`${seed}b`) * 2)) % 2 === 0) {
			const bx = x + cw * 0.08;
			const bw = cw * 0.84 + (cols > 2 ? cw : 0);
			const by = fy + floorH * 0.82;
			els.push(
				<g key={`bal${f}`}>
					<rect x={bx - 8} y={by} width={bw + 16} height={16} fill={trim} stroke={INK} strokeWidth={5} />
					<path d={`M ${bx} ${by} L ${bx} ${by - 70} L ${bx + bw} ${by - 70} L ${bx + bw} ${by}`} fill="none" stroke={INK} strokeWidth={7} />
					{new Array(Math.floor(bw / 22)).fill(0).map((_, i) => (
						<path key={i} d={`M ${bx + 11 + i * 22} ${by} L ${bx + 11 + i * 22} ${by - 70}`} stroke={INK} strokeWidth={3.5} />
					))}
					{r(`${seed}pl${f}`) > 0.4 ? (
						<g>
							<rect x={bx + bw - 60} y={by - 46} width={40} height={46} fill="#c4643e" stroke={INK} strokeWidth={4} />
							<circle cx={bx + bw - 40} cy={by - 62} r={26} fill="#4f9a4f" stroke={INK} strokeWidth={4} />
						</g>
					) : null}
					{r(`${seed}ln${f}`) > 0.5 ? (
						<g>
							<path d={`M ${bx} ${by - 64} Q ${bx + bw / 2} ${by - 40} ${bx + bw} ${by - 64}`} fill="none" stroke={INK} strokeWidth={2.5} />
							{[0.2, 0.4, 0.62].map((t, i) => (
								<rect key={i} x={bx + bw * t} y={by - 58 + Math.sin(t * Math.PI) * 18} width={34} height={42} fill={['#5aa0e6', '#f2c230', '#ef6f6c'][i]} stroke={INK} strokeWidth={3.5} />
							))}
						</g>
					) : null}
				</g>,
			);
		}
	}
	if (shop) {
		const sy = baseY - floorH;
		els.push(
			<g key="shop">
				<rect x={x} y={sy} width={w} height={floorH} fill={shade} stroke={INK} strokeWidth={7} />
				<rect x={x + 30} y={sy + 70} width={w - 60} height={floorH - 70} fill="#2a3f52" stroke={INK} strokeWidth={6} />
				<rect x={x + 40} y={sy + 80} width={w * 0.3} height={floorH - 90} fill="#ffe1a0" opacity={0.35} />
				<rect x={x + 10} y={sy + 6} width={w - 20} height={52} rx={6} fill="#fdf3dc" stroke={INK} strokeWidth={6} />
				<text x={x + w / 2} y={sy + 46} textAnchor="middle" fontFamily="Anton, Montserrat, sans-serif" fontSize={40} fill={INK} letterSpacing={3}>
					{shop}
				</text>
				<path d={`M ${x + 20} ${sy + 62} L ${x + w - 20} ${sy + 62} L ${x + w} ${sy + 120} L ${x} ${sy + 120} Z`} fill={awning} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
				{new Array(Math.floor(w / 60)).fill(0).map((_, i) => (
					<path key={i} d={`M ${x + 30 + i * 60} ${sy + 62} L ${x + 22 + i * 62} ${sy + 120}`} stroke="#fff" strokeWidth={14} opacity={0.75} />
				))}
			</g>,
		);
	}
	// Rooftop
	els.push(
		<g key="roof">
			<rect x={x + w * 0.15} y={top - 90} width={70} height={66} fill="#c7ccd1" stroke={INK} strokeWidth={6} />
			<ellipse cx={x + w * 0.15 + 35} cy={top - 90} rx={35} ry={10} fill="#e2e6ea" stroke={INK} strokeWidth={5} />
			<path d={`M ${x + w * 0.7} ${top - 24} L ${x + w * 0.7} ${top - 150} M ${x + w * 0.7 - 30} ${top - 120} L ${x + w * 0.7 + 30} ${top - 120} M ${x + w * 0.7 - 20} ${top - 95} L ${x + w * 0.7 + 20} ${top - 95}`} stroke={INK} strokeWidth={5} />
		</g>,
	);
	return <g>{els}</g>;
};

/** Side-view street: sidewalk, curb and road with lane marks (scrollable via `scroll`). */
export const Street: React.FC<{y: number; scroll?: number; crack?: number}> = ({y, scroll = 0, crack = 0}) => (
	<g>
		<rect x={-2000} y={y} width={5080} height={70} fill="#c9c2b6" stroke={INK} strokeWidth={7} />
		{new Array(40).fill(0).map((_, i) => (
			<path key={i} d={`M ${-2000 + i * 130} ${y} L ${-2000 + i * 130 - 20} ${y + 70}`} stroke="#a59d90" strokeWidth={4} />
		))}
		<rect x={-2000} y={y + 70} width={5080} height={26} fill="#8e877c" stroke={INK} strokeWidth={6} />
		<rect x={-2000} y={y + 96} width={5080} height={1400} fill="#4b4f5a" />
		{new Array(30).fill(0).map((_, i) => {
			const lx = ((i * 260 - scroll) % 5200 + 5200) % 5200 - 2000;
			return <rect key={i} x={lx} y={y + 250} width={140} height={18} rx={4} fill="#f2efe6" />;
		})}
		<rect x={-2000} y={y + 96} width={5080} height={12} fill="#000" opacity={0.25} />
		{crack > 0 ? (
			<g opacity={crack}>
				<path d={`M 300 ${y + 110} L 360 ${y + 170} L 330 ${y + 230} L 420 ${y + 300} M 360 ${y + 170} L 450 ${y + 190} M 760 ${y + 120} L 720 ${y + 200} L 790 ${y + 260}`} fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
			</g>
		) : null}
	</g>
);

export const Lamp: React.FC<{x: number; y: number; h: number; s?: number; bend?: number}> = ({x, y, h, s = 1, bend = 0}) => (
	<g transform={`translate(${x} ${y}) scale(${s})`}>
		<rect x={-14} y={-h} width={28} height={h} fill="#3a4250" stroke={INK} strokeWidth={6} />
		<rect x={-26} y={-24} width={52} height={24} fill="#2c323d" stroke={INK} strokeWidth={6} />
		<path d={`M 0 ${-h} Q 0 ${-h - 70} ${70 + bend} ${-h - 70}`} fill="none" stroke={INK} strokeWidth={22} />
		<path d={`M 0 ${-h} Q 0 ${-h - 70} ${70 + bend} ${-h - 70}`} fill="none" stroke="#3a4250" strokeWidth={10} />
		<path d={`M ${50 + bend} ${-h - 74} L ${120 + bend} ${-h - 74} L ${110 + bend} ${-h - 48} L ${60 + bend} ${-h - 48} Z`} fill="#2c323d" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
		<rect x={64 + bend} y={-h - 50} width={42} height={10} fill="#fff1b8" />
	</g>
);

export const Tree: React.FC<{x: number; y: number; s: number; seed: string; sway?: number}> = ({x, y, s, seed, sway = 0}) => {
	const c = new Array(7).fill(0).map((_, i) => ({cx: (r(`${seed}x${i}`) - 0.5) * 220, cy: -300 - r(`${seed}y${i}`) * 200, rr: 70 + r(`${seed}r${i}`) * 50}));
	return (
		<g transform={`translate(${x} ${y}) scale(${s})`}>
			<path d="M -18 0 L -12 -300 L 12 -300 L 20 0 Z" fill="#6b4630" stroke={INK} strokeWidth={6} />
			<g transform={`rotate(${sway} 0 -200)`}>
				{c.map((k, i) => (
					<circle key={`o${i}`} cx={k.cx} cy={k.cy} r={k.rr + 7} fill={INK} />
				))}
				{c.map((k, i) => (
					<circle key={`f${i}`} cx={k.cx} cy={k.cy} r={k.rr} fill="#4f9a4f" />
				))}
				{c.map((k, i) => (
					<circle key={`h${i}`} cx={k.cx - 18} cy={k.cy - 22} r={k.rr * 0.6} fill="#6dbb5e" />
				))}
			</g>
		</g>
	);
};

export type CarKind = 'sedan' | 'taxi' | 'van' | 'bus';

/** Side-view car, origin at the middle of the wheel line. ~340px long at s=1. */
export const Car: React.FC<{x: number; y: number; s: number; kind: CarKind; color: string; wheel: number; rot?: number; flip?: boolean; dent?: number}> = ({x, y, s, kind, color, wheel, rot = 0, flip = false, dent = 0}) => {
	const L = kind === 'bus' ? 640 : kind === 'van' ? 380 : 340;
	const H = kind === 'bus' ? 230 : kind === 'van' ? 170 : 110;
	const body =
		kind === 'sedan' || kind === 'taxi'
			? `M ${-L / 2} -20 Q ${-L / 2} -70 ${-L / 2 + 30} -76 L ${-L / 4} -84 Q ${-L / 6} -140 ${-L / 12} -146 L ${L / 6} -146 Q ${L / 4} -140 ${L / 3} -86 Q ${L / 2} -80 ${L / 2} -40 L ${L / 2} -20 Z`
			: `M ${-L / 2} -20 L ${-L / 2} ${-H - 20} Q ${-L / 2} ${-H - 36} ${-L / 2 + 20} ${-H - 36} L ${L / 2 - 40} ${-H - 36} Q ${L / 2} ${-H - 30} ${L / 2} ${-H + 40} L ${L / 2} -20 Z`;
	const wheels = kind === 'bus' ? [-L / 2 + 110, L / 2 - 110] : [-L / 2 + 75, L / 2 - 75];
	return (
		<g transform={`translate(${x} ${y}) rotate(${rot}) scale(${flip ? -s : s} ${s})`}>
			<path d={body} fill={color} stroke={INK} strokeWidth={7} strokeLinejoin="round" transform={dent > 0 ? `scale(1 ${1 - dent * 0.25})` : undefined} />
			<path d={`M ${-L / 2 + 10} -40 L ${L / 2 - 10} -40`} stroke="#000" strokeWidth={10} opacity={0.15} />
			{kind === 'sedan' || kind === 'taxi' ? (
				<g>
					<path d={`M ${-L / 4 + 12} -88 Q ${-L / 6 + 4} -132 ${-L / 12 + 6} -134 L ${0} -134 L ${0} -88 Z`} fill="#9fd0ea" stroke={INK} strokeWidth={5} />
					<path d={`M ${12} -88 L ${12} -134 L ${L / 6 - 4} -134 Q ${L / 4 - 6} -128 ${L / 3 - 12} -88 Z`} fill="#9fd0ea" stroke={INK} strokeWidth={5} />
				</g>
			) : (
				new Array(kind === 'bus' ? 6 : 2).fill(0).map((_, i) => (
					<rect key={i} x={-L / 2 + 30 + i * (kind === 'bus' ? 95 : 150)} y={-H - 18} width={kind === 'bus' ? 78 : 120} height={H * 0.42} rx={8} fill="#9fd0ea" stroke={INK} strokeWidth={5} />
				))
			)}
			{kind === 'taxi' ? (
				<g>
					<rect x={-40} y={-172} width={80} height={26} rx={6} fill="#fff5c0" stroke={INK} strokeWidth={5} />
					<text x={0} y={-152} textAnchor="middle" fontFamily="Anton, sans-serif" fontSize={20} fill={INK}>
						TAKSİ
					</text>
					{new Array(8).fill(0).map((_, i) => (
						<rect key={i} x={-L / 2 + 30 + i * 36} y={-56} width={18} height={12} fill={i % 2 ? INK : '#fff'} />
					))}
				</g>
			) : null}
			{kind === 'bus' ? <rect x={-L / 2} y={-80} width={L} height={18} fill="#fff" opacity={0.6} /> : null}
			<rect x={L / 2 - 26} y={-66} width={22} height={16} rx={4} fill="#fff4b0" stroke={INK} strokeWidth={4} />
			<rect x={-L / 2 + 4} y={-66} width={16} height={16} rx={4} fill="#ff5050" stroke={INK} strokeWidth={4} />
			{wheels.map((wx) => (
				<g key={wx} transform={`translate(${wx} -16)`}>
					<circle r={44} fill="#1f2128" stroke={INK} strokeWidth={6} />
					<circle r={22} fill="#b8bcc4" stroke={INK} strokeWidth={4} />
					<g transform={`rotate(${wheel})`}>
						{[0, 72, 144, 216, 288].map((a) => (
							<line key={a} x1={0} y1={0} x2={Math.cos((a * Math.PI) / 180) * 20} y2={Math.sin((a * Math.PI) / 180) * 20} stroke={INK} strokeWidth={4} />
						))}
					</g>
				</g>
			))}
		</g>
	);
};

export const Simit: React.FC<{x: number; y: number; s: number; rot?: number}> = ({x, y, s, rot = 0}) => (
	<g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
		<circle r={40} fill="none" stroke={INK} strokeWidth={34} />
		<circle r={40} fill="none" stroke="#c9792f" strokeWidth={24} />
		<circle r={40} fill="none" stroke="#e39b4c" strokeWidth={10} strokeDasharray="10 14" />
		{new Array(10).fill(0).map((_, i) => (
			<ellipse key={i} cx={Math.cos(i * 0.63) * 44} cy={Math.sin(i * 0.63) * 44} rx={3} ry={1.6} fill="#fff3d0" />
		))}
	</g>
);

export const SimitCart: React.FC<{x: number; y: number; s: number; wheel?: number}> = ({x, y, s, wheel = 0}) => (
	<g transform={`translate(${x} ${y}) scale(${s})`}>
		<rect x={-130} y={-240} width={260} height={150} rx={10} fill="#d23a33" stroke={INK} strokeWidth={7} />
		<rect x={-110} y={-330} width={220} height={100} rx={8} fill="#cfeaf5" opacity={0.85} stroke={INK} strokeWidth={6} />
		{[-70, 0, 70].map((sx) => (
			<Simit key={sx} x={sx} y={-282} s={0.55} />
		))}
		<text x={0} y={-150} textAnchor="middle" fontFamily="Anton, sans-serif" fontSize={46} fill="#fff4d6" letterSpacing={2}>
			SİMİT
		</text>
		<path d="M 130 -150 L 200 -200" stroke={INK} strokeWidth={10} strokeLinecap="round" />
		{[-80, 80].map((wx) => (
			<g key={wx} transform={`translate(${wx} -50) rotate(${wheel})`}>
				<circle r={40} fill="#3a3f48" stroke={INK} strokeWidth={6} />
				<path d="M -30 0 L 30 0 M 0 -30 L 0 30" stroke="#9aa0a8" strokeWidth={5} />
			</g>
		))}
	</g>
);

/** Turkish tulip tea glass on a saucer. `level` 0..1 of tea left in the glass. */
export const TeaGlass: React.FC<{x: number; y: number; s: number; level?: number; rot?: number; saucer?: boolean}> = ({x, y, s, level = 0.85, rot = 0, saucer = true}) => {
	const glass = 'M -38 -150 Q -46 -120 -26 -84 Q -14 -64 -28 -34 Q -40 -8 -30 0 L 30 0 Q 40 -8 28 -34 Q 14 -64 26 -84 Q 46 -120 38 -150 Z';
	const top = -150 + (1 - level) * 140;
	return (
		<g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
			{saucer ? <ellipse cx={0} cy={4} rx={86} ry={20} fill="#e64a3c" stroke={INK} strokeWidth={6} /> : null}
			<defs>
				<clipPath id={`tg${Math.round(x)}${Math.round(y)}`}>
					<path d={glass} />
				</clipPath>
			</defs>
			<path d={glass} fill="#fff" opacity={0.25} />
			<g clipPath={`url(#tg${Math.round(x)}${Math.round(y)})`}>
				<rect x={-60} y={top} width={120} height={200} fill="#b8401c" />
				<rect x={-60} y={top} width={120} height={10} fill="#e27a3c" />
				<path d="M 10 -140 Q 22 -100 12 -60" stroke="#fff" strokeWidth={8} opacity={0.45} fill="none" />
			</g>
			<path d={glass} fill="none" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
		</g>
	);
};

export const Seagull: React.FC<{x: number; y: number; s: number; frame: number; flip?: boolean; seed: string}> = ({x, y, s, frame, flip = false, seed}) => {
	const f = Math.sin(frame * 0.35 + r(seed) * 9) * 30;
	return (
		<g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
			<path d={`M -10 -6 Q -60 ${-30 - f} -110 ${-10 - f * 1.4} Q -60 ${-6 - f * 0.4} -10 8 Z`} fill="#e6eaee" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
			<ellipse cx={0} cy={0} rx={46} ry={20} fill="#fff" stroke={INK} strokeWidth={5} />
			<circle cx={38} cy={-10} r={16} fill="#fff" stroke={INK} strokeWidth={5} />
			<path d="M 52 -10 L 76 -6 L 52 -2 Z" fill="#f2b630" stroke={INK} strokeWidth={3} />
			<circle cx={42} cy={-14} r={3} fill={INK} />
			<path d={`M 10 -6 Q 40 ${-34 - f} 90 ${-16 - f * 1.3} Q 40 ${-8 - f * 0.4} 10 6 Z`} fill="#c9d0d6" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
			<path d="M -46 0 L -66 -6 L -60 8 Z" fill="#c9d0d6" stroke={INK} strokeWidth={4} />
		</g>
	);
};

export const Cat: React.FC<{x: number; y: number; s: number; rot?: number; scared?: boolean}> = ({x, y, s, rot = 0, scared = false}) => (
	<g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
		<path d="M 50 -30 Q 110 -60 96 -120" fill="none" stroke={INK} strokeWidth={22} strokeLinecap="round" />
		<path d="M 50 -30 Q 110 -60 96 -120" fill="none" stroke="#f0953a" strokeWidth={12} strokeLinecap="round" />
		<ellipse cx={0} cy={-30} rx={70} ry={42} fill="#f0953a" stroke={INK} strokeWidth={6} />
		{[-40, -10, 20].map((sx) => (
			<path key={sx} d={`M ${sx} -66 Q ${sx + 6} -46 ${sx} -30`} stroke="#c56a1c" strokeWidth={8} fill="none" />
		))}
		{[-46, -20, 22, 46].map((lx) => (
			<rect key={lx} x={lx - 9} y={-14} width={18} height={scared ? 40 : 26} rx={9} fill="#f0953a" stroke={INK} strokeWidth={5} />
		))}
		<g transform="translate(-70 -66)">
			<path d="M -30 -26 L -26 -62 L -2 -38 Z M 30 -26 L 26 -62 L 2 -38 Z" fill="#f0953a" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
			<circle r={40} fill="#f0953a" stroke={INK} strokeWidth={6} />
			<ellipse cx={-14} cy={-4} rx={scared ? 10 : 7} ry={scared ? 13 : 9} fill="#fffbe0" stroke={INK} strokeWidth={3} />
			<ellipse cx={14} cy={-4} rx={scared ? 10 : 7} ry={scared ? 13 : 9} fill="#fffbe0" stroke={INK} strokeWidth={3} />
			<circle cx={-14} cy={-2} r={scared ? 3 : 5} fill={INK} />
			<circle cx={14} cy={-2} r={scared ? 3 : 5} fill={INK} />
			<path d="M -6 12 L 6 12 L 0 18 Z" fill="#e66" />
			{scared ? <ellipse cx={0} cy={26} rx={8} ry={6} fill="#3b0d17" /> : null}
		</g>
	</g>
);

export type PropKind = 'book' | 'phone' | 'chair' | 'plant' | 'ball' | 'bag' | 'paper' | 'shoe' | 'bin' | 'crate' | 'umbrella' | 'pot';

export const Prop: React.FC<{kind: PropKind; x: number; y: number; s: number; rot: number}> = ({kind, x, y, s, rot}) => {
	let el: React.ReactNode = null;
	switch (kind) {
		case 'book':
			el = (
				<g>
					<rect x={-50} y={-34} width={100} height={68} rx={4} fill="#3d6fd6" stroke={INK} strokeWidth={6} />
					<rect x={-44} y={-28} width={8} height={56} fill="#2a4fa0" />
					<rect x={-20} y={-14} width={50} height={10} fill="#fff" opacity={0.8} />
				</g>
			);
			break;
		case 'phone':
			el = (
				<g>
					<rect x={-22} y={-42} width={44} height={84} rx={9} fill="#20232b" stroke={INK} strokeWidth={5} />
					<rect x={-16} y={-34} width={32} height={66} rx={4} fill="#6ad1ff" />
				</g>
			);
			break;
		case 'chair':
			el = (
				<g fill="#c9853f" stroke={INK} strokeWidth={6} strokeLinejoin="round">
					<rect x={-40} y={-100} width={14} height={160} />
					<rect x={-40} y={-10} width={90} height={16} />
					<rect x={-36} y={6} width={12} height={60} />
					<rect x={36} y={6} width={12} height={60} />
					<rect x={-40} y={-100} width={20} height={70} />
				</g>
			);
			break;
		case 'plant':
			el = (
				<g>
					<path d="M -30 0 L 30 0 L 24 50 L -24 50 Z" fill="#c4643e" stroke={INK} strokeWidth={6} />
					{[-30, 0, 30].map((a) => (
						<ellipse key={a} cx={a * 0.8} cy={-30} rx={16} ry={38} transform={`rotate(${a} ${a * 0.8} -30)`} fill="#4f9a4f" stroke={INK} strokeWidth={5} />
					))}
				</g>
			);
			break;
		case 'ball':
			el = (
				<g>
					<circle r={40} fill="#fff" stroke={INK} strokeWidth={6} />
					<path d="M -14 -14 L 0 -24 L 14 -14 L 9 4 L -9 4 Z" fill={INK} />
					<path d="M -38 -8 L -20 -4 M 38 -8 L 20 -4 M 0 38 L 0 20" stroke={INK} strokeWidth={4} />
				</g>
			);
			break;
		case 'bag':
			el = (
				<g>
					<path d="M -40 -30 L 40 -30 L 46 40 L -46 40 Z" fill="#f2c230" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
					<path d="M -20 -30 Q 0 -70 20 -30" fill="none" stroke={INK} strokeWidth={6} />
				</g>
			);
			break;
		case 'paper':
			el = (
				<g>
					<path d="M -40 -50 L 34 -50 L 44 50 L -36 46 Z" fill="#f8f4ea" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
					{[-30, -14, 2, 18].map((ly) => (
						<path key={ly} d={`M -26 ${ly} L 28 ${ly + 2}`} stroke="#888" strokeWidth={5} />
					))}
				</g>
			);
			break;
		case 'shoe':
			el = <path d="M -40 10 Q -44 -26 -16 -24 L 6 -10 Q 44 -6 46 14 Z" fill="#e44" stroke={INK} strokeWidth={6} strokeLinejoin="round" />;
			break;
		case 'bin':
			el = (
				<g>
					<path d="M -40 -60 L 40 -60 L 34 60 L -34 60 Z" fill="#3f8f5a" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
					<rect x={-46} y={-74} width={92} height={18} rx={6} fill="#2f6f45" stroke={INK} strokeWidth={6} />
				</g>
			);
			break;
		case 'crate':
			el = (
				<g>
					<rect x={-50} y={-40} width={100} height={80} fill="#c99a5b" stroke={INK} strokeWidth={6} />
					<path d="M -50 -12 L 50 -12 M -50 14 L 50 14" stroke={INK} strokeWidth={4} />
					{[-30, 0, 30].map((ox) => (
						<circle key={ox} cx={ox} cy={-40} r={16} fill="#ff7b2f" stroke={INK} strokeWidth={4} />
					))}
				</g>
			);
			break;
		case 'umbrella':
			el = (
				<g>
					<path d="M -80 0 Q 0 -90 80 0 Q 60 -14 40 0 Q 20 -14 0 0 Q -20 -14 -40 0 Q -60 -14 -80 0 Z" fill="#5a4fd6" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
					<path d="M 0 0 L 0 80 Q 0 96 -16 92" fill="none" stroke={INK} strokeWidth={6} />
				</g>
			);
			break;
		case 'pot':
			el = (
				<g>
					<rect x={-50} y={-30} width={100} height={60} rx={10} fill="#b8bec6" stroke={INK} strokeWidth={6} />
					<rect x={-60} y={-38} width={120} height={14} rx={6} fill="#9aa1aa" stroke={INK} strokeWidth={5} />
				</g>
			);
			break;
	}
	return <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>{el}</g>;
};
