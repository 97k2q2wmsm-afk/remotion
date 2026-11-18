// Scaffold a new BAŞINA GELSEYDİ episode.
//   node scripts/bg-new.mjs <storyDir> "<Başlık>"      (npm run bg:new -- buzul "Buzullar bir gecede erirse?")
//
// Creates src/stories/<storyDir>/ (story.json, scenes.tsx, index.tsx, publish.md, physics.ts)
// and registers the composition in src/Root.tsx. Fill story.json + the scenes, put the
// narration in scripts/data/<storyDir>/ (voice_raw.mp3 + words_raw.json), then run
// `npm run bg:episode -- <storyDir>`.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const [dir, title = 'Yeni bölüm'] = process.argv.slice(2);
if (!dir || !/^[a-z0-9-]+$/.test(dir)) throw new Error('Usage: node scripts/bg-new.mjs <story-dir (a-z0-9-)> "<Başlık>"');
const root = path.resolve(import.meta.dirname, '..');
const sdir = path.join(root, 'src/stories', dir);
if (existsSync(sdir)) throw new Error(`${sdir} already exists`);
mkdirSync(sdir, {recursive: true});
mkdirSync(path.join(root, 'scripts/data', dir), {recursive: true});
const Id = dir.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
const comp = `${Id}Composition`;

writeFileSync(
	path.join(sdir, 'story.json'),
	JSON.stringify(
		{
			id: Id,
			channel: 'basina-gelseydi',
			series: 'Ya Böyle Olsaydı?',
			episode: 0,
			title,
			fps: 30,
			width: 1080,
			height: 1920,
			voice: {raw: `scripts/data/${dir}/voice_raw.mp3`, words: `scripts/data/${dir}/words_raw.json`, tempo: 1.05, leadInSeconds: 0.15, tailSeconds: 1.8},
			music: {bpm: 96, root: 41},
			rules: ['Senaryo kuralı 1…', 'Senaryo kuralı 2…'],
			scenes: [
				{id: 'hook', anchor: 'İLK KELİMELER', transition: 'none', intensity: 0.7, chord: [0, 3, 7]},
				{id: 'gelisme', anchor: 'İKİNCİ BÖLÜMÜN İLK KELİMELERİ', transition: 'whip', intensity: 0.5, chord: [-4, 0, 3]},
				{id: 'final', anchor: 'Peki', transition: 'zoom', intensity: 0.35, chord: [0, 3, 10]},
			],
			hits: [{id: 'q', word: 'SON KELİME', kind: 'sting'}],
		},
		null,
		2,
	) + '\n',
);

writeFileSync(
	path.join(sdir, 'physics.ts'),
	`// Scenario physics for "${title}". Export landingEvents() to get physics-synced impacts in the score.\nexport const landingEvents = (): {frame: number; gain: number; id: string}[] => [];\n`,
);

writeFileSync(
	path.join(sdir, 'scenes.tsx'),
	`import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Vignette} from '../../engine/Light';
import {Camera, Layer, Stage} from '../../engine/Camera';
import {SceneProps} from '../../engine/timeline';
import {Cloud, SkyGrad, Skyline, Street, Apartment} from '../../engine/modern/City';
import {CinemaLight, SpeedLines} from '../../engine/modern/Fx';
import {CAST, Person, POSES, wobblePose} from '../../engine/modern/Person';

// Starter scene built only from the channel kit. Replace with the episode's own shots
// (see src/stories/yercekimi/scenes.tsx for a complete reference episode).
export const Hook: React.FC<SceneProps> = ({durationInFrames: d}) => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill>
			<Camera durationInFrames={d} shake={null} keys={[{at: 0, zoom: 1.2, y: 80}, {at: 1, zoom: 1.0, y: -40}]}>
				<Layer depth={0.05}>
					<Stage>
						<SkyGrad id="sky-${dir}" y0={0} y1={1920} stops={[[0, '#1c5aa6'], [0.6, '#ffd7a8'], [1, '#ff9c7a']]} />
						<Cloud x={300} y={400} s={1} seed="c1" />
					</Stage>
				</Layer>
				<Layer depth={0.3}>
					<Stage>
						<Skyline y={1300} color="#7d8fb8" light="#dfe6f7" seed="far" />
					</Stage>
				</Layer>
				<Layer depth={1}>
					<Stage>
						<Apartment x={60} baseY={1560} w={480} floors={8} color="#e98c7a" shade="#c66d5c" trim="#fff0e8" seed="a" shop="BAKKAL" />
						<Street y={1560} />
						<Person x={720} y={1300} scale={0.6} look={CAST.kaan} pose={wobblePose(POSES.flail, frame, 1)} face="shock" seed="kaan" />
					</Stage>
				</Layer>
			</Camera>
			<SpeedLines amount={0.4} />
			<CinemaLight />
			<Vignette strength={0.45} />
		</AbsoluteFill>
	);
};
export const Gelisme = Hook;
export const Final = Hook;
`,
);

writeFileSync(
	path.join(sdir, 'index.tsx'),
	`import React from 'react';
import {Composition, Still} from 'remotion';
import {ChannelVideo, ChannelVideoProps} from '../../channels/basina-gelseydi/ChannelVideo';
import {Timeline} from '../../engine/timeline';
import {Final, Gelisme, Hook} from './scenes';
import timelineJson from './timeline.json';

const timeline = timelineJson as Timeline;
const props: ChannelVideoProps = {
	timeline,
	scenes: {hook: Hook, gelisme: Gelisme, final: Final},
	audioDir: '${dir}',
	emphasis: [],
	captionsUntilWord: 'Peki',
	overlay: null,
};
const Video: React.FC = () => <ChannelVideo {...props} />;
const CoverStill: React.FC = () => <Hook durationInFrames={60} hit={() => null} word={() => null} />;

export const ${comp}: React.FC = () => (
	<>
		<Composition id="${Id}" component={Video} durationInFrames={timeline.durationInFrames} fps={timeline.fps} width={1080} height={1920} />
		<Still id="${Id}-Kapak" component={CoverStill} width={1080} height={1920} />
	</>
);
`,
);

writeFileSync(
	path.join(sdir, 'timeline.json'),
	JSON.stringify({storyId: Id, fps: 30, durationInFrames: 1650, voiceStartFrame: 5, scenes: [{id: 'hook', anchor: '', transition: 'none', intensity: 0.7, chord: [0, 3, 7], from: 0, to: 550}, {id: 'gelisme', anchor: '', transition: 'whip', intensity: 0.5, chord: [-4, 0, 3], from: 550, to: 1100}, {id: 'final', anchor: '', transition: 'zoom', intensity: 0.35, chord: [0, 3, 10], from: 1100, to: 1650}], hits: [], words: []}, null, '\t') + '\n',
);

writeFileSync(
	path.join(sdir, 'publish.md'),
	`# ${title} — Yayın paketi\n\n## Başlık önerileri\n1. \n2. \n3. \n\n**En iyi başlık:** \n\n## Instagram Reels açıklaması\n\n## YouTube Shorts açıklaması\n\n## SEO anahtar kelimeleri\n\n## Hashtagler\n\n## Kapak\nout/${dir}/${dir}_kapak.jpg\n\n## Sonraki bölüm önerisi\n`,
);

// Register in Root.tsx (between the @bg-episodes markers)
const rootFile = path.join(root, 'src/Root.tsx');
let src = readFileSync(rootFile, 'utf8');
src = src.replace('// @bg-imports', `import {${comp}} from './stories/${dir}';\n// @bg-imports`);
src = src.replace('{/* @bg-episodes */}', `<${comp} />\n\t\t\t\t{/* @bg-episodes */}`);
writeFileSync(rootFile, src);
console.log(`Created src/stories/${dir} and registered <${comp}/> in Root.tsx`);
