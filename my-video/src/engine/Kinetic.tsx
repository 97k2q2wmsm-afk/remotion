import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CAPTION_FONT, TITLE_FONT} from './fonts';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Big engraved-gold title that assembles letter by letter. */
export const TitleCard: React.FC<{
	kicker: string | null;
	title: string;
	at: number;
	out: number;
	y: number;
	size?: number;
}> = ({kicker, title, at, out, y, size = 120}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const fadeOut = interpolate(frame, [out, out + 10], [1, 0], clamp);
	if (frame < at || fadeOut <= 0) {
		return null;
	}
	const k = spring({frame: frame - at, fps, config: {damping: 16, stiffness: 120}});
	return (
		<AbsoluteFill style={{opacity: fadeOut, pointerEvents: 'none'}}>
			<div style={{position: 'absolute', top: y, left: 0, right: 0, textAlign: 'center'}}>
				{kicker ? (
					<div
						style={{
							fontFamily: CAPTION_FONT,
							fontWeight: 800,
							fontSize: 40,
							letterSpacing: interpolate(k, [0, 1], [30, 12]),
							color: '#ffe7b0',
							opacity: k,
							textShadow: '0 4px 18px rgba(0,0,0,0.8)',
							marginBottom: 10,
						}}
					>
						{kicker}
					</div>
				) : null}
				<div style={{fontFamily: TITLE_FONT, fontWeight: 900, fontSize: size, lineHeight: 1.02}}>
					{title.split('').map((ch, i) => {
						const s = spring({frame: frame - at - i * 1.2, fps, config: {damping: 12, stiffness: 160}});
						return (
							<span
								key={i}
								style={{
									display: 'inline-block',
									whiteSpace: 'pre',
									transform: `translateY(${(1 - s) * 60}px) scale(${0.6 + s * 0.4})`,
									opacity: s,
									background: 'linear-gradient(180deg, #fff3c4 0%, #f2c25b 45%, #b8772a 100%)',
									WebkitBackgroundClip: 'text',
									backgroundClip: 'text',
									color: 'transparent',
									filter: 'drop-shadow(0 6px 0 #2a1306) drop-shadow(0 0 26px rgba(0,0,0,0.7))',
								}}
							>
								{ch}
							</span>
						);
					})}
				</div>
			</div>
		</AbsoluteFill>
	);
};

/** Counting statistic, e.g. "30 KM". */
export const StatCallout: React.FC<{
	value: number;
	suffix: string;
	label: string;
	at: number;
	out: number;
	x: number;
	y: number;
	color?: string;
}> = ({value, suffix, label, at, out, x, y, color = '#FF6A3D'}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const o = interpolate(frame, [out, out + 10], [1, 0], clamp);
	if (frame < at || o <= 0) {
		return null;
	}
	const s = spring({frame: frame - at, fps, config: {damping: 11, stiffness: 180}});
	const n = Math.round(interpolate(frame, [at, at + 22], [0, value], clamp));
	return (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				transform: `translate(-50%, -50%) scale(${s}) rotate(${(1 - s) * -8}deg)`,
				opacity: o,
				textAlign: 'center',
			}}
		>
			<div
				style={{
					fontFamily: TITLE_FONT,
					fontWeight: 900,
					fontSize: 150,
					color,
					WebkitTextStroke: '10px #120804',
					paintOrder: 'stroke fill',
					lineHeight: 1,
					textShadow: '0 10px 0 rgba(0,0,0,0.5)',
				}}
			>
				{n}
				<span style={{fontSize: 80}}>{suffix}</span>
			</div>
			<div
				style={{
					fontFamily: CAPTION_FONT,
					fontWeight: 800,
					fontSize: 38,
					letterSpacing: 6,
					color: '#fff',
					background: 'rgba(18,8,4,0.8)',
					padding: '8px 18px',
					borderRadius: 10,
					display: 'inline-block',
					marginTop: 8,
				}}
			>
				{label}
			</div>
		</div>
	);
};

/** Channel watermark shown in the top-left safe area. */
export const Watermark: React.FC<{text: string}> = ({text}) => (
	<div
		style={{
			position: 'absolute',
			top: 92,
			left: 0,
			right: 0,
			textAlign: 'center',
			fontFamily: TITLE_FONT,
			fontWeight: 700,
			fontSize: 30,
			letterSpacing: 8,
			color: 'rgba(255,236,190,0.85)',
			textShadow: '0 2px 10px rgba(0,0,0,0.8)',
		}}
	>
		❦ {text} ❦
	</div>
);
