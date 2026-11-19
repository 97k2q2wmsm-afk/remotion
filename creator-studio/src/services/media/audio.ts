let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const buf = await blob.arrayBuffer();
  try {
    return await audioContext().decodeAudioData(buf);
  } catch {
    throw new Error(`This audio file (${blob.type || 'unknown type'}) could not be decoded by the browser. Use MP3, M4A/AAC or WAV.`);
  }
}

export async function audioDuration(blob: Blob): Promise<number> {
  return (await decodeAudio(blob)).duration;
}

/** 16-bit PCM WAV encoder (interleaved). */
export function encodeWav(buffer: AudioBuffer): Blob {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const rate = buffer.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  data.setUint32(4, 36 + len * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  w(36, 'data');
  data.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buffer.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([data.buffer], { type: 'audio/wav' });
}

export function peakLevel(buffer: AudioBuffer): number {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

/** Records microphone narration with MediaRecorder. Returns a stop() that resolves the recording. */
export async function startRecording(): Promise<{ stop: () => Promise<Blob>; cancel: () => void }> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone recording is not supported in this browser.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(250);
  const end = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          end();
          resolve(new Blob(chunks, { type: rec.mimeType || 'audio/mp4' }));
        };
        rec.stop();
      }),
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
      end();
    },
  };
}
