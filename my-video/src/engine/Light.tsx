import React from 'react';
import {AbsoluteFill, interpolate, random, useCurrentFrame} from 'remotion';

/** Volumetric light shafts fanning from an origin point. */
export const GodRays: React.FC<{
	x: number;
	y: number;
	color: string;
	opacity?: number;
	rays?: number;
	spread?: number;
	angle?: number;
	seed?: string;
}> = ({x, y, color, opacity = 0.35, rays = 7, spread = 70, angle = 180, seed = 'rays'}) => {
	const frame = useCurrentFrame();
	return (
		<svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{position: 'absolute', inset: 0, overflow: 'visible', mixBlendMode: 'screen'}}>
			<defs>
				<radialGradient id={`gr-${seed}`} cx={x} cy={y} r={2200} gradientUnits="userSpaceOnUse">
					<stop offset={0} stopColor={color} stopOpacity={1} />
					<stop offset={0.7} stopColor={color} stopOpacity={0} />
				</radialGradient>
			</defs>
			{new Array(rays).fill(0).map((_, i) => {
				const r = random(`${seed}-${i}`);
				const a = angle - spread / 2 + (spread / (rays - 1)) * i + Math.sin(frame * 0.015 + r * 9) * 3;
				const w = 3 + r * 6;
				const rad = (d: number) => (d * Math.PI) / 180;
				const len = 2600;
				const p1x = x + Math.sin(rad(a - w)) * len;
				const p1y = y - Math.cos(rad(a - w)) * len;
				const p2x = x + Math.sin(rad(a + w)) * len;
				const p2y = y - Math.cos(rad(a + w)) * len;
				const flicker = 0.55 + 0.45 * Math.sin(frame * 0.04 + r * 12);
				return (
					<path key={i} d={`M ${x} ${y} L ${p1x} ${p1y} L ${p2x} ${p2y} Z`} fill={`url(#gr-${seed})`} opacity={opacity * flicker} />
				);
			})}
		</svg>
	);
};

/** Soft radial light source. */
export const Glow: React.FC<{
	x: number;
	y: number;
	radius: number;
	color: string;
	opacity?: number;
	blend?: React.CSSProperties['mixBlendMode'];
	pulse?: number;
}> = ({x, y, radius, color, opacity = 0.6, blend = 'screen', pulse = 0}) => {
	const frame = useCurrentFrame();
	const k = 1 + Math.sin(frame * 0.12) * pulse + Math.sin(frame * 0.31) * pulse * 0.5;
	return (
		<div
			style={{
				position: 'absolute',
				left: x - radius,
				top: y - radius,
				width: radius * 2,
				height: radius * 2,
				borderRadius: '50%',
				background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
				opacity: opacity * k,
				mixBlendMode: blend,
			}}
		/>
	);
};

/** Cinematic vignette. */
export const Vignette: React.FC<{strength?: number; color?: string}> = ({strength = 0.55, color = '0,0,0'}) => (
	<AbsoluteFill
		style={{
			background: `radial-gradient(ellipse 75% 62% at 50% 48%, transparent 45%, rgba(${color},${strength}) 100%)`,
			pointerEvents: 'none',
		}}
	/>
);

/** Colour grade overlay (e.g. warm golden hour, cold night, burning red). */
export const Grade: React.FC<{
	color: string;
	opacity: number;
	blend?: React.CSSProperties['mixBlendMode'];
}> = ({color, opacity, blend = 'soft-light'}) => (
	<AbsoluteFill style={{background: color, opacity, mixBlendMode: blend, pointerEvents: 'none'}} />
);

/** Animated film grain – cheap: one small noise tile re-positioned every frame. */
export const Grain: React.FC<{opacity?: number}> = ({opacity = 0.08}) => {
	const frame = useCurrentFrame();
	const ox = Math.floor(random(`gx${frame}`) * 200);
	const oy = Math.floor(random(`gy${frame}`) * 200);
	return (
		<AbsoluteFill style={{opacity, mixBlendMode: 'overlay', pointerEvents: 'none', overflow: 'hidden'}}>
			<svg width={1280} height={2120} style={{position: 'absolute', left: -ox, top: -oy}}>
				<filter id="grain">
					<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 7} stitchTiles="stitch" />
					<feColorMatrix type="saturate" values="0" />
				</filter>
				<rect width="100%" height="100%" filter="url(#grain)" />
			</svg>
		</AbsoluteFill>
	);
};

/** A flash of light peaking at `at` (local frame). */
export const Flash: React.FC<{at: number; color?: string; attack?: number; decay?: number; peak?: number}> = ({
	at,
	color = '#fff6e0',
	attack = 2,
	decay = 18,
	peak = 1,
}) => {
	const frame = useCurrentFrame();
	const o = interpolate(frame, [at - attack, at, at + decay], [0, peak, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	if (o <= 0) {
		return null;
	}
	return <AbsoluteFill style={{background: color, opacity: o, mixBlendMode: 'screen', pointerEvents: 'none'}} />;
};

/** Random volcanic lightning flicker. */
export const LightningFlicker: React.FC<{seed: string; chance?: number; color?: string}> = ({
	seed,
	chance = 0.04,
	color = '#d9c9ff',
}) => {
	const frame = useCurrentFrame();
	// Look back a few frames so each strike has a short decay.
	let o = 0;
	for (let k = 0; k < 5; k++) {
		if (random(`${seed}-${frame - k}`) < chance) {
			o = Math.max(o, (1 - k / 5) * 0.55);
		}
	}
	if (o === 0) {
		return null;
	}
	return <AbsoluteFill style={{background: color, opacity: o, mixBlendMode: 'screen'}} />;
};
