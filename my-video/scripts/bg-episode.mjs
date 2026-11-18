// One command, one finished episode:
//   node scripts/bg-episode.mjs <storyDir>      (npm run bg:episode -- <storyDir>)
//
//  1. prepare.mjs   → voice.mp3 (tempo, EQ, -14 LUFS) + frame-accurate timeline.json
//  2. bg-score.mjs  → original music + SFX (story hits + physics landings) → score.wav
//  3. Remotion      → 1080×1920 / 30 fps silent picture (all scenes, captions, HUD)
//  4. bg-master.mjs → FFmpeg mix (side-chain ducking) + loudness + H.264 + Turkish subtitles
//  5. Remotion still → cover image (thumbnail)
//  6. QC            → contact sheet + qc.json
//
// Flags: --skip-voice (keep existing timeline/voice), --preview (half-res fast render)
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

const id = process.argv[2];
const flags = new Set(process.argv.slice(3));
if (!id) throw new Error('Usage: node scripts/bg-episode.mjs <storyDir> [--skip-voice] [--preview]');
const root = path.resolve(import.meta.dirname, '..');
const story = JSON.parse(readFileSync(path.join(root, 'src/stories', id, 'story.json'), 'utf8'));
const out = path.join(root, 'out', id);
mkdirSync(out, {recursive: true});
const run = (cmd, args) => {
	console.log(`\n▶ ${cmd} ${args.join(' ')}`);
	execFileSync(cmd, args, {stdio: 'inherit', cwd: root});
};
const t0 = Date.now();

if (!flags.has('--skip-voice')) run('node', ['scripts/prepare.mjs', id]);
run('node', ['scripts/bg-score.mjs', id]);
run('npx', [
	'remotion', 'render', story.id, path.join(out, 'video_silent.mp4'),
	'--muted', '--codec=h264', '--crf=16', '--concurrency=4', '--log=error',
	...(flags.has('--preview') ? ['--scale=0.5'] : []),
]);
run('node', ['scripts/bg-master.mjs', id]);
run('npx', ['remotion', 'still', `${story.id}-Kapak`, path.join(out, `${id}_kapak.png`), '--log=error']);
run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(out, `${id}_kapak.png`), '-q:v', '2', path.join(out, `${id}_kapak.jpg`)]);
// contact sheet: one frame every ~2.4 s
run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(out, `${id}_final.mp4`), '-vf', 'fps=1/2.4,scale=216:-1,tile=8x3', '-frames:v', '1', path.join(out, 'contact_sheet.jpg')]);
const pub = path.join(root, 'src/stories', id, 'publish.md');
if (existsSync(pub)) copyFileSync(pub, path.join(out, 'yayin_paketi.md'));

console.log(`\n✔ ${story.title} — done in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`);
