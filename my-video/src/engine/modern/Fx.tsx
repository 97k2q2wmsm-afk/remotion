import React from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';
import {INK} from './Person';

/** Radial or directional speed lines (anime-style motion cue). */
export const SpeedLines: React.FC<{
	amount: number;
	dir?: 'up' | 'down' | 'radial';
	color?: string;
	seed?: string;
	count?: number;
}> = ({amount, dir = 'up', color = '#ffffff', seed = 'sl', count = 26}) => {
	const frame = useCurrentFrame();
	if (amount <= 0.01) return null;
	return (
		<svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none'}}>
			{new Array(count).fill(0).map((_, i) => {
				const a = random(`${seed}${i}`);
				const b = random(`${seed}b${i}`);
				const c = random(`${seed}c${i}`);
				if (dir === 'radial') {
					const ang = a * Math.PI * 2;
					const r0 = 520 + ((frame * 40 + b * 600) % 600);
					const len = 120 + c * 220;
					return (
						<line
							key={i}
							x1={540 + Math.cos(ang) * r0}
							y1={960 + Math.sin(ang) * r0}
							x2={540 + Math.cos(ang) * (r0 + len)}
							y2={960 + Math.sin(ang) * (r0 + len)}
							stroke={color}
							strokeWidth={3 + c * 6}
							strokeLinecap="round"
							opacity={amount * (0.3 + b * 0.5)}
						/>
					);
				}
				const sgn = dir === 'up' ? 1 : -1;
				const x = a * 1180 - 50;
				const len = 160 + c * 380;
				const y = (((b * 2600 + frame * 70 * sgn) % 2600) + 2600) % 2600 - 340;
				return <line key={i} x1={x} y1={y} x2={x} y2={y + len} stroke={color} strokeWidth={2 + c * 5} strokeLinecap="round" opacity={amount * (0.25 + b * 0.45)} />;
			})}
		</svg>
	);
};

/** Expanding ink-edged shockwave ring. */
export const Shockwave: React.FC<{x: number; y: number; at: number; color?: string; maxR?: number; dur?: number}> = ({x, y, at, color = '#ffffff', maxR = 1400, dur = 26}) => {
	const frame = useCurrentFrame();
	const t = (frame - at) / dur;
	if (t < 0 || t > 1) return null;
	const e = 1 - (1 - t) ** 3;
	return (
		<svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none'}}>
			<circle cx={x} cy={y} r={e * maxR} fill="none" stroke={color} strokeWidth={60 * (1 - t)} opacity={(1 - t) * 0.8} />
			<circle cx={x} cy={y} r={e * maxR * 0.86} fill="none" stroke={color} strokeWidth={14 * (1 - t)} opacity={(1 - t) * 0.6} />
		</svg>
	);
};

/** Puffy cartoon dust cloud that bursts at `at` (SVG group, place inside a Stage). */
export const DustPuff: React.FC<{x: number; y: number; at: number; s?: number; seed: string; color?: string; shade?: string}> = ({x, y, at, s = 1, seed, color = '#d8cbb6', shade = '#b5a68f'}) => {
	const frame = useCurrentFrame();
	const t = (frame - at) / 40;
	if (t < 0 || t > 1.6) return null;
	const grow = 1 - Math.exp(-t * 4);
	const fade = t < 1 ? 1 : 1 - (t - 1) / 0.6;
	const puffs = new Array(9).fill(0).map((_, i) => {
		const a = (i / 9) * Math.PI - Math.PI + (random(`${seed}${i}`) - 0.5) * 0.4;
		const d = (90 + random(`${seed}d${i}`) * 120) * grow;
		return {cx: Math.cos(a) * d * 1.6, cy: Math.sin(a) * d * 0.6 - 20, rr: (40 + random(`${seed}r${i}`) * 50) * (0.5 + grow * 0.7)};
	});
	return (
		<g transform={`translate(${x} ${y}) scale(${s})`} opacity={fade}>
			{puffs.map((p, i) => (
				<circle key={`o${i}`} cx={p.cx} cy={p.cy} r={p.rr + 6} fill={INK} />
			))}
			{puffs.map((p, i) => (
				<circle key={`f${i}`} cx={p.cx} cy={p.cy} r={p.rr} fill={shade} />
			))}
			{puffs.map((p, i) => (
				<circle key={`h${i}`} cx={p.cx - p.rr * 0.15} cy={p.cy - p.rr * 0.2} r={p.rr * 0.75} fill={color} />
			))}
		</g>
	);
};

/** Wobbling liquid sphere (surface tension in zero-g). */
export const LiquidBlob: React.FC<{x: number; y: number; r: number; color?: string; light?: string; seed?: string}> = ({x, y, r, color = '#b8401c', light = '#f09a5a', seed = 'lb'}) => {
	const frame = useCurrentFrame();
	const pts = 18;
	const ph = random(seed) * 10;
	const d = new Array(pts + 1)
		.fill(0)
		.map((_, i) => {
			const a = (i / pts) * Math.PI * 2;
			const rr = r * (1 + 0.07 * Math.sin(a * 3 + frame * 0.21 + ph) + 0.05 * Math.sin(a * 2 - frame * 0.17));
			return `${i === 0 ? 'M' : 'L'} ${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`;
		})
		.join(' ');
	return (
		<g>
			<path d={d + ' Z'} fill={color} stroke={INK} strokeWidth={6} strokeLinejoin="round" opacity={0.95} />
			<ellipse cx={x - r * 0.32} cy={y - r * 0.36} rx={r * 0.32} ry={r * 0.2} fill={light} opacity={0.8} transform={`rotate(-30 ${x - r * 0.32} ${y - r * 0.36})`} />
			<circle cx={x + r * 0.35} cy={y + r * 0.3} r={r * 0.09} fill="#fff" opacity={0.7} />
		</g>
	);
};

/** Chromatic glitch overlay used when a physical law "switches off". */
export const Glitch: React.FC<{amount: number; seed?: string}> = ({amount, seed = 'g'}) => {
	const frame = useCurrentFrame();
	if (amount <= 0.01) return null;
	return (
		<AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
			{new Array(7).fill(0).map((_, i) => {
				const y = random(`${seed}${frame}-${i}`) * 1920;
				const h = 8 + random(`${seed}h${frame}-${i}`) * 60;
				const c = i % 2 ? 'rgba(0,255,255,0.5)' : 'rgba(255,0,120,0.5)';
				return <div key={i} style={{position: 'absolute', left: 0, right: 0, top: y, height: h, background: c, opacity: amount, transform: `translateX(${(random(`${seed}x${frame}${i}`) - 0.5) * 120 * amount}px)`}} />;
			})}
		</AbsoluteFill>
	);
};

/** Cel-shaded light-wrap: warm key light from one side + cool fill. */
export const CinemaLight: React.FC<{angle?: number; warm?: string; cool?: string; strength?: number}> = ({angle = 120, warm = 'rgba(255,190,120,0.35)', cool = 'rgba(60,80,160,0.35)', strength = 1}) => (
	<AbsoluteFill style={{background: `linear-gradient(${angle}deg, ${warm} 0%, transparent 45%, transparent 60%, ${cool} 100%)`, mixBlendMode: 'soft-light', opacity: strength, pointerEvents: 'none'}} />
);

/** Letterbox bars for dramatic moments. */
export const Letterbox: React.FC<{amount: number}> = ({amount}) =>
	amount <= 0 ? null : (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			<div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 150 * amount, background: '#000'}} />
			<div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 150 * amount, background: '#000'}} />
		</AbsoluteFill>
	);
