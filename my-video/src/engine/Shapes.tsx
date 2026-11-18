import React from 'react';

export const INK = '#1a0d08';
export const STROKE = 7;

export type Circle = {cx: number; cy: number; r: number};

/**
 * Draws a union of circles with ONE clean bold outline around the whole silhouette
 * (outline pass first, fill pass on top) – the core trick of the illustrated cloud style.
 */
export const Blob: React.FC<{
	circles: Circle[];
	fill: string;
	outline?: string;
	stroke?: number;
	highlight?: string | null;
	shade?: string | null;
}> = ({circles, fill, outline = INK, stroke = STROKE, highlight = null, shade = null}) => (
	<g>
		{circles.map((c, i) => (
			<circle key={`o${i}`} cx={c.cx} cy={c.cy} r={c.r + stroke} fill={outline} />
		))}
		{circles.map((c, i) => (
			<circle key={`f${i}`} cx={c.cx} cy={c.cy} r={c.r} fill={fill} />
		))}
		{shade
			? circles.map((c, i) => (
					<circle key={`s${i}`} cx={c.cx + c.r * 0.18} cy={c.cy + c.r * 0.22} r={c.r * 0.72} fill={shade} />
				))
			: null}
		{highlight
			? circles.map((c, i) => (
					<circle key={`h${i}`} cx={c.cx - c.r * 0.28} cy={c.cy - c.r * 0.3} r={c.r * 0.42} fill={highlight} />
				))
			: null}
	</g>
);

/** Linear gradient helper for SVG defs. */
export const LinearGrad: React.FC<{
	id: string;
	stops: [number, string][];
	x2?: number;
	y2?: number;
}> = ({id, stops, x2 = 0, y2 = 1}) => (
	<linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
		{stops.map(([o, c]) => (
			<stop key={o} offset={o} stopColor={c} />
		))}
	</linearGradient>
);

export const RadialGrad: React.FC<{id: string; stops: [number, string, number?][]}> = ({id, stops}) => (
	<radialGradient id={id}>
		{stops.map(([o, c, op]) => (
			<stop key={o} offset={o} stopColor={c} stopOpacity={op ?? 1} />
		))}
	</radialGradient>
);
