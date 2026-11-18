import React, {createContext, useContext, useMemo} from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';

/**
 * Virtual 2.5D camera.
 * Keys are placed on a 0..1 timeline relative to the scene length so a scene can be
 * re-timed by the voiceover without touching its camera choreography.
 */
export type CamKey = {
	at: number;
	x?: number;
	y?: number;
	zoom?: number;
	rot?: number;
};

export type CameraState = {
	x: number;
	y: number;
	zoom: number;
	rot: number;
	shakeX: number;
	shakeY: number;
};

const CameraCtx = createContext<CameraState>({x: 0, y: 0, zoom: 1, rot: 0, shakeX: 0, shakeY: 0});
export const useCamera = () => useContext(CameraCtx);

const ease = Easing.bezier(0.45, 0, 0.2, 1);

export const Camera: React.FC<{
	keys: CamKey[];
	durationInFrames: number;
	/** Shake amplitude in px for a given local frame. */
	shake: ((frame: number) => number) | null;
	children: React.ReactNode;
}> = ({keys, durationInFrames, shake, children}) => {
	const frame = useCurrentFrame();
	const state = useMemo(() => {
		// Fill missing values with the previous key's value.
		const filled = keys.reduce<Required<CamKey>[]>((acc, k) => {
			const prev = acc[acc.length - 1] ?? {at: 0, x: 0, y: 0, zoom: 1, rot: 0};
			acc.push({at: k.at, x: k.x ?? prev.x, y: k.y ?? prev.y, zoom: k.zoom ?? prev.zoom, rot: k.rot ?? prev.rot});
			return acc;
		}, []);
		const t = frame / Math.max(1, durationInFrames);
		const input = filled.map((k) => k.at);
		const pick = (prop: 'x' | 'y' | 'zoom' | 'rot') =>
			filled.length === 1
				? filled[0][prop]
				: interpolate(t, input, filled.map((k) => k[prop]), {
						easing: ease,
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					});
		const amp = shake ? shake(frame) : 0;
		return {
			x: pick('x'),
			y: pick('y'),
			zoom: pick('zoom'),
			rot: pick('rot'),
			shakeX: amp * (Math.sin(frame * 1.9) * 0.6 + Math.sin(frame * 4.3 + 1.2) * 0.4),
			shakeY: amp * (Math.cos(frame * 2.3) * 0.6 + Math.sin(frame * 5.1 + 0.4) * 0.4),
		};
	}, [durationInFrames, frame, keys, shake]);

	return <CameraCtx.Provider value={state}>{children}</CameraCtx.Provider>;
};

/**
 * A parallax plane. depth 0 = infinitely far (static), 1 = the camera's focal plane,
 * >1 = foreground that moves faster than the camera.
 */
export const Layer: React.FC<{
	depth: number;
	children: React.ReactNode;
	style?: React.CSSProperties;
}> = ({depth, children, style}) => {
	const c = useCamera();
	const scale = 1 + (c.zoom - 1) * depth;
	const tx = (-c.x + c.shakeX) * depth;
	const ty = (-c.y + c.shakeY) * depth;
	return (
		<AbsoluteFill
			style={{
				transform: `translate(${tx}px, ${ty}px) rotate(${c.rot * Math.min(depth, 1)}deg) scale(${scale})`,
				transformOrigin: '50% 50%',
				...style,
			}}
		>
			{children}
		</AbsoluteFill>
	);
};

/** Full-frame SVG canvas in video coordinates (1080x1920) that may draw beyond its edges. */
export const Stage: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({
	children,
	style,
}) => (
	<svg
		viewBox="0 0 1080 1920"
		width={1080}
		height={1920}
		style={{position: 'absolute', inset: 0, overflow: 'visible', ...style}}
	>
		{children}
	</svg>
);
