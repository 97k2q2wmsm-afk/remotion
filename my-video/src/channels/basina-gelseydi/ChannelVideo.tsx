import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Grain} from '../../engine/Light';
import {SceneShell, sceneSpan} from '../../engine/SceneShell';
import {SceneProps, Timeline, TimelineWord} from '../../engine/timeline';
import {BODY_FONT, BRAND, HEAD_FONT} from './brand';

const norm = (t: string) =>
	t
		.toLocaleLowerCase('tr')
		.replace(/ı/g, 'i')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]/g, '');

type Page = {words: TimelineWord[]; startMs: number; endMs: number};

const paginate = (words: TimelineWord[], maxWords: number): Page[] => {
	const pages: Page[] = [];
	let cur: TimelineWord[] = [];
	words.forEach((w, i) => {
		cur.push(w);
		const punct = /[.,:;!?…]$/.test(w.text);
		const gap = words[i + 1] ? words[i + 1].startMs - w.endMs : 0;
		if (cur.length >= maxWords || punct || gap > 300 || i === words.length - 1) {
			pages.push({words: cur, startMs: cur[0].startMs, endMs: w.endMs});
			cur = [];
		}
	});
	return pages.map((p, i) => ({...p, endMs: Math.min(pages[i + 1]?.startMs ?? p.endMs + 500, p.endMs + 500)}));
};

/** Turkish word-synced captions: 1–3 words per page, active word pops, key words highlighted. */
export const TrCaptions: React.FC<{words: TimelineWord[]; emphasis: string[]; hideFromMs: number | null; y: number}> = ({words, emphasis, hideFromMs, y}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const pages = useMemo(() => paginate(words, 3), [words]);
	const emph = useMemo(() => new Set(emphasis.map(norm)), [emphasis]);
	const ms = (frame / fps) * 1000;
	if (hideFromMs !== null && ms >= hideFromMs) return null;
	const page = pages.find((p) => ms >= p.startMs - 40 && ms < p.endMs);
	if (!page) return null;
	const enter = spring({frame: frame - Math.round((page.startMs / 1000) * fps), fps, config: {damping: 13, stiffness: 240, mass: 0.6}});
	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			<div
				lang="tr"
				style={{
					position: 'absolute',
					left: 60,
					right: 60,
					top: y,
					transform: `translateY(-50%) translateY(${(1 - enter) * 36}px) scale(${0.86 + enter * 0.14})`,
					opacity: enter,
					display: 'flex',
					flexWrap: 'wrap',
					justifyContent: 'center',
					gap: '0px 26px',
					fontFamily: HEAD_FONT,
					fontSize: 112,
					lineHeight: 1.06,
					textTransform: 'uppercase',
					textAlign: 'center',
					letterSpacing: 1.5,
				}}
			>
				{page.words.map((w, i) => {
					const active = ms >= w.startMs - 30 && ms < (page.words[i + 1]?.startMs ?? page.endMs);
					const pop = spring({frame: frame - Math.round((w.startMs / 1000) * fps), fps, config: {damping: 9, stiffness: 320, mass: 0.45}});
					const isEmph = emph.has(norm(w.text));
					const color = isEmph ? BRAND.yellow : active ? '#ffffff' : 'rgba(255,255,255,0.92)';
					return (
						<span
							key={`${w.startMs}-${i}`}
							style={{
								display: 'inline-block',
								color,
								WebkitTextStroke: `14px ${BRAND.ink}`,
								paintOrder: 'stroke fill',
								textShadow: `0 9px 0 ${BRAND.ink}, 0 0 36px rgba(0,0,0,0.55)`,
								transform: active ? `scale(${interpolate(pop, [0, 1], [1, isEmph ? 1.16 : 1.08])}) rotate(${interpolate(pop, [0, 1], [-4, 0])}deg)` : 'scale(1)',
							}}
						>
							{w.text.replace(/[.,:;…]+$/, '')}
						</span>
					);
				})}
			</div>
		</AbsoluteFill>
	);
};

export type ChannelVideoProps = {
	timeline: Timeline;
	scenes: Record<string, React.FC<SceneProps>>;
	audioDir: string;
	emphasis: string[];
	/** Captions disappear from this word on (e.g. the end card carries the question itself). */
	captionsUntilWord: string | null;
	/** Story-specific overlay drawn above scenes, under captions (HUDs, counters…). */
	overlay: React.ReactNode;
};

/**
 * Generic episode composition for the channel: voice-driven scene timeline with custom
 * transitions, Turkish captions, minimal brand bug, progress bar and preview audio mix.
 * (The delivered MP4 is mixed/mastered by FFmpeg — see scripts/bg-master.mjs.)
 */
export const ChannelVideo: React.FC<ChannelVideoProps> = ({timeline, scenes, audioDir, emphasis, captionsUntilWord, overlay}) => {
	const frame = useCurrentFrame();
	const {fps} = timeline;
	const speaking = useMemo(() => {
		const arr = new Uint8Array(timeline.durationInFrames + 1);
		for (const w of timeline.words) {
			for (let f = Math.floor((w.startMs / 1000) * fps); f <= Math.ceil((w.endMs / 1000) * fps) && f < arr.length; f++) arr[f] = 1;
		}
		return arr;
	}, [fps, timeline]);
	const hideFrom = captionsUntilWord ? (timeline.words.find((w) => norm(w.text) === norm(captionsUntilWord) && w.startMs > 3000)?.startMs ?? null) : null;

	return (
		<AbsoluteFill style={{background: '#000'}}>
			{timeline.scenes.map((s, i) => {
				const Comp = scenes[s.id];
				if (!Comp) throw new Error(`No component for scene "${s.id}"`);
				const outType = timeline.scenes[i + 1]?.transition ?? 'none';
				const span = sceneSpan(s.from, s.to, s.transition, outType);
				const hit = (id: string) => {
					const h = timeline.hits.find((x) => x.id === id);
					return h && h.frame >= span.start && h.frame < span.start + span.length ? h.frame - span.start : null;
				};
				const word = (text: string) => {
					const w = timeline.words.find((x) => {
						const f = Math.round((x.startMs / 1000) * fps);
						return norm(x.text) === norm(text) && f >= span.start && f < span.start + span.length;
					});
					return w ? Math.round((w.startMs / 1000) * fps) - span.start : null;
				};
				return (
					<SceneShell key={s.id} name={s.id} from={s.from} to={s.to} inType={s.transition} outType={outType}>
						<Comp durationInFrames={span.length} hit={hit} word={word} />
					</SceneShell>
				);
			})}
			{overlay}
			<Grain opacity={0.06} />
			<TrCaptions words={timeline.words} emphasis={emphasis} hideFromMs={hideFrom} y={1470} />
			{/* brand bug */}
			<div
				style={{
					position: 'absolute',
					left: 46,
					top: 64,
					fontFamily: HEAD_FONT,
					fontSize: 34,
					letterSpacing: 3,
					color: BRAND.paper,
					opacity: 0.85,
					textShadow: `0 3px 0 ${BRAND.ink}`,
					WebkitTextStroke: `6px ${BRAND.ink}`,
					paintOrder: 'stroke fill',
				}}
			>
				{BRAND.name}
				<div style={{fontFamily: BODY_FONT, fontWeight: 800, fontSize: 20, letterSpacing: 4, color: BRAND.yellow, WebkitTextStroke: `5px ${BRAND.ink}`}}>{BRAND.series}</div>
			</div>
			<div style={{position: 'absolute', left: 0, bottom: 0, height: 10, width: `${(frame / timeline.durationInFrames) * 100}%`, background: `linear-gradient(90deg, ${BRAND.orange}, ${BRAND.yellow})`}} />
			<Sequence from={timeline.voiceStartFrame} name="Anlatıcı">
				<Audio src={staticFile(`${audioDir}/voice.mp3`)} />
			</Sequence>
			<Audio
				name="Müzik + SFX"
				src={staticFile(`${audioDir}/score.wav`)}
				volume={(f) => {
					let s = 0;
					for (let k = -6; k <= 6; k++) s += speaking[Math.min(Math.max(f + k, 0), speaking.length - 1)];
					return interpolate(s / 13, [0, 1], [0.8, 0.38]);
				}}
			/>
		</AbsoluteFill>
	);
};
