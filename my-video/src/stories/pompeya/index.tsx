import React from 'react';
import {Composition} from 'remotion';
import {StoryVideo, StoryVideoProps} from '../../engine/StoryVideo';
import {Timeline} from '../../engine/timeline';
import {Discovery, Eruption, Hook, Night, Outro, Pliny, Streets, Surge} from './scenes';
import timelineJson from './timeline.json';

const timeline = timelineJson as Timeline;

const props: StoryVideoProps = {
	timeline,
	audioDir: 'pompeya',
	brand: 'LA VOZ DEL LEGADO',
	captionEmphasis: ['pompeya', 'vesubio', 'fuego', 'ceniza', 'noche', 'plinio', 'nunca', 'ardiente', 'desaparecio', 'preservado'],
	captionsUntilScene: 'outro',
	scenes: {
		hook: Hook,
		calles: Streets,
		erupcion: Eruption,
		noche: Night,
		plinio: Pliny,
		nube: Surge,
		hallazgo: Discovery,
		outro: Outro,
	},
};

// Scene components are not serialisable, so they are bound here instead of passed as props.
const PompeyaVideo: React.FC = () => <StoryVideo {...props} />;

export const PompeyaComposition: React.FC = () => (
	<Composition
		id="Pompeya"
		component={PompeyaVideo}
		durationInFrames={timeline.durationInFrames}
		fps={timeline.fps}
		width={1080}
		height={1920}
	/>
);
