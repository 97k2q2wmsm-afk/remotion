// FFmpeg mastering for BAŞINA GELSEYDİ episodes.
//  - narration: cleaned + aligned to the timeline lead-in
//  - music/SFX: side-chain ducked under the narration (music never masks the voice)
//  - loudness: -14 LUFS integrated, -1 dBTP (Reels / Shorts targets)
//  - video: H.264 High, yuv420p, BT.709, 30 fps, +faststart
//  - Turkish subtitles: .srt next to the MP4 AND embedded as a soft subtitle track (tur)
//
// Usage: node scripts/bg-master.mjs yercekimi   (expects out/<id>/video_silent.mp4)
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const id = process.argv[2];
if (!id) throw new Error('Usage: node scripts/bg-master.mjs <storyDir>');
const root = path.resolve(import.meta.dirname, '..');
const tl = JSON.parse(readFileSync(path.join(root, 'src/stories', id, 'timeline.json'), 'utf8'));
const story = JSON.parse(readFileSync(path.join(root, 'src/stories', id, 'story.json'), 'utf8'));
const outDir = path.join(root, 'out', id);
mkdirSync(outDir, {recursive: true});

// ── 1. SRT from word timestamps (≤ 6 words / 2.6 s per cue, split on punctuation)
const ts = (ms) => {
	const h = Math.floor(ms / 3600000);
	const m = Math.floor((ms % 3600000) / 60000);
	const s = Math.floor((ms % 60000) / 1000);
	const r = Math.floor(ms % 1000);
	const p = (n, l = 2) => String(n).padStart(l, '0');
	return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
};
const cues = [];
let cur = [];
tl.words.forEach((w, i) => {
	cur.push(w);
	const end = /[.!?…,]$/.test(w.text) || cur.length >= 6 || w.endMs - cur[0].startMs > 2600 || i === tl.words.length - 1;
	if (end) {
		cues.push({start: cur[0].startMs, end: w.endMs + 150, text: cur.map((x) => x.text).join(' ')});
		cur = [];
	}
});
cues.forEach((c, i) => {
	if (cues[i + 1] && c.end > cues[i + 1].start) c.end = cues[i + 1].start - 10;
});
const srt = cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
const srtPath = path.join(outDir, `${id}.tr.srt`);
writeFileSync(srtPath, srt);

// ── 2. Mix + master + mux
const video = path.join(outDir, 'video_silent.mp4');
const voice = path.join(root, 'public', id, 'voice.mp3');
const score = path.join(root, 'public', id, 'score.wav');
const leadMs = Math.round((tl.voiceStartFrame / tl.fps) * 1000);
const durS = (tl.durationInFrames / tl.fps).toFixed(3);
const final = path.join(outDir, `${id}_final.mp4`);
// pass 1: measure the mix so pass 2 can hit exactly -14 LUFS / -1 dBTP (linear loudnorm)
const preMix = (ln) => [
	`[1:a]aresample=48000,adelay=${leadMs}|${leadMs},apad,atrim=0:${durS},highpass=f=80,equalizer=f=3200:t=q:w=1.2:g=2,aformat=channel_layouts=stereo,asplit=2[vo][key]`,
	`[2:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${durS},volume=0.62[mu]`,
	`[mu][key]sidechaincompress=threshold=0.035:ratio=5:attack=15:release=320:makeup=1[duck]`,
	`[vo][duck]amix=inputs=2:normalize=0:weights=1 1:duration=longest,alimiter=limit=0.95,${ln}[aout]`,
].join(';');
const measure = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${voice}" -i "${score}" -filter_complex "${preMix('loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json').replace('[1:a]', '[0:a]').replace('[2:a]', '[1:a]')}" -map "[aout]" -f null - 2>&1`]).toString();
const m = JSON.parse(measure.slice(measure.lastIndexOf('{'), measure.lastIndexOf('}') + 1));
const LOUDNORM = `loudnorm=I=-14:TP=-1.0:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
const filter = preMix(LOUDNORM);
execFileSync(
	'ffmpeg',
	[
		'-y', '-loglevel', 'error',
		'-i', video, '-i', voice, '-i', score, '-i', srtPath,
		'-filter_complex', filter,
		'-map', '0:v', '-map', '[aout]', '-map', '3:s',
		'-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
		'-r', String(tl.fps), '-g', String(tl.fps * 2),
		'-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
		'-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
		'-c:s', 'mov_text', '-metadata:s:s:0', 'language=tur', '-metadata:s:a:0', 'language=tur',
		'-metadata', `title=${story.title}`, '-metadata', 'artist=Başına Gelseydi',
		'-movflags', '+faststart', '-t', durS,
		final,
	],
	{stdio: 'inherit'},
);

// ── 3. Verification report
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', final]).toString());
const v = probe.streams.find((s) => s.codec_type === 'video');
const a = probe.streams.find((s) => s.codec_type === 'audio');
const s = probe.streams.find((x) => x.codec_type === 'subtitle');
const ebuOut = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${final}" -map 0:a -af ebur128=peak=true -f null - 2>&1 | tail -12`]).toString();
const ebu = {I: ebuOut.match(/I:\s+(-?[\d.]+) LUFS/)?.[1], peak: ebuOut.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]};
const report = {
	file: final,
	duration_s: Number(probe.format.duration).toFixed(2),
	size_mb: (Number(probe.format.size) / 1048576).toFixed(1),
	video: `${v.codec_name} ${v.width}x${v.height} ${v.r_frame_rate} ${v.pix_fmt}`,
	audio: `${a.codec_name} ${a.sample_rate} Hz ${a.channels}ch`,
	subtitles: s ? `${s.codec_name} (${s.tags?.language})` : 'none',
	loudness_LUFS: ebu.I,
	true_peak_dBFS: ebu.peak,
};
writeFileSync(path.join(outDir, 'qc.json'), JSON.stringify(report, null, 2));
console.log(report);
