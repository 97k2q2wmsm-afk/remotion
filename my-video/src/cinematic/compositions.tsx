// Studio registrations for the cinematic engine.
import {linearTiming, TransitionSeries} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import React from 'react';
import {AbsoluteFill, Composition, Folder} from 'remotion';
import {calculateSceneMetadata, CinematicScene, CinematicSceneProps} from './CinematicScene';
import {SAMPLE_CAMERA_SEQUENCE, SAMPLE_CHARACTERS, SAMPLE_PROJECT_SCENES, SAMPLE_ROME_SCENE, SAMPLE_TEST_ENVIRONMENT} from './samples';
import type {Character, FormatId, RenderQuality, Scene, StyleId} from './schema';
import {FORMATS, TRANSITIONS} from './schema';

type SequenceProps = {scenes: Scene[]; characters: Character[]; format: FormatId; fps: number; style: StyleId; quality: RenderQuality};

/** Multi-scene preview inside Remotion Studio (the studio app exports via FFmpeg instead). */
const CinematicSequence: React.FC<SequenceProps> = ({scenes, characters, format, fps, style, quality}) => (
	<AbsoluteFill style={{background: '#000'}}>
		<TransitionSeries>
			{scenes.flatMap((s, i) => {
				const seq = (
					<TransitionSeries.Sequence key={s.scene_id} durationInFrames={Math.round(s.duration * fps)}>
						<CinematicScene scene={s} characters={characters} format={format} fps={fps} style={style} quality={quality} assetBaseUrl={null} burnSubtitles={false} />
					</TransitionSeries.Sequence>
				);
				const next = scenes[i + 1];
				if (!next || next.transition === 'cut') return [seq];
				const frames = Math.round(TRANSITIONS[next.transition].seconds * fps);
				const presentation = next.transition === 'slide' || next.transition === 'whip' ? slide({direction: 'from-right'}) : fade();
				return [seq, <TransitionSeries.Transition key={`${s.scene_id}-t`} presentation={presentation} timing={linearTiming({durationInFrames: frames})} />];
			})}
		</TransitionSeries>
	</AbsoluteFill>
);

const sequenceMeta = ({props}: {props: SequenceProps}) => {
	const total = props.scenes.reduce((a, s) => a + Math.round(s.duration * props.fps), 0);
	const overlap = props.scenes.slice(1).reduce((a, s) => a + (s.transition === 'cut' ? 0 : Math.round(TRANSITIONS[s.transition].seconds * props.fps)), 0);
	const f = FORMATS[props.format];
	return {durationInFrames: total - overlap, width: f.width, height: f.height, fps: props.fps};
};

const sceneProps = (scene: Scene, format: FormatId = '16:9'): CinematicSceneProps => ({scene, characters: SAMPLE_CHARACTERS, format, fps: 24, style: 'epic_historical', quality: 'final', assetBaseUrl: null, burnSubtitles: false});

export const CinematicCompositions: React.FC = () => (
	<Folder name="Cinematic-Studio">
		<Composition id="CinematicScene" component={CinematicScene} calculateMetadata={calculateSceneMetadata} defaultProps={sceneProps(SAMPLE_ROME_SCENE)} width={1920} height={1080} fps={24} durationInFrames={192} />
		<Composition id="Cinematic-TestEnvironment" component={CinematicScene} calculateMetadata={calculateSceneMetadata} defaultProps={{...sceneProps(SAMPLE_TEST_ENVIRONMENT), style: 'nature' as StyleId}} width={1920} height={1080} fps={24} durationInFrames={144} />
		<Composition id="Cinematic-CameraSequence" component={CinematicSequence} calculateMetadata={sequenceMeta} defaultProps={{scenes: SAMPLE_CAMERA_SEQUENCE, characters: [], format: '16:9' as FormatId, fps: 24, style: 'nature' as StyleId, quality: 'final' as RenderQuality}} width={1920} height={1080} fps={24} durationInFrames={360} />
		<Composition id="Cinematic-Sample" component={CinematicSequence} calculateMetadata={sequenceMeta} defaultProps={{scenes: SAMPLE_PROJECT_SCENES, characters: SAMPLE_CHARACTERS, format: '16:9' as FormatId, fps: 24, style: 'epic_historical' as StyleId, quality: 'final' as RenderQuality}} width={1920} height={1080} fps={24} durationInFrames={600} />
	</Folder>
);
