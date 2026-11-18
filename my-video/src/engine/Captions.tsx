import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CAPTION_FONT} from './fonts';
import {TimelineWord} from './timeline';

type Page = {words: TimelineWord[]; startMs: number; endMs: number};

/**
 * Automatic word-synced captions built from the transcript timestamps.
 * Pages hold up to `maxWords` words and always break after punctuation, so a caption
 * never straddles two sentences.
 */
const paginate = (words: TimelineWord[], maxWords: number): Page[] => {
	const pages: Page[] = [];
	let cur: TimelineWord[] = [];
	words.forEach((w, i) => {
		cur.push(w);
		const punct = /[.,:;!?…]$/.test(w.text);
		const gap = words[i + 1] ? words[i + 1].startMs - w.endMs : 0;
		if (cur.length >= maxWords || punct || gap > 350 || i === words.length - 1) {
			pages.push({words: cur, startMs: cur[0].startMs, endMs: w.endMs});
			cur = [];
		}
	});
	return pages.map((p, i) => ({
		...p,
		endMs: Math.min(pages[i + 1]?.startMs ?? p.endMs + 600, p.endMs + 600),
	}));
};

const clean = (t: string) => t.replace(/\.\.\.$/, '…').replace(/[.,:;]$/, '');

export const Captions: React.FC<{
	words: TimelineWord[];
	maxWords?: number;
	/** Vertical centre of the caption block. Keep clear of the Shorts UI at the bottom. */
	y?: number;
	hideAfterMs?: number | null;
	emphasis?: string[];
}> = ({words, maxWords = 3, y = 1400, hideAfterMs = null, emphasis = []}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const pages = useMemo(() => paginate(words, maxWords), [words, maxWords]);
	const ms = (frame / fps) * 1000;
	if (hideAfterMs !== null && ms > hideAfterMs) {
		return null;
	}
	const page = pages.find((p) => ms >= p.startMs - 40 && ms < p.endMs);
	if (!page) {
		return null;
	}
	const pageFrame = Math.round((page.startMs / 1000) * fps);
	const enter = spring({frame: frame - pageFrame, fps, config: {damping: 14, stiffness: 220, mass: 0.6}});
	const emph = new Set(emphasis.map((e) => e.toLowerCase()));

	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			<div
				style={{
					position: 'absolute',
					left: 70,
					right: 70,
					top: y,
					transform: `translateY(-50%) translateY(${(1 - enter) * 40}px) scale(${0.85 + enter * 0.15})`,
					opacity: enter,
					display: 'flex',
					flexWrap: 'wrap',
					justifyContent: 'center',
					gap: '4px 38px',
					fontFamily: CAPTION_FONT,
					fontWeight: 900,
					fontSize: 88,
					lineHeight: 1.12,
					textTransform: 'uppercase',
					textAlign: 'center',
					letterSpacing: 1,
				}}
			>
				{page.words.map((w, i) => {
					const active = ms >= w.startMs - 30 && ms < (page.words[i + 1]?.startMs ?? page.endMs);
					const spoken = ms >= w.startMs - 30;
					const wf = Math.round((w.startMs / 1000) * fps);
					const pop = spring({frame: frame - wf, fps, config: {damping: 10, stiffness: 300, mass: 0.5}});
					const key = clean(w.text).toLowerCase();
					const isEmph = emph.has(key.normalize('NFD').replace(/[̀-ͯ]/g, '')) || emph.has(key);
					const color = active ? '#FFC93C' : isEmph ? '#FF6A3D' : spoken ? '#FFFFFF' : 'rgba(255,255,255,0.9)';
					return (
						<span
							key={`${w.startMs}-${i}`}
							style={{
								display: 'inline-block',
								color,
								WebkitTextStroke: '12px #120804',
								paintOrder: 'stroke fill',
								textShadow: '0 10px 0 rgba(0,0,0,0.55), 0 0 40px rgba(0,0,0,0.6)',
								transform: active ? `scale(${interpolate(pop, [0, 1], [1.0, 1.12])}) rotate(${interpolate(pop, [0, 1], [-3, 0])}deg)` : 'scale(1)',
							}}
						>
							{clean(w.text)}
						</span>
					);
				})}
			</div>
		</AbsoluteFill>
	);
};
