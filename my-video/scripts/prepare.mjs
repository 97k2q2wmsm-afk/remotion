// Turns a story definition + raw voiceover + word timestamps into:
//  - public/<storyId>/voice.mp3       (tempo-adjusted, cleaned, loudness-normalised narration)
//  - src/stories/<storyDir>/timeline.json (frame-accurate scenes + caption words)
//
// Usage: node scripts/prepare.mjs pompeya
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const storyDir = process.argv[2];
if (!storyDir) {
	throw new Error('Usage: node scripts/prepare.mjs <storyDir>');
}

const root = path.resolve(import.meta.dirname, '..');
const storyPath = path.join(root, 'src/stories', storyDir, 'story.json');
const story = JSON.parse(readFileSync(storyPath, 'utf8'));
const {fps} = story;
const {tempo, leadInSeconds, tailSeconds} = story.voice;

// 1. Voice: speed up without changing pitch, remove rumble, gentle compression, -14 LUFS.
const outDir = path.join(root, 'public', storyDir);
mkdirSync(outDir, {recursive: true});
execFileSync(
	'ffmpeg',
	[
		'-y',
		'-loglevel',
		'error',
		'-i',
		path.join(root, story.voice.raw),
		'-af',
		[
			`atempo=${tempo}`,
			'highpass=f=70',
			'acompressor=threshold=-18dB:ratio=3:attack=8:release=120',
			'loudnorm=I=-14:TP=-1.5:LRA=9',
		].join(','),
		'-ar',
		'48000',
		'-b:a',
		'192k',
		path.join(outDir, 'voice.mp3'),
	],
	{stdio: 'inherit'},
);

// 2. Words: rescale to new tempo and shift by lead-in.
const raw = JSON.parse(readFileSync(path.join(root, story.voice.words), 'utf8'));
const words = raw.words
	.filter((w) => w.type === 'word')
	.map((w) => ({
		text: w.text,
		startMs: Math.round((w.start / tempo + leadInSeconds) * 1000),
		endMs: Math.round((w.end / tempo + leadInSeconds) * 1000),
	}));

const normalize = (s) =>
	s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]/g, '');

// 3. Scenes: each scene starts where its anchor phrase is spoken.
const findAnchor = (anchor, fromIndex) => {
	const parts = anchor.split(/\s+/).map(normalize);
	for (let i = fromIndex; i < words.length; i++) {
		if (parts.every((p, j) => normalize(words[i + j]?.text ?? '') === p)) {
			return i;
		}
	}
	throw new Error(`Anchor "${anchor}" not found in transcript`);
};

const lastWord = words[words.length - 1];
const durationInFrames = Math.ceil((lastWord.endMs / 1000 + tailSeconds) * fps);

let cursor = 0;
const starts = story.scenes.map((scene, i) => {
	if (i === 0) {
		return 0;
	}
	const idx = findAnchor(scene.anchor, cursor);
	cursor = idx + 1;
	// Cut slightly before the first syllable so the picture leads the voice.
	return Math.round((words[idx].startMs / 1000 - 0.12) * fps);
});

const scenes = story.scenes.map((scene, i) => ({
	...scene,
	from: starts[i],
	to: i === story.scenes.length - 1 ? durationInFrames : starts[i + 1],
}));

// 4. Hits: story beats tied to a spoken word (used by visuals AND the score).
const hits = (story.hits ?? []).map((hit) => {
	const idx = findAnchor(hit.word, 0);
	return {...hit, frame: Math.round((words[idx].startMs / 1000) * fps)};
});

const timeline = {
	storyId: story.id,
	fps,
	durationInFrames,
	voiceStartFrame: Math.round(leadInSeconds * fps),
	scenes,
	hits,
	words,
};

writeFileSync(
	path.join(root, 'src/stories', storyDir, 'timeline.json'),
	JSON.stringify(timeline, null, '\t') + '\n',
);

console.log(
	`Timeline: ${durationInFrames} frames (${(durationInFrames / fps).toFixed(2)}s), ${scenes.length} scenes, ${words.length} words`,
);
for (const h of hits) {
	console.log(`  hit ${h.id.padEnd(8)} @ ${h.frame}`);
}
for (const s of scenes) {
	console.log(
		`  ${s.id.padEnd(10)} ${String(s.from).padStart(5)} → ${String(s.to).padStart(5)}  (${((s.to - s.from) / fps).toFixed(2)}s, ${s.transition})`,
	);
}
