import React from 'react';
import {Composition, Still} from 'remotion';
import {ChannelVideo, ChannelVideoProps} from '../../channels/basina-gelseydi/ChannelVideo';
import {sceneSpan} from '../../engine/SceneShell';
import {SceneProps, Timeline} from '../../engine/timeline';
import {Cover} from './Cover';
import {Aftermath, Earth, Finale, Hook, Morning, Return, Rising, Suspended, SwitchOff} from './scenes';
import timelineJson from './timeline.json';
import {GravityHUD, SceneStart} from './world';

const timeline = timelineJson as Timeline;

const raw: Record<string, React.FC<SceneProps>> = {
	hook: Hook,
	sabah: Morning,
	kapanis: SwitchOff,
	zipla: Rising,
	dunya: Earth,
	askida: Suspended,
	donus: Return,
	sonuc: Aftermath,
	final: Finale,
};

// Each scene also needs the GLOBAL frame (the physics simulation runs on one clock).
const scenes: Record<string, React.FC<SceneProps>> = Object.fromEntries(
	timeline.scenes.map((s, i) => {
		const Comp = raw[s.id];
		const span = sceneSpan(s.from, s.to, s.transition, timeline.scenes[i + 1]?.transition ?? 'none');
		const Wrapped: React.FC<SceneProps> = (p) => (
			<SceneStart.Provider value={span.start}>
				<Comp {...p} />
			</SceneStart.Provider>
		);
		return [s.id, Wrapped];
	}),
);

const props: ChannelVideoProps = {
	timeline,
	scenes,
	audioDir: 'yercekimi',
	emphasis: ['yerçekimi', 'uçan', 'kapanır', 'havalanır', 'durmuyorsun', 'kaçırdın', 'dünya', 'bir metre', 'metre', 'top', 'yirmi', 'sekiz', 'dokuz', 'balkona', 'on', 'düşer', 'çakılır', 'altüst'],
	captionsUntilWord: 'Peki',
	overlay: <GravityHUD />,
};

const YercekimiVideo: React.FC = () => <ChannelVideo {...props} />;

export const YercekimiComposition: React.FC = () => (
	<>
		<Composition id="Yercekimi" component={YercekimiVideo} durationInFrames={timeline.durationInFrames} fps={timeline.fps} width={1080} height={1920} />
		<Still id="Yercekimi-Kapak" component={Cover} width={1080} height={1920} />
	</>
);
