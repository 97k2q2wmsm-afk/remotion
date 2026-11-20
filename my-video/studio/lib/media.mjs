// FFmpeg + audio layer: probe, waveform peaks, procedural score/SFX synthesis,
// scene concatenation with transitions, final mix + loudness master + H.264 export.
// Mirrors the conventions of scripts/bg-master.mjs (side-chain ducking, loudnorm,
// BT.709, +faststart, soft subtitle track).
import {execFile, spawn} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {ENVIRONMENTS, STYLES, TRANSITIONS} from '../../src/cinematic/schema.ts';
import {EXPLOSION_SPOTS, explosionTimes} from '../../src/cinematic/timing.ts';

const run = promisify(execFile);
export const SR = 48000;

export const ffmpeg = (args, {signal} = {}) =>
	new Promise((resolve, reject) => {
		const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {signal});
		let err = '';
		p.stderr.on('data', (d) => (err += d));
		p.on('error', reject);
		p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${err.trim().slice(-1500)}`))));
	});

export const probe = async (file) => {
	const {stdout} = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
	const j = JSON.parse(stdout);
	const v = j.streams.find((s) => s.codec_type === 'video');
	const a = j.streams.find((s) => s.codec_type === 'audio');
	const [n, d] = (v?.r_frame_rate || '0/1').split('/').map(Number);
	const still = v && (j.format.format_name.includes('image2') || j.format.format_name.includes('png') || j.format.format_name.includes('jpeg') || j.format.format_name.includes('webp_pipe'));
	return {
		duration: Number(j.format.duration) || null,
		width: v?.width ?? null,
		height: v?.height ?? null,
		fps: d ? n / d : null,
		hasVideo: Boolean(v) && !still,
		isImage: Boolean(still),
		hasAudio: Boolean(a),
		codec: v?.codec_name ?? a?.codec_name ?? null,
		size: Number(j.format.size) || null,
		bitrate: Number(j.format.bit_rate) || null,
	};
};

/** Decode any audio to mono float32 @ 48 kHz. */
export const decodeMono = (file) =>
	new Promise((resolve, reject) => {
		const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-']);
		const chunks = [];
		let err = '';
		p.stdout.on('data', (c) => chunks.push(c));
		p.stderr.on('data', (d) => (err += d));
		p.on('close', (code) => {
			if (code !== 0) return reject(new Error(`Cannot decode ${path.basename(file)}: ${err.trim()}`));
			const b = Buffer.concat(chunks);
			resolve(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)));
		});
	});

/** Waveform peaks for the timeline UI. */
export const peaks = async (file, buckets = 600) => {
	const s = await decodeMono(file);
	const out = new Array(buckets).fill(0);
	const per = Math.max(1, Math.floor(s.length / buckets));
	for (let b = 0; b < buckets; b++) {
		let m = 0;
		for (let i = b * per; i < Math.min(s.length, (b + 1) * per); i++) m = Math.max(m, Math.abs(s[i]));
		out[b] = Math.round(m * 1000) / 1000;
	}
	return {duration: s.length / SR, peaks: out};
};

export const writeWav = (file, left, right = left) => {
	const n = left.length;
	const buf = Buffer.alloc(44 + n * 4);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + n * 4, 4);
	buf.write('WAVEfmt ', 8);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20);
	buf.writeUInt16LE(2, 22);
	buf.writeUInt32LE(SR, 24);
	buf.writeUInt32LE(SR * 4, 28);
	buf.writeUInt16LE(4, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(n * 4, 40);
	for (let i = 0; i < n; i++) {
		buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
		buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
	}
	mkdirSync(path.dirname(file), {recursive: true});
	writeFileSync(file, buf);
};

// ─── Timeline maths (shared by narration placement, SFX, subtitles, xfade) ──

/** Start time of every scene on the final timeline, accounting for transition overlaps. */
export const sceneStarts = (scenes, fps) => {
	const starts = [];
	let t = 0;
	scenes.forEach((s, i) => {
		if (i > 0) t -= transitionSeconds(s, fps);
		starts.push(t);
		t += s.duration;
	});
	return {starts, total: t};
};
export const transitionSeconds = (scene, fps) => (scene.transition === 'cut' ? 1 / fps : TRANSITIONS[scene.transition].seconds);

// ─── Procedural synthesis ───────────────────────────────────────────────────

const mulberry = (seed) => () => {
	seed = (seed + 0x6d2b79f5) >>> 0;
	let t = seed;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

const MOODS = {
	epic_historical: {root: 50, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], pulse: 0.5, drums: true},
	documentary: {root: 55, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], pulse: 0.25, drums: false},
	dark_mystery: {root: 45, prog: [[0, 3, 7], [1, 4, 8], [-2, 1, 5], [0, 3, 6]], pulse: 0.15, drums: false},
	sci_fi: {root: 48, prog: [[0, 7, 14], [-3, 4, 9], [-5, 2, 7], [-1, 6, 11]], pulse: 0.6, drums: true},
	nature: {root: 57, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 5]], pulse: 0.2, drums: false},
};

/**
 * Original ambient-cinematic score: detuned-saw pads through a moving low-pass,
 * sub drone, soft plucked arpeggio, optional low drum hits, simple reverb.
 * Chord changes land on scene cuts. Labelled "procedural" everywhere it is used.
 */
export const synthScore = ({total, starts, style, seed = 7}) => {
	const mood = MOODS[style] ?? MOODS.documentary;
	const n = Math.ceil(total * SR);
	const L = new Float32Array(n);
	const R = new Float32Array(n);
	const rnd = mulberry(seed);
	const chordAt = (t) => {
		let idx = 0;
		for (let i = 0; i < starts.length; i++) if (t >= starts[i]) idx = i;
		return mood.prog[idx % mood.prog.length];
	};
	const ph = new Float64Array(32);
	let lp1 = 0, lp2 = 0, rp1 = 0, rp2 = 0;
	let sub = 0;
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		const ch = chordAt(t);
		let l = 0, r = 0, p = 0;
		for (const iv of ch) {
			for (const det of [-0.07, 0.08]) {
				ph[p] = (ph[p] + hz(mood.root + 12 + iv + det) / SR) % 1;
				const v = ph[p] * 2 - 1;
				l += v * (det < 0 ? 0.7 : 0.3);
				r += v * (det < 0 ? 0.3 : 0.7);
				p++;
			}
		}
		const cut = 380 + 520 * (0.5 + 0.5 * Math.sin(t * 0.21)) + 300 * mood.pulse;
		const a = 1 - Math.exp((-2 * Math.PI * cut) / SR);
		lp1 += a * (l - lp1); lp2 += a * (lp1 - lp2);
		rp1 += a * (r - rp1); rp2 += a * (rp1 - rp2);
		sub = (sub + hz(mood.root - 12 + ch[0]) / SR) % 1;
		const env = Math.min(1, t / 4, (total - t) / 3);
		L[i] = (lp2 * 0.05 + Math.sin(sub * Math.PI * 2) * 0.05) * env;
		R[i] = (rp2 * 0.05 + Math.sin(sub * Math.PI * 2) * 0.05) * env;
	}
	// Plucked arpeggio (8th notes at ~70 bpm) — sine with exponential decay.
	const step = 60 / 70 / 2;
	for (let k = 0; k * step < total - 1; k++) {
		if (rnd() > 0.55 + mood.pulse * 0.3) continue;
		const t0 = k * step;
		const ch = chordAt(t0);
		const f = hz(mood.root + 24 + ch[k % ch.length]);
		const pan = rnd();
		const len = Math.floor(SR * 1.6);
		const i0 = Math.floor(t0 * SR);
		for (let j = 0; j < len && i0 + j < n; j++) {
			const v = Math.sin((2 * Math.PI * f * j) / SR) * Math.exp(-j / (SR * 0.35)) * 0.035;
			L[i0 + j] += v * (1 - pan);
			R[i0 + j] += v * pan;
		}
	}
	// Low drum hits on scene changes and every 2 bars for driving styles.
	if (mood.drums) {
		const hits = [...starts.slice(1)];
		for (let t = 4; t < total - 2; t += 60 / 70 * 4) hits.push(t);
		for (const t0 of hits) drum(L, R, t0, 0.28, rnd);
	}
	reverb(L, R, 0.25);
	return {L, R};
};

const drum = (L, R, t0, gain, rnd) => {
	const i0 = Math.floor(t0 * SR);
	let ph = 0;
	for (let j = 0; j < SR * 0.9 && i0 + j < L.length; j++) {
		const tt = j / SR;
		ph += (2 * Math.PI * (48 + 90 * Math.exp(-tt * 18))) / SR;
		const v = (Math.sin(ph) * Math.exp(-tt * 5) + (rnd() * 2 - 1) * Math.exp(-tt * 40) * 0.3) * gain;
		L[i0 + j] += v;
		R[i0 + j] += v;
	}
};

/** Small Schroeder-style reverb (4 combs + allpass) in place. */
const reverb = (L, R, mix) => {
	const combs = [1557, 1617, 1491, 1422].map((d) => ({d: Math.floor((d * SR) / 44100), bl: new Float32Array(Math.floor((d * SR) / 44100)), br: new Float32Array(Math.floor((d * SR) / 44100)), i: 0}));
	for (let n = 0; n < L.length; n++) {
		let wl = 0, wr = 0;
		for (const c of combs) {
			const ol = c.bl[c.i];
			const or = c.br[c.i];
			c.bl[c.i] = L[n] + ol * 0.82;
			c.br[c.i] = R[n] + or * 0.8;
			c.i = (c.i + 1) % c.d;
			wl += ol;
			wr += or;
		}
		L[n] += wl * mix * 0.25;
		R[n] += wr * mix * 0.25;
	}
};

// One synthesiser per SOUND_EFFECTS id. Each adds into L/R over [t0, t0+dur).
const SFX = {
	wind: (c) => noiseBed(c, {lp: 500, gain: 0.08, lfo: 0.13, depth: 0.7}),
	rain: (c) => {
		noiseBed(c, {lp: 6000, hp: 900, gain: 0.05, lfo: 0, depth: 0});
		for (let k = 0; k < c.dur * 18; k++) click(c, c.t0 + c.rnd() * c.dur, 2400 + c.rnd() * 3000, 0.02);
	},
	thunder: (c) => {
		for (let k = 0; k < Math.max(1, Math.floor(c.dur / 7)); k++) boom(c, c.t0 + c.dur * (0.3 + 0.5 * c.rnd()), 0.35, 2.8);
	},
	fire_crackle: (c) => {
		noiseBed(c, {lp: 900, gain: 0.03, lfo: 0.7, depth: 0.5});
		for (let k = 0; k < c.dur * 9; k++) click(c, c.t0 + c.rnd() * c.dur, 1500 + c.rnd() * 3000, 0.06 * c.rnd());
	},
	crowd_murmur: (c) => {
		for (let v = 0; v < 6; v++) noiseBed(c, {lp: 700 + v * 120, hp: 200, gain: 0.018, lfo: 1.5 + v * 0.7, depth: 0.9});
	},
	battle_clash: (c) => {
		noiseBed(c, {lp: 1200, hp: 150, gain: 0.03, lfo: 0.9, depth: 0.6});
		for (let k = 0; k < c.dur * 2.2; k++) clang(c, c.t0 + c.rnd() * c.dur, 0.06 + 0.06 * c.rnd());
	},
	explosion: (c) => {
		const times = explosionTimes(c.dur, EXPLOSION_SPOTS[c.scene.environment] ?? 1);
		for (const t of times) boom(c, c.t0 + t, 0.55, 3.2);
	},
	ocean_waves: (c) => noiseBed(c, {lp: 1100, gain: 0.1, lfo: 0.11, depth: 0.95}),
	birdsong: (c) => {
		for (let k = 0; k < c.dur * 1.4; k++) chirp(c, c.t0 + c.rnd() * c.dur);
	},
	city_traffic: (c) => {
		noiseBed(c, {lp: 350, gain: 0.07, lfo: 0.07, depth: 0.4});
		for (let k = 0; k < c.dur / 6; k++) passBy(c, c.t0 + c.rnd() * c.dur);
	},
	footsteps: (c) => {
		for (let t = 0.3; t < c.dur; t += 0.52) click(c, c.t0 + t, 180 + c.rnd() * 60, 0.09, 0.05);
	},
	whoosh: (c) => passBy(c, c.t0 - 0.35, 0.8, 0.12),
	rumble: (c) => noiseBed(c, {lp: 90, gain: 0.25, lfo: 0.2, depth: 0.5}),
	room_tone: (c) => noiseBed(c, {lp: 250, gain: 0.02, lfo: 0, depth: 0}),
	neon_hum: (c) => tone(c, 60, 0.012, [1, 0.5, 0.33, 0.25]),
};

const fadeEnv = (j, len, f = 0.25) => Math.min(1, j / (SR * f), (len - j) / (SR * f));

const noiseBed = (c, {lp, hp = 0, gain, lfo, depth}) => {
	const i0 = Math.max(0, Math.floor(c.t0 * SR));
	const len = Math.floor(c.dur * SR);
	const a = 1 - Math.exp((-2 * Math.PI * lp) / SR);
	const ah = hp ? 1 - Math.exp((-2 * Math.PI * hp) / SR) : 0;
	let y = 0, y2 = 0, h = 0;
	const ph = c.rnd() * 10;
	for (let j = 0; j < len && i0 + j < c.L.length; j++) {
		const x = c.rnd() * 2 - 1;
		y += a * (x - y);
		y2 += a * (y - y2);
		let v = y2;
		if (ah) {
			h += ah * (v - h);
			v -= h;
		}
		const mod = 1 - depth * (0.5 + 0.5 * Math.sin((j / SR) * lfo * Math.PI * 2 + ph));
		const s = v * gain * 3 * mod * fadeEnv(j, len, 0.6);
		c.L[i0 + j] += s * (0.8 + 0.2 * Math.sin(j / SR + ph));
		c.R[i0 + j] += s * (0.8 + 0.2 * Math.cos(j / SR + ph));
	}
};
const click = (c, t, f, g, decay = 0.012) => {
	const i0 = Math.floor(t * SR);
	const pan = c.rnd();
	for (let j = 0; j < SR * decay * 6 && i0 + j < c.L.length; j++) {
		if (i0 + j < 0) continue;
		const v = (Math.sin((2 * Math.PI * f * j) / SR) * 0.5 + (c.rnd() * 2 - 1) * 0.5) * Math.exp(-j / (SR * decay)) * g;
		c.L[i0 + j] += v * (1 - pan);
		c.R[i0 + j] += v * pan;
	}
};
const boom = (c, t, g, len) => {
	const i0 = Math.floor(t * SR);
	let y = 0, ph = 0;
	for (let j = 0; j < SR * len && i0 + j < c.L.length; j++) {
		if (i0 + j < 0) continue;
		const tt = j / SR;
		y += 0.02 * ((c.rnd() * 2 - 1) - y);
		ph += (2 * Math.PI * (38 + 60 * Math.exp(-tt * 6))) / SR;
		const v = (Math.sin(ph) * Math.exp(-tt * 1.6) * 0.8 + y * 6 * Math.exp(-tt * 1.1) + (c.rnd() * 2 - 1) * Math.exp(-tt * 25) * 0.5) * g;
		c.L[i0 + j] += v;
		c.R[i0 + j] += v * 0.95;
	}
};
const clang = (c, t, g) => {
	const i0 = Math.floor(t * SR);
	const f = 900 + c.rnd() * 1400;
	const pan = c.rnd();
	for (let j = 0; j < SR * 0.6 && i0 + j < c.L.length; j++) {
		const tt = j / SR;
		const v = (Math.sin(2 * Math.PI * f * tt + 3 * Math.sin(2 * Math.PI * f * 1.41 * tt)) * Math.exp(-tt * 9)) * g;
		c.L[i0 + j] += v * (1 - pan);
		c.R[i0 + j] += v * pan;
	}
};
const chirp = (c, t) => {
	const i0 = Math.floor(t * SR);
	const f0 = 2500 + c.rnd() * 2000;
	const pan = c.rnd();
	let ph = 0;
	for (let j = 0; j < SR * 0.12 && i0 + j < c.L.length; j++) {
		const tt = j / SR;
		ph += (2 * Math.PI * (f0 + 1800 * Math.sin(tt * 60))) / SR;
		const v = Math.sin(ph) * Math.sin((Math.PI * tt) / 0.12) * 0.03;
		c.L[i0 + j] += v * (1 - pan);
		c.R[i0 + j] += v * pan;
	}
};
const passBy = (c, t, len = 3, g = 0.06) => {
	const i0 = Math.floor(t * SR);
	let y = 0;
	const n = Math.floor(len * SR);
	for (let j = 0; j < n && i0 + j < c.L.length; j++) {
		if (i0 + j < 0) continue;
		const u = j / n;
		const a = 1 - Math.exp((-2 * Math.PI * (300 + 1500 * Math.sin(Math.PI * u))) / SR);
		y += a * ((c.rnd() * 2 - 1) - y);
		const v = y * Math.sin(Math.PI * u) ** 2 * g * 3;
		c.L[i0 + j] += v * (1 - u);
		c.R[i0 + j] += v * u;
	}
};
const tone = (c, f, g, harmonics) => {
	const i0 = Math.max(0, Math.floor(c.t0 * SR));
	const len = Math.floor(c.dur * SR);
	for (let j = 0; j < len && i0 + j < c.L.length; j++) {
		let v = 0;
		harmonics.forEach((h, k) => (v += Math.sin((2 * Math.PI * f * (k + 1) * j) / SR) * h));
		v *= g * fadeEnv(j, len);
		c.L[i0 + j] += v;
		c.R[i0 + j] += v;
	}
};

/** Ambience + SFX bed for the whole timeline. Returns which effects were synthesised. */
export const synthSfx = ({scenes, starts, total, seed = 11}) => {
	const n = Math.ceil(total * SR);
	const L = new Float32Array(n);
	const R = new Float32Array(n);
	const used = [];
	scenes.forEach((scene, i) => {
		const rnd = mulberry(seed + i * 101);
		const effects = new Set(scene.sound_effects);
		for (const id of effects) {
			const fn = SFX[id];
			if (!fn) continue;
			fn({L, R, t0: starts[i], dur: scene.duration, rnd, scene});
			used.push({scene: scene.scene_id, effect: id, at: starts[i]});
		}
	});
	return {L, R, used};
};

// Default sound design per environment/atmosphere (used by the storyboard engine).
export const defaultSoundEffects = (scene) => {
	const fx = new Set();
	const env = scene.environment;
	const atm = new Set(scene.atmosphere);
	if (env === 'forest' || env === 'mountains') fx.add('birdsong').add('wind');
	if (env === 'city' || env === 'modern_street') fx.add('city_traffic');
	if (env === 'futuristic_city') fx.add('neon_hum').add('city_traffic');
	if (env === 'medieval_village' || env === 'ancient_roman_city') fx.add('crowd_murmur');
	if (env === 'battlefield') fx.add('battle_clash').add('rumble');
	if (env === 'interior') fx.add('room_tone');
	if (env === 'ocean_coast') fx.add('ocean_waves').add('wind');
	if (atm.has('rain')) fx.add('rain');
	if (atm.has('wind')) fx.add('wind');
	if (atm.has('fire')) fx.add('fire_crackle');
	if (atm.has('explosions')) fx.add('explosion');
	if (scene.lighting === 'stormy') fx.add('thunder');
	if (scene.transition === 'whip' || scene.transition === 'slide') fx.add('whoosh');
	if (scene.animation.includes('character_walk')) fx.add('footsteps');
	return [...fx];
};

// ─── Subtitles ──────────────────────────────────────────────────────────────

/** Split narration into ≤7-word cues timed by character count across `duration`. */
export const autoSubtitles = (text, duration, lead = 0.3) => {
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	const groups = [];
	let cur = [];
	words.forEach((w, i) => {
		cur.push(w);
		if (cur.length >= 7 || /[.!?…;:]$/.test(w) || (/,$/.test(w) && cur.length >= 4) || i === words.length - 1) {
			groups.push(cur.join(' '));
			cur = [];
		}
	});
	const chars = groups.reduce((a, g) => a + g.length, 0);
	const span = Math.max(0.5, duration - lead - 0.2);
	let t = lead;
	return groups.map((g) => {
		const d = (g.length / chars) * span;
		const cue = {start: +t.toFixed(2), end: +(t + d).toFixed(2), text: g};
		t += d;
		return cue;
	});
};

const srtTime = (s) => {
	const ms = Math.max(0, Math.round(s * 1000));
	const p = (n, l = 2) => String(n).padStart(l, '0');
	return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
};
export const buildSrt = (scenes, starts) => {
	const cues = scenes.flatMap((s, i) => s.subtitles.map((c) => ({start: starts[i] + c.start, end: Math.min(starts[i] + c.end, starts[i] + s.duration), text: c.text})));
	return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
};

// ─── Video assembly ─────────────────────────────────────────────────────────

const XFADE = {cut: 'fade', fade: 'fade', dip_to_black: 'fadeblack', whip: 'smoothleft', slide: 'slideleft'};

/** Join scene clips with their transitions (xfade chain). */
export const concatScenes = async ({clips, scenes, fps, out, signal}) => {
	if (clips.length === 1) {
		await ffmpeg(['-i', clips[0], '-an', '-c:v', 'copy', out], {signal});
		return;
	}
	const inputs = clips.flatMap((c) => ['-i', c]);
	const parts = [];
	let prev = '[0:v]';
	let acc = scenes[0].duration;
	for (let i = 1; i < clips.length; i++) {
		const d = transitionSeconds(scenes[i], fps);
		const offset = Math.max(0, acc - d);
		const label = i === clips.length - 1 ? '[vout]' : `[v${i}]`;
		parts.push(`${prev}[${i}:v]xfade=transition=${XFADE[scenes[i].transition]}:duration=${d.toFixed(4)}:offset=${offset.toFixed(4)}${label}`);
		prev = label;
		acc = offset + scenes[i].duration;
	}
	// Normalise every input first (settb/fps) — xfade requires identical timebases.
	const norm = clips.map((_, i) => `[${i}:v]settb=AVTB,fps=${fps},format=yuv420p[n${i}]`);
	const graph = [...norm, ...parts.map((p) => p.replace(/\[(\d+):v\]/g, '[n$1]'))].join(';');
	await ffmpeg([...inputs, '-filter_complex', graph, '-map', '[vout]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', out], {signal});
};

/**
 * Final master: picture + narration (+ ducked music) + SFX bed → loudness-normalised
 * (loudnorm, then a −1.5 dBFS safety limiter: AAC encoding overshoots true peak otherwise)
 * H.264/AAC MP4 with a soft subtitle track. Returns the ffmpeg filter used (logged).
 */
export const masterExport = async ({video, narration, music, sfx, srt, out, fps, audio, exportSettings, total, language, title, signal}) => {
	const inputs = ['-i', video];
	const filters = [];
	const mixIn = [];
	let idx = 1;
	const fadeOut = Math.max(0, total - 1.5).toFixed(3);
	let narrLabel = null;
	if (narration) {
		inputs.push('-i', narration);
		filters.push(`[${idx}:a]aresample=${SR},atrim=0:${total.toFixed(3)},volume=${audio.narration_volume},highpass=f=70,asplit=2[vo][key]`);
		narrLabel = '[vo]';
		mixIn.push('[vo]');
		idx++;
	}
	if (music) {
		inputs.push('-stream_loop', '-1', '-i', music);
		filters.push(`[${idx}:a]aresample=${SR},atrim=0:${total.toFixed(3)},volume=${audio.music.volume},afade=t=in:d=2,afade=t=out:st=${fadeOut}:d=1.5[mu]`);
		if (narrLabel && audio.duck_music) {
			filters.push('[mu][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400:makeup=1[muduck]');
			mixIn.push('[muduck]');
		} else {
			if (narrLabel) filters.push('[key]anullsink');
			mixIn.push('[mu]');
		}
		idx++;
	} else if (narrLabel) {
		filters.push('[key]anullsink');
	}
	if (sfx) {
		inputs.push('-i', sfx);
		filters.push(`[${idx}:a]aresample=${SR},atrim=0:${total.toFixed(3)},volume=${audio.sfx_volume}[fx]`);
		mixIn.push('[fx]');
		idx++;
	}
	const hasAudio = mixIn.length > 0;
	if (hasAudio) {
		filters.push(`${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0:duration=first,apad,atrim=0:${total.toFixed(3)},alimiter=limit=0.95,loudnorm=I=${audio.target_lufs}:TP=-1.5:LRA=11,alimiter=limit=0.84:level=false[aout]`);
	}
	if (srt) inputs.push('-i', srt);
	const v = exportSettings.video_bitrate_kbps;
	const args = [
		...inputs,
		...(hasAudio ? ['-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[aout]'] : ['-map', '0:v']),
		...(srt ? ['-map', `${idx}:s`, '-c:s', 'mov_text', '-metadata:s:s:0', `language=${{en: 'eng', tr: 'tur', es: 'spa'}[language] ?? 'und'}`] : []),
		'-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
		'-b:v', `${v}k`, '-maxrate', `${Math.round(v * 1.5)}k`, '-bufsize', `${v * 2}k`,
		'-r', String(fps), '-g', String(fps * 2),
		'-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
		...(hasAudio ? ['-c:a', 'aac', '-b:a', `${exportSettings.audio_bitrate_kbps}k`, '-ar', String(SR)] : []),
		'-metadata', `title=${title}`,
		'-movflags', '+faststart',
		'-t', total.toFixed(3),
		out,
	];
	await ffmpeg(args, {signal});
	return filters.join(';');
};

/** Loudness + stream report for the export library. */
export const qcReport = async (file) => {
	const p = await probe(file);
	let I = null, peak = null;
	if (p.hasAudio) {
		const {stderr} = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-'], {maxBuffer: 64 * 1024 * 1024}).catch((e) => e);
		I = stderr?.match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/)?.[1] ?? stderr?.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop()?.match(/-?[\d.]+/)?.[0] ?? null;
		peak = stderr?.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1] ?? null;
	}
	return {duration_s: p.duration, width: p.width, height: p.height, fps: p.fps, video_codec: p.codec, has_audio: p.hasAudio, size_mb: p.size ? +(p.size / 1048576).toFixed(2) : null, bitrate_kbps: p.bitrate ? Math.round(p.bitrate / 1000) : null, loudness_lufs: I ? Number(I) : null, true_peak_dbfs: peak ? Number(peak) : null};
};

export const styleLabel = (s) => STYLES[s]?.label ?? s;
export const envLabel = (e) => ENVIRONMENTS[e]?.label ?? e;
