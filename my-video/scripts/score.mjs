// Procedural, fully original score + sound design, synchronised to the story timeline.
// Every scene cut gets a riser + impact, the beat grid restarts on each cut, harmony and
// energy follow each scene's `chord` / `intensity`, and word-anchored `hits` get bespoke SFX.
//
// Usage: node scripts/score.mjs pompeya   →  public/<storyDir>/score.wav
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const storyDir = process.argv[2];
if (!storyDir) {
	throw new Error('Usage: node scripts/score.mjs <storyDir>');
}
const root = path.resolve(import.meta.dirname, '..');
const story = JSON.parse(readFileSync(path.join(root, 'src/stories', storyDir, 'story.json'), 'utf8'));
const tl = JSON.parse(readFileSync(path.join(root, 'src/stories', storyDir, 'timeline.json'), 'utf8'));

const SR = 48000;
const fps = tl.fps;
const total = Math.ceil((tl.durationInFrames / fps) * SR);
const L = new Float32Array(total);
const R = new Float32Array(total);
const send = new Float32Array(total); // reverb send (mono)

// Deterministic PRNG so every render of the score is identical.
let seed = 1337;
const rnd = () => {
	seed = (seed * 1664525 + 1013904223) >>> 0;
	return seed / 4294967296;
};
const noise = () => rnd() * 2 - 1;
const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);
const sec = (frame) => frame / fps;
const add = (i, l, r, rev = 0) => {
	if (i < 0 || i >= total) return;
	L[i] += l;
	R[i] += r;
	send[i] += (l + r) * 0.5 * rev;
};

const scenes = tl.scenes;
const sceneAt = (t) => scenes.findLast((s) => sec(s.from) <= t) ?? scenes[0];
const rootMidi = story.music.root;

// ---------- 1. Pads: detuned saw stacks, low-passed by scene intensity, crossfaded on cuts ----------
{
	const phases = new Float64Array(64);
	let lp1L = 0, lp2L = 0, lp1R = 0, lp2R = 0;
	const xfade = 0.6 * SR;
	for (let i = 0; i < total; i++) {
		const t = i / SR;
		const idx = scenes.indexOf(sceneAt(t));
		const cur = scenes[idx];
		const prev = scenes[Math.max(0, idx - 1)];
		const since = i - sec(cur.from) * SR;
		const mix = idx === 0 ? 1 : Math.min(1, since / xfade);
		let l = 0;
		let r = 0;
		let p = 0;
		for (const [scene, w] of [[prev, 1 - mix], [cur, mix]]) {
			for (const interval of scene.chord) {
				for (const oct of [12, 24]) {
					for (const det of [-0.11, 0, 0.13]) {
						const hz = midiToHz(rootMidi + oct + interval + det);
						phases[p] = (phases[p] + hz / SR) % 1;
						const saw = phases[p] * 2 - 1;
						const pan = det < 0 ? 0.75 : det > 0 ? 0.25 : 0.5;
						l += saw * w * pan;
						r += saw * w * (1 - pan);
						p++;
					}
				}
			}
		}
		const inten = cur.intensity * mix + prev.intensity * (1 - mix);
		const cutoff = 280 + 1500 * inten + 120 * Math.sin(t * 0.7);
		const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
		lp1L += a * (l - lp1L); lp2L += a * (lp1L - lp2L);
		lp1R += a * (r - lp1R); lp2R += a * (lp1R - lp2R);
		const swell = 0.85 + 0.15 * Math.sin(t * Math.PI * 2 * 0.12);
		const g = 0.022 * (0.55 + inten * 0.6) * swell;
		add(i, lp2L * g, lp2R * g, 0.6);
	}
}

// ---------- 2. Sub drone ----------
{
	let ph = 0;
	for (let i = 0; i < total; i++) {
		const t = i / SR;
		const s = sceneAt(t);
		ph += midiToHz(rootMidi - 12 + s.chord[0] + (s.chord[0] < -3 ? 12 : 0)) / SR;
		const v = Math.sin(ph * 2 * Math.PI) * 0.09 * (0.4 + s.intensity * 0.6);
		add(i, v, v);
	}
}

// ---------- helpers for one-shot sounds ----------
const kick = (t0, gain = 1, f0 = 110, f1 = 42, dur = 0.5) => {
	const start = Math.round(t0 * SR);
	let ph = 0;
	for (let j = 0; j < dur * SR; j++) {
		const t = j / SR;
		const f = f1 + (f0 - f1) * Math.exp(-t * 18);
		ph += f / SR;
		const env = Math.exp(-t * (5 / dur));
		const v = Math.sin(ph * 2 * Math.PI) * env * 0.55 * gain;
		add(start + j, v, v, 0.15);
	}
};

const tick = (t0, gain = 1, pan = 0.5) => {
	const start = Math.round(t0 * SR);
	let hp = 0, prev = 0;
	for (let j = 0; j < 0.06 * SR; j++) {
		const n = noise();
		hp = 0.92 * (hp + n - prev);
		prev = n;
		const v = hp * Math.exp(-j / (0.012 * SR)) * 0.09 * gain;
		add(start + j, v * (1 - pan) * 2, v * pan * 2, 0.2);
	}
};

const impact = (t0, gain = 1) => {
	kick(t0, 1.5 * gain, 140, 30, 2.2);
	const start = Math.round(t0 * SR);
	let lp = 0, hp = 0, prev = 0;
	for (let j = 0; j < 3 * SR; j++) {
		const t = j / SR;
		const n = noise();
		lp += 0.08 * (n - lp); // body
		hp = 0.97 * (hp + n - prev); // shimmer
		prev = n;
		const body = lp * Math.exp(-t * 3.5) * 0.9;
		const shimmer = hp * Math.exp(-t * 1.6) * 0.05;
		add(start + j, (body + shimmer) * gain, (body + shimmer * 0.8) * gain, 0.7);
	}
};

const riser = (tEnd, dur = 1.3, gain = 1) => {
	const start = Math.round((tEnd - dur) * SR);
	let bp = 0, lp = 0;
	for (let j = 0; j < dur * SR; j++) {
		const p = j / (dur * SR);
		const n = noise();
		const a = 0.01 + p * p * 0.4;
		lp += a * (n - lp);
		bp = lp;
		const v = bp * p ** 2.2 * 0.35 * gain;
		add(start + j, v * (0.7 + 0.3 * Math.sin(p * 40)), v * (0.7 - 0.3 * Math.sin(p * 40)), 0.5);
	}
};

const rumble = (t0, dur, gain = 1) => {
	const start = Math.round(t0 * SR);
	let b = 0;
	for (let j = 0; j < dur * SR; j++) {
		const p = j / (dur * SR);
		b = (b + 0.02 * noise()) * 0.995; // brown noise
		const env = Math.min(1, p * 6) * Math.min(1, (1 - p) * 4);
		const wob = 0.7 + 0.3 * Math.sin(j / SR * 2.3) * Math.sin(j / SR * 0.7);
		const v = b * env * wob * 1.6 * gain;
		add(start + j, v, v * 0.92, 0.2);
	}
};

const bell = (t0, midi, gain = 1) => {
	const start = Math.round(t0 * SR);
	const partials = [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]];
	for (let j = 0; j < 4 * SR; j++) {
		const t = j / SR;
		let v = 0;
		for (const [m, a] of partials) {
			v += Math.sin(2 * Math.PI * midiToHz(midi) * m * t) * a * Math.exp(-t * (0.8 + m * 0.4));
		}
		v *= 0.08 * gain;
		add(start + j, v, v, 0.8);
	}
};

const crash = (t0, gain = 1) => {
	// Collapsing roof: a cluster of debris thuds with crackle.
	for (let k = 0; k < 9; k++) {
		const dt = k * 0.07 + rnd() * 0.05;
		kick(t0 + dt, 0.5 * gain * (1 - k / 12), 180 + rnd() * 80, 50, 0.25);
		const start = Math.round((t0 + dt) * SR);
		for (let j = 0; j < 0.12 * SR; j++) {
			const v = noise() * Math.exp(-j / (0.02 * SR)) * 0.18 * gain;
			add(start + j, v * rnd(), v * rnd(), 0.3);
		}
	}
};

// ---------- 3. Rhythm: grid restarts on every cut, density follows intensity ----------
const beat = 60 / story.music.bpm;
scenes.forEach((s, idx) => {
	const t0 = sec(s.from);
	const t1 = sec(s.to);
	const isLast = idx === scenes.length - 1;
	for (let b = 0, t = t0; t < t1 - 0.05; b++, t = t0 + b * beat) {
		if (s.intensity < 0.4) {
			// heartbeat
			if (b % 2 === 0) {
				kick(t, 0.45, 80, 40, 0.3);
				kick(t + 0.22, 0.3, 80, 40, 0.3);
			}
		} else {
			kick(t, b % 4 === 0 ? 0.9 : 0.55 * s.intensity);
			if (s.intensity > 0.55) {
				tick(t + beat / 2, s.intensity, 0.35);
			}
			if (s.intensity > 0.8) {
				tick(t + beat / 4, 0.5, 0.65);
				tick(t + (3 * beat) / 4, 0.5, 0.65);
			}
		}
		if (isLast && b > 6) break;
	}
	// Cut sync: riser into the cut, impact on the cut.
	if (idx > 0) {
		riser(t0, 1.1, 0.6 + s.intensity * 0.5);
		impact(t0, 0.45 + s.intensity * 0.45);
	}
});

// ---------- 4. Story hits ----------
for (const hit of tl.hits) {
	const t = sec(hit.frame);
	if (hit.kind === 'blast') {
		riser(t, 1.6, 1.3);
		impact(t, 1.5);
		impact(t + 0.05, 0.8);
	} else if (hit.kind === 'crash') {
		crash(t, 1.2);
	} else if (hit.kind === 'toll') {
		bell(t, rootMidi + 24, 1.4);
		bell(t + 0.02, rootMidi + 31, 0.6);
	} else if (hit.kind === 'boom') {
		impact(t, 1.1);
		bell(t, rootMidi + 36, 0.7);
	}
}

// Volcano rumble bed from the eruption until the surge is over.
const sceneById = Object.fromEntries(scenes.map((s) => [s.id, s]));
if (sceneById.erupcion && sceneById.hallazgo) {
	const blast = tl.hits.find((h) => h.id === 'blast');
	const startT = blast ? sec(blast.frame) : sec(sceneById.erupcion.from);
	rumble(startT, sec(sceneById.hallazgo.from) - startT + 0.4, 1);
}

// ---------- 5. Reverb (Schroeder) ----------
{
	const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({buf: new Float32Array(Math.round(d * 1.6)), i: 0}));
	const aps = [225, 556, 441].map((d) => ({buf: new Float32Array(Math.round(d * 1.6)), i: 0}));
	for (let n = 0; n < total; n++) {
		let acc = 0;
		for (const c of combs) {
			const y = c.buf[c.i];
			c.buf[c.i] = send[n] + y * 0.86;
			c.i = (c.i + 1) % c.buf.length;
			acc += y;
		}
		let x = acc / combs.length;
		for (const a of aps) {
			const y = a.buf[a.i];
			a.buf[a.i] = x + y * 0.5;
			a.i = (a.i + 1) % a.buf.length;
			x = y - x * 0.5;
		}
		L[n] += x * 0.55;
		R[n] += x * 0.5;
	}
}

// ---------- 6. Master: fade-out, soft clip, normalise ----------
const fadeOut = 1.2 * SR;
let peak = 0;
for (let i = 0; i < total; i++) {
	const f = Math.min(1, (total - i) / fadeOut) * Math.min(1, i / (0.05 * SR));
	L[i] = Math.tanh(L[i] * 1.2 * f);
	R[i] = Math.tanh(R[i] * 1.2 * f);
	peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak;

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
console.log(`Score written: ${out} (${(total / SR).toFixed(2)}s)`);
