// BAŞINA GELSEYDİ — procedural music + sound design (100 % original, no samples).
//
// Reads src/stories/<id>/story.json + timeline.json and, if present, src/stories/<id>/physics.ts
// (its `landingEvents()` gives one impact per simulated landing, so every object you SEE hit
// the ground is also HEARD hitting the ground). Writes public/<id>/score.wav (48 kHz stereo).
//
// Usage: node scripts/bg-score.mjs yercekimi
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const storyDir = process.argv[2];
if (!storyDir) throw new Error('Usage: node scripts/bg-score.mjs <storyDir>');
const root = path.resolve(import.meta.dirname, '..');
const sdir = path.join(root, 'src/stories', storyDir);
const story = JSON.parse(readFileSync(path.join(sdir, 'story.json'), 'utf8'));
const tl = JSON.parse(readFileSync(path.join(sdir, 'timeline.json'), 'utf8'));
let landings = [];
if (existsSync(path.join(sdir, 'physics.ts'))) {
	const phys = await import(pathToFileURL(path.join(sdir, 'physics.ts')).href);
	if (phys.landingEvents) landings = phys.landingEvents();
}

const SR = 48000;
const fps = tl.fps;
const total = Math.ceil((tl.durationInFrames / fps) * SR);
const L = new Float32Array(total);
const R = new Float32Array(total);
const send = new Float32Array(total);
let seed = 4242;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const noise = () => rnd() * 2 - 1;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const sec = (f) => f / fps;
const add = (i, l, r, rev = 0) => {
	if (i < 0 || i >= total) return;
	L[i] += l;
	R[i] += r;
	send[i] += (l + r) * 0.5 * rev;
};
const scenes = tl.scenes;
const sceneAt = (t) => scenes.findLast((s) => sec(s.from) <= t) ?? scenes[0];
const root0 = story.music.root;
const hitF = (id) => tl.hits.find((h) => h.id === id)?.frame ?? null;
const OFF = hitF('off');
const ON = hitF('on');
const zeroG = (t) => OFF !== null && ON !== null && t >= sec(OFF) && t < sec(ON);

// ── 1. Pads: detuned saws, filter follows intensity; in zero-g the filter opens into an airy shimmer
{
	const ph = new Float64Array(64);
	let a1 = 0, a2 = 0, b1 = 0, b2 = 0;
	for (let i = 0; i < total; i++) {
		const t = i / SR;
		const idx = scenes.indexOf(sceneAt(t));
		const cur = scenes[idx];
		const prev = scenes[Math.max(0, idx - 1)];
		const mix = idx === 0 ? 1 : Math.min(1, (t - sec(cur.from)) / 0.5);
		let l = 0, r = 0, p = 0;
		for (const [s, w] of [[prev, 1 - mix], [cur, mix]]) {
			for (const iv of s.chord) {
				for (const oct of [12, 24]) {
					for (const det of [-0.1, 0.12]) {
						ph[p] = (ph[p] + hz(root0 + oct + iv + det) / SR) % 1;
						const v = (ph[p] * 2 - 1) * w;
						l += v * (det < 0 ? 0.75 : 0.25);
						r += v * (det < 0 ? 0.25 : 0.75);
						p++;
					}
				}
			}
		}
		const inten = cur.intensity * mix + prev.intensity * (1 - mix);
		const air = zeroG(t) ? 900 : 0;
		const cut = 260 + 1300 * inten + air + 100 * Math.sin(t * 0.6);
		const a = 1 - Math.exp((-2 * Math.PI * cut) / SR);
		a1 += a * (l - a1); a2 += a * (a1 - a2);
		b1 += a * (r - b1); b2 += a * (b1 - b2);
		const g = 0.02 * (0.55 + inten * 0.5);
		add(i, a2 * g, b2 * g, 0.6);
	}
}

// ── 2. Pulse bass (8ths) — the city's heartbeat; drops out completely in zero-g
const beat = 60 / story.music.bpm;
{
	let ph = 0;
	for (let i = 0; i < total; i++) {
		const t = i / SR;
		const s = sceneAt(t);
		if (zeroG(t) && s.intensity < 0.7) continue;
		const pos = ((t - sec(s.from)) / (beat / 2)) % 1;
		const env = Math.exp(-pos * 5) * (s.intensity > 0.35 ? 1 : 0.35);
		ph += hz(root0 - 12 + s.chord[0]) / SR;
		const v = (Math.sin(ph * 2 * Math.PI) + 0.3 * Math.sin(ph * 4 * Math.PI)) * env * 0.11 * s.intensity;
		add(i, v, v);
	}
}

// ── one-shots
const kick = (t0, g = 1, f0 = 120, f1 = 42, dur = 0.45) => {
	const st = Math.round(t0 * SR);
	let ph = 0;
	for (let j = 0; j < dur * SR; j++) {
		const t = j / SR;
		ph += (f1 + (f0 - f1) * Math.exp(-t * 20)) / SR;
		const v = Math.sin(ph * 2 * Math.PI) * Math.exp(-t * (5 / dur)) * 0.55 * g;
		add(st + j, v, v, 0.1);
	}
};
const hat = (t0, g = 1, pan = 0.5) => {
	const st = Math.round(t0 * SR);
	let hp = 0, pr = 0;
	for (let j = 0; j < 0.05 * SR; j++) {
		const n = noise();
		hp = 0.9 * (hp + n - pr);
		pr = n;
		const v = hp * Math.exp(-j / (0.01 * SR)) * 0.08 * g;
		add(st + j, v * (1 - pan) * 2, v * pan * 2, 0.15);
	}
};
const noiseSweep = (t0, dur, g, fromA, toA, rev = 0.5, shape = 2) => {
	const st = Math.round(t0 * SR);
	let lp = 0;
	for (let j = 0; j < dur * SR; j++) {
		const p = j / (dur * SR);
		lp += (fromA + (toA - fromA) * p) * (noise() - lp);
		const env = p ** shape * (1 - p) ** 0.3 * 4;
		const v = lp * env * 0.3 * g;
		add(st + j, v * (0.7 + 0.3 * Math.sin(p * 30)), v * (0.7 - 0.3 * Math.sin(p * 30)), rev);
	}
};
const whoosh = (t0, g = 1, dur = 0.55) => {
	const st = Math.round((t0 - dur * 0.6) * SR);
	let bp = 0, lp = 0;
	for (let j = 0; j < dur * SR; j++) {
		const p = j / (dur * SR);
		const a = 0.02 + Math.sin(p * Math.PI) * 0.25;
		lp += a * (noise() - lp);
		bp = lp - bp * 0.2;
		const env = Math.sin(p * Math.PI) ** 2;
		const v = bp * env * 0.5 * g;
		add(st + j, v * (1 - p), v * p, 0.3);
	}
};
const impact = (t0, g = 1, len = 2) => {
	kick(t0, 1.4 * g, 150, 28, len);
	const st = Math.round(t0 * SR);
	let lp = 0, hp = 0, pr = 0;
	for (let j = 0; j < len * 1.3 * SR; j++) {
		const t = j / SR;
		const n = noise();
		lp += 0.07 * (n - lp);
		hp = 0.96 * (hp + n - pr);
		pr = n;
		const v = (lp * Math.exp(-t * 3.4) * 0.9 + hp * Math.exp(-t * 2) * 0.05) * g;
		add(st + j, v, v * 0.9, 0.6);
	}
};
const braam = (t0, g = 1, dur = 2.6) => {
	const st = Math.round(t0 * SR);
	const ph = new Float64Array(8);
	let lp = 0, lp2 = 0;
	for (let j = 0; j < dur * SR; j++) {
		const t = j / SR;
		let v = 0;
		[-0.15, 0, 0.13, 12.08].forEach((d, k) => {
			ph[k] = (ph[k] + hz(root0 - 12 + d) / SR) % 1;
			v += ph[k] * 2 - 1;
		});
		const cut = 200 + 2400 * Math.exp(-t * 1.6);
		const a = 1 - Math.exp((-2 * Math.PI * cut) / SR);
		lp += a * (v - lp);
		lp2 += a * (lp - lp2);
		const env = Math.min(1, t / 0.02) * Math.exp(-t * 0.9);
		const o = lp2 * env * 0.16 * g;
		add(st + j, o, o, 0.5);
	}
};
const pitchSweep = (t0, dur, f0, f1, g = 1, wave = 'sine', rev = 0.5) => {
	const st = Math.round(t0 * SR);
	let ph = 0;
	for (let j = 0; j < dur * SR; j++) {
		const p = j / (dur * SR);
		ph += (f0 * (f1 / f0) ** p) / SR;
		const s = wave === 'sine' ? Math.sin(ph * 2 * Math.PI) : (ph % 1) * 2 - 1;
		const env = Math.min(1, p * 20) * (1 - p) ** 1.5;
		const v = s * env * 0.2 * g;
		add(st + j, v, v, rev);
	}
};
const bell = (t0, midi, g = 1, len = 3) => {
	const st = Math.round(t0 * SR);
	const parts = [[1, 1], [2.76, 0.4], [5.4, 0.22], [8.9, 0.1]];
	for (let j = 0; j < len * SR; j++) {
		const t = j / SR;
		let v = 0;
		for (const [m, a] of parts) v += Math.sin(2 * Math.PI * hz(midi) * m * t) * a * Math.exp(-t * (0.9 + m * 0.5));
		v *= 0.07 * g;
		add(st + j, v, v, 0.8);
	}
};
const clang = (t0, g = 1) => {
	const st = Math.round(t0 * SR);
	const parts = [[520, 1], [1347, 0.6], [2210, 0.45], [3471, 0.3], [4890, 0.2]];
	for (let j = 0; j < 1.4 * SR; j++) {
		const t = j / SR;
		let v = 0;
		for (const [f, a] of parts) v += Math.sin(2 * Math.PI * f * t) * a * Math.exp(-t * (3 + f / 900));
		v = v * 0.09 * g + (j < 0.01 * SR ? noise() * 0.2 * g : 0);
		add(st + j, v, v * 0.85, 0.5);
	}
};
const thump = (t0, g, heavy) => {
	kick(t0, (heavy ? 1.1 : 0.55) * g, heavy ? 110 : 190, heavy ? 35 : 70, heavy ? 0.6 : 0.2);
	const st = Math.round(t0 * SR);
	let lp = 0;
	for (let j = 0; j < (heavy ? 0.5 : 0.15) * SR; j++) {
		lp += (heavy ? 0.15 : 0.35) * (noise() - lp);
		const v = lp * Math.exp(-j / ((heavy ? 0.08 : 0.025) * SR)) * 0.5 * g;
		add(st + j, v, v, 0.25);
	}
	if (heavy) {
		// metal crunch
		for (let k = 0; k < 5; k++) {
			const s2 = st + Math.round((0.02 + rnd() * 0.15) * SR);
			for (let j = 0; j < 0.08 * SR; j++) {
				const v = Math.sin(2 * Math.PI * (900 + rnd() * 2400) * (j / SR)) * Math.exp(-j / (0.015 * SR)) * 0.08 * g;
				add(s2 + j, v * rnd(), v * rnd(), 0.3);
			}
		}
	}
};
const debris = (t0, g = 1) => {
	for (let k = 0; k < 10; k++) {
		const dt = k * 0.06 + rnd() * 0.05;
		thump(t0 + dt, g * (1 - k / 14), k < 2);
	}
};

// ── 3. Rhythm grid (restarts on cuts) + a ticking clock while time is suspended
const ticking = (t) => zeroG(t) && sceneAt(t).id !== 'zipla';
scenes.forEach((s, idx) => {
	const t0 = sec(s.from);
	const t1 = sec(s.to);
	for (let b = 0, t = t0; t < t1 - 0.05; b++, t = t0 + b * beat) {
		if (ticking(t)) {
			hat(t, 0.9, b % 2 ? 0.3 : 0.7);
			continue;
		}
		if (s.intensity >= 0.5) {
			kick(t, b % 4 === 0 ? 0.85 : 0.5);
			hat(t + beat / 2, 0.8 * s.intensity, 0.4);
			if (s.intensity > 0.75) {
				hat(t + beat / 4, 0.45, 0.65);
				hat(t + (3 * beat) / 4, 0.45, 0.65);
			}
		} else if (b % 2 === 0) {
			kick(t, 0.35, 90, 40, 0.3);
		}
	}
	if (idx > 0) {
		if (s.transition === 'whip' || s.transition === 'zoom') whoosh(t0, 0.9);
		if (s.transition === 'flash') impact(t0, 0.5, 1.2);
		if (s.transition === 'smoke') impact(t0, 0.35, 1.6);
	}
});

// ── 4. Wind/air bed while floating: grows with the hero's altitude
if (OFF !== null && ON !== null) {
	const st = Math.round(sec(OFF) * SR);
	const en = Math.round(sec(ON) * SR);
	let lp = 0, lp2 = 0;
	for (let i = st; i < en + 0.5 * SR && i < total; i++) {
		const p = (i - st) / (en - st);
		const a = 0.004 + 0.02 * p + 0.01 * Math.sin(i / SR * 0.9) ** 2;
		lp += a * (noise() - lp);
		lp2 += a * (noise() - lp2);
		const fade = Math.min(1, (i - st) / (0.6 * SR)) * Math.min(1, (en + 0.5 * SR - i) / (0.2 * SR));
		const g = (0.6 + 0.8 * p) * fade * 1.6;
		add(i, lp * g, lp2 * g, 0.2);
	}
}

// ── 5. Story hits
for (const h of tl.hits) {
	const t = sec(h.frame);
	switch (h.kind) {
		case 'gravity-off':
			noiseSweep(t - 1.2, 1.25, 1.6, 0.02, 0.6, 0.6, 3);
			pitchSweep(t, 1.6, 180, 38, 1.6, 'saw', 0.3); // "vwoom" down
			bell(t + 0.05, root0 + 36, 1.2, 4);
			bell(t + 0.1, root0 + 43, 0.7, 4);
			kick(t, 1.6, 90, 25, 1.2);
			break;
		case 'whoosh':
			whoosh(t + 0.2, 1.2, 0.7);
			break;
		case 'miss':
			whoosh(t + 0.1, 1.1, 0.4);
			pitchSweep(t + 0.05, 0.45, 520, 140, 1.2, 'sine', 0.2);
			break;
		case 'bloop':
			pitchSweep(t, 0.18, 300, 900, 1.6, 'sine', 0.4);
			pitchSweep(t + 0.12, 0.14, 500, 1300, 1.0, 'sine', 0.4);
			break;
		case 'tick':
			clang(t, 0.35);
			kick(t, 0.9, 70, 40, 0.5);
			break;
		case 'grab':
			clang(t, 1.2);
			kick(t, 0.8, 140, 60, 0.25);
			break;
		case 'gravity-on':
			braam(t, 1.5);
			impact(t, 1.5, 2.4);
			pitchSweep(t, 0.9, 50, 28, 2.2, 'sine', 0);
			break;
		case 'crash':
			debris(t, 0.9);
			break;
		case 'sting':
			noiseSweep(t - 1.6, 1.6, 1.1, 0.01, 0.5, 0.6, 2.5);
			impact(t, 0.8, 2);
			bell(t, root0 + 24, 1.2, 5);
			bell(t, root0 + 31, 0.8, 5);
			bell(t, root0 + 34, 0.6, 5);
			break;
	}
}
// Opening punch: the first frame must hit.
impact(0.02, 1.0, 1.8);
noiseSweep(0, 0.9, 1.2, 0.3, 0.05, 0.5, 0.5);

// ── 6. Physics-synced landings
for (const e of landings) {
	thump(sec(e.frame), 0.4 + e.gain * 0.9, e.gain > 0.6);
}

// ── 7. Reverb (Schroeder)
{
	const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({b: new Float32Array(Math.round(d * 1.5)), i: 0}));
	const aps = [225, 556, 441].map((d) => ({b: new Float32Array(Math.round(d * 1.5)), i: 0}));
	for (let n = 0; n < total; n++) {
		let acc = 0;
		for (const c of combs) {
			const y = c.b[c.i];
			c.b[c.i] = send[n] + y * 0.84;
			c.i = (c.i + 1) % c.b.length;
			acc += y;
		}
		let x = acc / combs.length;
		for (const a of aps) {
			const y = a.b[a.i];
			a.b[a.i] = x + y * 0.5;
			a.i = (a.i + 1) % a.b.length;
			x = y - x * 0.5;
		}
		L[n] += x * 0.5;
		R[n] += x * 0.46;
	}
}

// ── 8. Master: soft clip + normalise + fade
let peak = 0;
const fo = 1.2 * SR;
for (let i = 0; i < total; i++) {
	const f = Math.min(1, (total - i) / fo);
	L[i] = Math.tanh(L[i] * 1.3 * f);
	R[i] = Math.tanh(R[i] * 1.3 * f);
	peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.9 / peak;
const buf = Buffer.alloc(44 + total * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + total * 4, 4);
buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(total * 4, 40);
for (let i = 0; i < total; i++) {
	buf.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4);
	buf.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4);
}
const out = path.join(root, 'public', storyDir, 'score.wav');
writeFileSync(out, buf);
console.log(`Score: ${out} (${(total / SR).toFixed(2)}s, ${landings.length} physics landings, ${tl.hits.length} story hits)`);
