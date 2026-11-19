import type { MusicMood, SfxKind } from '@/types';

// Original procedural music beds and sound effects, synthesized on the device.
// They contain no third-party recordings, so they are free to use in published videos.

const OAC = () =>
  (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext);

interface MoodSpec {
  bpm: number;
  root: number; // MIDI note of the tonic
  progression: number[][]; // chord tones in semitones from root
  pad: OscillatorType;
  brightness: number; // lowpass cutoff Hz
  pulse: boolean;
  arp: boolean;
  bassGain: number;
}

const MOODS: Record<MusicMood, MoodSpec> = {
  calm: { bpm: 70, root: 52, progression: [[0, 4, 7, 11], [-3, 0, 4, 7], [5, 9, 12, 16], [2, 7, 11, 14]], pad: 'triangle', brightness: 1800, pulse: false, arp: true, bassGain: 0.25 },
  mystery: { bpm: 76, root: 50, progression: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-5, -1, 2, 7]], pad: 'sawtooth', brightness: 900, pulse: false, arp: true, bassGain: 0.3 },
  epic: { bpm: 84, root: 45, progression: [[0, 3, 7, 12], [-4, 0, 3, 8], [-7, -3, 0, 5], [-2, 2, 5, 10]], pad: 'sawtooth', brightness: 2200, pulse: true, arp: false, bassGain: 0.45 },
  dark: { bpm: 62, root: 43, progression: [[0, 3, 7], [1, 4, 8], [0, 3, 7], [-1, 3, 6]], pad: 'sawtooth', brightness: 650, pulse: false, arp: false, bassGain: 0.5 },
  uplifting: { bpm: 96, root: 55, progression: [[0, 4, 7, 12], [7, 11, 14, 19], [9, 12, 16, 21], [5, 9, 12, 17]], pad: 'triangle', brightness: 3000, pulse: true, arp: true, bassGain: 0.3 },
  tension: { bpm: 100, root: 47, progression: [[0, 3, 7], [0, 3, 8], [0, 3, 7], [-1, 2, 6]], pad: 'sawtooth', brightness: 1200, pulse: true, arp: true, bassGain: 0.4 },
};

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = rnd() * (1 - i / len) ** decay;
  }
  return buf;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 987654;
  for (let i = 0; i < len; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  return buf;
}

/**
 * Renders a seamless music loop (8 bars) for a mood. The timeline loops it to any length,
 * which keeps memory low on phones instead of rendering minutes of audio.
 */
export async function renderMusicLoop(mood: MusicMood, sampleRate = 32000): Promise<AudioBuffer> {
  const spec = MOODS[mood];
  const beat = 60 / spec.bpm;
  const bar = beat * 4;
  const bars = 8;
  const length = bar * bars;
  const tail = 3; // rendered then folded back onto the start for a seamless loop
  const ctx = new (OAC())(2, Math.ceil((length + tail) * sampleRate), sampleRate);

  const master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 3.2, 2.5);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  reverb.connect(wet).connect(master);

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = spec.brightness;
  padFilter.Q.value = 0.7;
  const padBus = ctx.createGain();
  padBus.gain.value = 0.16;
  padFilter.connect(padBus);
  padBus.connect(master);
  padBus.connect(reverb);

  // Slow filter movement for life.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = spec.brightness * 0.35;
  lfo.connect(lfoGain).connect(padFilter.frequency);
  lfo.start(0);

  for (let b = 0; b < bars; b++) {
    const chord = spec.progression[Math.floor(b / 2) % spec.progression.length];
    const t0 = b * bar;
    if (b % 2 === 0) {
      for (const semi of chord) {
        for (const detune of [-7, 6]) {
          const o = ctx.createOscillator();
          o.type = spec.pad;
          o.frequency.value = midiHz(spec.root + 12 + semi);
          o.detune.value = detune;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(0.5 / chord.length, t0 + bar * 0.6);
          g.gain.setValueAtTime(0.5 / chord.length, t0 + bar * 1.6);
          g.gain.linearRampToValueAtTime(0, t0 + bar * 2 + 1.2);
          o.connect(g).connect(padFilter);
          o.start(t0);
          o.stop(t0 + bar * 2 + 1.3);
        }
      }
      // Bass
      const bass = ctx.createOscillator();
      bass.type = 'sine';
      bass.frequency.value = midiHz(spec.root - 12 + chord[0]);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0, t0);
      bg.gain.linearRampToValueAtTime(spec.bassGain, t0 + 0.4);
      bg.gain.setValueAtTime(spec.bassGain, t0 + bar * 2 - 0.4);
      bg.gain.linearRampToValueAtTime(0, t0 + bar * 2 + 0.2);
      bass.connect(bg).connect(master);
      bass.start(t0);
      bass.stop(t0 + bar * 2 + 0.3);
    }
    if (spec.pulse) {
      for (let i = 0; i < 8; i++) {
        const t = t0 + i * (beat / 2);
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = midiHz(spec.root - 12 + chord[0]);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(i % 2 === 0 ? 0.32 : 0.16, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.45);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + beat * 0.5);
      }
      // Soft kick on 1 and 3
      for (const k of [0, 2]) {
        const t = t0 + k * beat;
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + 0.32);
      }
    }
    if (spec.arp) {
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const t = t0 + i * (bar / steps);
        const semi = chord[i % chord.length] + (i >= 4 ? 12 : 0);
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midiHz(spec.root + 24 + semi);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + bar / steps * 1.8);
        o.connect(g);
        g.connect(master);
        g.connect(reverb);
        o.start(t);
        o.stop(t + bar / steps * 2);
      }
    }
  }

  const rendered = await ctx.startRendering();
  // Fold the tail onto the beginning so the loop point is seamless.
  const loopLen = Math.floor(length * sampleRate);
  const out = new AudioBuffer({ numberOfChannels: 2, length: loopLen, sampleRate });
  for (let c = 0; c < 2; c++) {
    const src = rendered.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, loopLen));
    for (let i = loopLen; i < src.length && i - loopLen < loopLen; i++) dst[i - loopLen] += src[i];
  }
  return out;
}

export async function renderSfx(kind: SfxKind, sampleRate = 44100): Promise<AudioBuffer> {
  const dur: Record<SfxKind, number> = { whoosh: 1.1, impact: 2.2, riser: 3, swell: 2.6, click: 0.15, rumble: 2.8, chime: 2.5 };
  const length = dur[kind];
  const ctx = new (OAC())(2, Math.ceil(length * sampleRate), sampleRate);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const noise = () => {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, length);
    return n;
  };
  switch (kind) {
    case 'whoosh': {
      const n = noise();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.4;
      f.frequency.setValueAtTime(300, 0);
      f.frequency.exponentialRampToValueAtTime(3500, length * 0.55);
      f.frequency.exponentialRampToValueAtTime(600, length);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(0.9, length * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, length);
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(-0.8, 0);
      pan.pan.linearRampToValueAtTime(0.8, length);
      n.connect(f).connect(g).connect(pan).connect(out);
      n.start(0);
      break;
    }
    case 'impact': {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(120, 0);
      o.frequency.exponentialRampToValueAtTime(28, 1.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(1, 0);
      g.gain.exponentialRampToValueAtTime(0.0001, length);
      o.connect(g).connect(out);
      o.start(0);
      const n = noise();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(4000, 0);
      f.frequency.exponentialRampToValueAtTime(200, 0.6);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.8, 0);
      ng.gain.exponentialRampToValueAtTime(0.0001, 0.8);
      n.connect(f).connect(ng).connect(out);
      n.start(0);
      break;
    }
    case 'riser': {
      const n = noise();
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.setValueAtTime(200, 0);
      f.frequency.exponentialRampToValueAtTime(6000, length);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(0.6, length * 0.95);
      g.gain.linearRampToValueAtTime(0, length);
      n.connect(f).connect(g).connect(out);
      n.start(0);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(110, 0);
      o.frequency.exponentialRampToValueAtTime(880, length);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, 0);
      og.gain.exponentialRampToValueAtTime(0.12, length * 0.95);
      og.gain.linearRampToValueAtTime(0, length);
      o.connect(og).connect(out);
      o.start(0);
      break;
    }
    case 'swell': {
      for (const semi of [0, 7, 12, 16]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midiHz(48 + semi);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, 0);
        g.gain.exponentialRampToValueAtTime(0.18, length * 0.85);
        g.gain.exponentialRampToValueAtTime(0.0001, length);
        o.connect(g).connect(out);
        o.start(0);
      }
      break;
    }
    case 'click': {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, 0);
      g.gain.exponentialRampToValueAtTime(0.0001, 0.05);
      o.connect(g).connect(out);
      o.start(0);
      break;
    }
    case 'rumble': {
      const n = noise();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 140;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(1.6, 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, length);
      n.connect(f).connect(g).connect(out);
      n.start(0);
      break;
    }
    case 'chime': {
      for (const [semi, amp] of [[0, 0.3], [12, 0.15], [19, 0.1], [24, 0.06]] as const) {
        const o = ctx.createOscillator();
        o.frequency.value = midiHz(72 + semi);
        const g = ctx.createGain();
        g.gain.setValueAtTime(amp, 0);
        g.gain.exponentialRampToValueAtTime(0.0001, length);
        o.connect(g).connect(out);
        o.start(0);
      }
      break;
    }
  }
  return ctx.startRendering();
}

/** Maps free-text sound suggestions from the script to a synthesized effect. */
export function sfxKindFor(text: string): SfxKind | undefined {
  const t = text.toLowerCase();
  if (/(whoosh|swoosh|wind|swipe|rush|fly|rüzgar|viento)/.test(t)) return 'whoosh';
  if (/(boom|impact|crash|explo|thud|hit|slam|patla|çarp|golpe|explos)/.test(t)) return 'impact';
  if (/(rise|riser|tension|build|suspense|gerilim|tensión)/.test(t)) return 'riser';
  if (/(rumble|earthquake|thunder|volcan|deprem|gök|trueno|terremoto)/.test(t)) return 'rumble';
  if (/(chime|bell|magic|sparkle|ding|zil|campana)/.test(t)) return 'chime';
  if (/(click|tick|clock|typing|saat|reloj)/.test(t)) return 'click';
  if (/(swell|choir|reveal|epic|orchestra)/.test(t)) return 'swell';
  return undefined;
}
