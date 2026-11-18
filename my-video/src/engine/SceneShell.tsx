import React from 'react';
import {AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame} from 'remotion';
import {TRANSITION_FRAMES, TransitionType} from './timeline';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const inOut = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * Custom transition system. A transition is centred on the cut: the incoming scene starts
 * `d/2` frames early and the outgoing scene runs `d/2` frames late. The incoming scene is
 * drawn on top and both read the same progress, so they stay perfectly in sync.
 */
const enterStyle = (type: TransitionType, p: number): React.CSSProperties => {
	const e = inOut(p);
	switch (type) {
		case 'fade':
			return {opacity: e};
		case 'whip':
			return {transform: `translateX(${(1 - e) * 1080}px)`, filter: p < 1 ? `blur(${Math.sin(p * Math.PI) * 18}px)` : undefined};
		case 'flash':
			return {opacity: p >= 0.5 ? 1 : 0};
		case 'zoom':
			return {opacity: Math.min(1, e * 1.6), transform: `scale(${1.7 - 0.7 * e})`};
		case 'smoke': {
			const r = e * 140;
			const mask = `radial-gradient(circle at 50% 58%, black ${r}%, transparent ${r + 22}%)`;
			return {WebkitMaskImage: mask, maskImage: mask};
		}
		default:
			return {};
	}
};

const exitStyle = (type: TransitionType, p: number): React.CSSProperties => {
	const e = inOut(p);
	switch (type) {
		case 'whip':
			return {transform: `translateX(${-e * 1080}px)`, filter: p > 0 ? `blur(${Math.sin(p * Math.PI) * 18}px)` : undefined};
		case 'zoom':
			return {transform: `scale(${1 + e * 1.2})`};
		case 'smoke':
			return {filter: `brightness(${1 - e * 0.5})`};
		default:
			return {};
	}
};

const Overlay: React.FC<{type: TransitionType; p: number}> = ({type, p}) => {
	if (type === 'flash') {
		const o = 1 - Math.abs(p * 2 - 1);
		return <AbsoluteFill style={{background: '#fff5dc', opacity: o ** 0.6}} />;
	}
	if (type === 'smoke') {
		// Rolling ash front on the edge of the reveal.
		const o = Math.sin(p * Math.PI);
		return (
			<AbsoluteFill
				style={{
					background: `radial-gradient(circle at 50% 58%, transparent ${p * 140 - 6}%, rgba(40,32,28,0.95) ${p * 140 + 10}%, transparent ${p * 140 + 40}%)`,
					opacity: o,
				}}
			/>
		);
	}
	if (type === 'whip') {
		const o = Math.sin(p * Math.PI) * 0.35;
		return <AbsoluteFill style={{background: 'linear-gradient(90deg, transparent, rgba(255,240,210,0.9), transparent)', opacity: o}} />;
	}
	return null;
};

const Inner: React.FC<{
	inType: TransitionType;
	outType: TransitionType;
	dIn: number;
	dOut: number;
	core: number;
	children: React.ReactNode;
}> = ({inType, outType, dIn, dOut, core, children}) => {
	// Scene clock starts when the scene first becomes visible (= cut - dIn/2).
	const f = useCurrentFrame();
	const pin = dIn > 0 ? interpolate(f, [0, dIn], [0, 1], clamp) : 1;
	const outStart = dIn / 2 + core - dOut / 2;
	const pout = dOut > 0 ? interpolate(f, [outStart, outStart + dOut], [0, 1], clamp) : 0;
	const style: React.CSSProperties = {
		...(pin < 1 ? enterStyle(inType, pin) : {}),
		...(pout > 0 ? exitStyle(outType, pout) : {}),
	};
	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			<AbsoluteFill style={style}>
				{children}
			</AbsoluteFill>
			{pin < 1 ? <Overlay type={inType} p={pin} /> : null}
		</AbsoluteFill>
	);
};

/** Visible span of a scene including transition overlap. */
export const sceneSpan = (from: number, to: number, inType: TransitionType, outType: TransitionType) => {
	const start = from - Math.round(TRANSITION_FRAMES[inType] / 2);
	const end = to + Math.round(TRANSITION_FRAMES[outType] / 2);
	return {start, length: end - start};
};

export const SceneShell: React.FC<{
	from: number;
	to: number;
	inType: TransitionType;
	outType: TransitionType;
	name: string;
	children: React.ReactNode;
}> = ({from, to, inType, outType, name, children}) => {
	const dIn = TRANSITION_FRAMES[inType];
	const dOut = TRANSITION_FRAMES[outType];
	const start = from - Math.round(dIn / 2);
	const core = to - from;
	return (
		<Sequence name={name} from={start} durationInFrames={core + Math.round(dIn / 2) + Math.round(dOut / 2)} premountFor={30}>
			<Inner inType={inType} outType={outType} dIn={dIn} dOut={dOut} core={core}>
				{children}
			</Inner>
		</Sequence>
	);
};
