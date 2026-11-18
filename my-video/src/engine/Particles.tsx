import React from 'react';
import {random, useCurrentFrame} from 'remotion';
import {INK} from './Shapes';

type Kind = 'ash' | 'embers' | 'dust' | 'pumice' | 'steam' | 'sparks';

/**
 * Deterministic particle field (same frame → same pixels, so renders are reproducible).
 * Rendered as SVG in 1080x1920 space.
 */
export const Particles: React.FC<{
	kind: Kind;
	count: number;
	seed: string;
	/** 0..1 multiplier for opacity, can be animated by the caller. */
	amount?: number;
	speed?: number;
	/** Restrict spawn area (for steam / sparks). */
	area?: {x: number; y: number; w: number; h: number};
	color?: string;
}> = ({kind, count, seed, amount = 1, speed = 1, area, color}) => {
	const frame = useCurrentFrame();
	if (amount <= 0) {
		return null;
	}
	const W = 1080 + 400;
	const H = 1920 + 400;
	const items: React.ReactNode[] = [];
	for (let i = 0; i < count; i++) {
		const r1 = random(`${seed}-a-${i}`);
		const r2 = random(`${seed}-b-${i}`);
		const r3 = random(`${seed}-c-${i}`);
		const r4 = random(`${seed}-d-${i}`);
		const t = frame * speed;
		if (kind === 'ash' || kind === 'pumice') {
			const fall = (kind === 'ash' ? 1.6 + r3 * 2.2 : 9 + r3 * 9) * t;
			const drift = Math.sin(t * 0.03 + r4 * 6) * 40 + t * (kind === 'ash' ? 0.6 : 1.4);
			const x = ((r1 * W + drift) % W) - 200;
			const y = ((r2 * H + fall) % H) - 200;
			const size = kind === 'ash' ? 2 + r4 * 6 : 5 + r4 * 12;
			if (kind === 'ash') {
				items.push(
					<ellipse
						key={i}
						cx={x}
						cy={y}
						rx={size}
						ry={size * 0.6}
						transform={`rotate(${t * 3 + r1 * 360} ${x} ${y})`}
						fill={color ?? (r3 > 0.7 ? '#cfc6bd' : '#8d837b')}
						opacity={(0.35 + r4 * 0.55) * amount}
					/>,
				);
			} else {
				const len = 30 + r3 * 60;
				items.push(
					<g key={i} opacity={amount}>
						<line x1={x - len * 0.15} y1={y - len} x2={x} y2={y} stroke="#ffb36b" strokeOpacity={0.35} strokeWidth={size * 0.7} strokeLinecap="round" />
						<circle cx={x} cy={y} r={size} fill={color ?? '#6d625a'} stroke={INK} strokeWidth={3} />
					</g>,
				);
			}
		} else if (kind === 'embers' || kind === 'sparks') {
			const a = area ?? {x: -100, y: 0, w: 1280, h: 2100};
			const life = 90 + r3 * 90;
			const local = (t + r1 * life) % life;
			const p = local / life;
			const x = a.x + r2 * a.w + Math.sin(local * 0.08 + r4 * 6) * 30 + (kind === 'sparks' ? (r4 - 0.5) * local * 3 : 0);
			const y = a.y + a.h - p * a.h * (kind === 'sparks' ? 0.6 : 1.1) * (0.6 + r4 * 0.6);
			const size = 2 + r4 * 5;
			const op = Math.sin(p * Math.PI) * amount;
			items.push(
				<g key={i}>
					<circle cx={x} cy={y} r={size * 3.2} fill={color ?? '#ff7a1a'} opacity={op * 0.25} />
					<circle cx={x} cy={y} r={size} fill="#ffe2a0" opacity={op} />
				</g>,
			);
		} else if (kind === 'dust') {
			const a = area ?? {x: 0, y: 0, w: 1080, h: 1920};
			const x = a.x + ((r1 * a.w + Math.sin(t * 0.01 + r3 * 7) * 60 + t * 0.2) % a.w);
			const y = a.y + ((r2 * a.h + Math.cos(t * 0.012 + r4 * 7) * 50 - t * 0.15 + a.h) % a.h);
			const tw = 0.5 + 0.5 * Math.sin(t * 0.08 + r3 * 20);
			items.push(<circle key={i} cx={x} cy={y} r={1.5 + r4 * 3.5} fill={color ?? '#fff3cf'} opacity={tw * amount * 0.8} />);
		} else if (kind === 'steam') {
			const a = area ?? {x: 0, y: 0, w: 200, h: 300};
			const life = 70 + r3 * 40;
			const local = (t + r1 * life) % life;
			const p = local / life;
			const x = a.x + r2 * a.w + Math.sin(local * 0.06 + r4 * 5) * 25 * p;
			const y = a.y + a.h - p * a.h;
			items.push(
				<circle key={i} cx={x} cy={y} r={14 + p * 40} fill={color ?? '#fff8ec'} opacity={Math.sin(p * Math.PI) * 0.22 * amount} />,
			);
		}
	}
	return (
		<svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
			{items}
		</svg>
	);
};

/** A flock of simple flapping birds crossing the frame. */
export const Birds: React.FC<{count: number; seed: string; y: number; speed?: number; scale?: number}> = ({
	count,
	seed,
	y,
	speed = 1,
	scale = 1,
}) => {
	const frame = useCurrentFrame();
	return (
		<svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
			{new Array(count).fill(0).map((_, i) => {
				const r1 = random(`${seed}-${i}`);
				const r2 = random(`${seed}-y-${i}`);
				const x = -150 + ((frame * 3.2 * speed + r1 * 500) % 1500);
				const yy = y + r2 * 160 + Math.sin(frame * 0.05 + i) * 12;
				const flap = Math.sin(frame * 0.55 + i * 1.7) * 14;
				const s = scale * (0.6 + r2 * 0.6);
				return (
					<path
						key={i}
						d={`M ${-22 * s} ${-flap * s} Q ${-10 * s} ${-6 * s} 0 0 Q ${10 * s} ${-6 * s} ${22 * s} ${-flap * s}`}
						transform={`translate(${x} ${yy})`}
						stroke={INK}
						strokeWidth={4 * s}
						fill="none"
						strokeLinecap="round"
					/>
				);
			})}
		</svg>
	);
};
