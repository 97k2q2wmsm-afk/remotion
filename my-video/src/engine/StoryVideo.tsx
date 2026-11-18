import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Captions} from './Captions';
import {Watermark} from './Kinetic';
import {Grain} from './Light';
import {SceneShell, sceneSpan} from './SceneShell';
import {SceneProps, Timeline} from './timeline';

export type StoryVideoProps = {
	timeline: Timeline;
	scenes: Record<string, React.FC<SceneProps>>;
	audioDir: string;
	brand: string;
	captionEmphasis: string[];
	/** Hide captions from this scene on (e.g. the branded outro has its own text). */
	captionsUntilScene: string | null;
};

/**
 * Generic engine composition: lays out scenes on the voice-driven timeline, applies
 * transitions, mixes narration + score with automatic ducking, and overlays captions.
 */
export const StoryVideo: React.FC<StoryVideoProps> = ({
	timeline,
	scenes,
	audioDir,
	brand,
	captionEmphasis,
	captionsUntilScene,
}) => {
	const frame = useCurrentFrame();
	const {fps} = timeline;

	// Frames where narration is active → music ducks under the voice.
	const speaking = useMemo(() => {
		const arr = new Uint8Array(timeline.durationInFrames + 1);
		for (const w of timeline.words) {
			const a = Math.floor((w.startMs / 1000) * fps);
			const b = Math.ceil((w.endMs / 1000) * fps);
			for (let f = a; f <= b && f < arr.length; f++) arr[f] = 1;
		}
		return arr;
	}, [fps, timeline]);

	const captionsEnd = captionsUntilScene
		? ((timeline.scenes.find((s) => s.id === captionsUntilScene)?.from ?? Infinity) / fps) * 1000
		: null;

	return (
		<AbsoluteFill style={{background: '#000'}}>
			{timeline.scenes.map((s, i) => {
				const Comp = scenes[s.id];
				if (!Comp) {
					throw new Error(`No component for scene "${s.id}"`);
				}
				const outType = timeline.scenes[i + 1]?.transition ?? 'none';
				const span = sceneSpan(s.from, s.to, s.transition, outType);
				const hit = (id: string) => {
					const h = timeline.hits.find((x) => x.id === id);
					return h && h.frame >= span.start && h.frame < span.start + span.length ? h.frame - span.start : null;
				};
				const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
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

			<Grain opacity={0.07} />
			<Watermark text={brand} />
			<Captions words={timeline.words} hideAfterMs={captionsEnd} emphasis={captionEmphasis} />

			{/* progress bar */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					height: 8,
					width: `${(frame / timeline.durationInFrames) * 100}%`,
					background: 'linear-gradient(90deg, #b8772a, #ffc93c)',
				}}
			/>

			<Sequence from={timeline.voiceStartFrame} name="Narración">
				<Audio src={staticFile(`${audioDir}/voice.mp3`)} />
			</Sequence>
			<Audio
				name="Música + SFX"
				src={staticFile(`${audioDir}/score.wav`)}
				volume={(f) => {
					// Smooth ducking: average the speaking mask over ±6 frames.
					let s = 0;
					for (let k = -6; k <= 6; k++) s += speaking[Math.min(Math.max(f + k, 0), speaking.length - 1)];
					const duck = s / 13;
					return interpolate(duck, [0, 1], [0.85, 0.42]);
				}}
			/>
		</AbsoluteFill>
	);
};
