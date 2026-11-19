'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Pause, Play, SkipBack } from 'lucide-react';
import type { Timeline } from '@/types';
import { Compositor, loadFonts } from '@/services/compositor/compositor';
import { audioSignature, renderMix } from '@/services/compositor/audioMix';
import { audioContext } from '@/services/media/audio';
import { timelineDuration } from '@/services/timeline/math';
import { aspectSize, formatTime } from '@/utils';
import { Button } from '@/components/ui';

export interface PlayerHandle {
  seek: (t: number) => void;
  play: (from?: number) => void;
  pause: () => void;
}

/** Real-time preview: same compositor as the export, audio from the same offline mix. */
export const Player = forwardRef<PlayerHandle, { timeline: Timeline; time: number; onTime: (t: number) => void }>(function Player({ timeline, time, onTime }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compRef = useRef<Compositor | null>(null);
  const mixRef = useRef<{ sig: string; buffer: AudioBuffer } | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef(0);
  const timeRef = useRef(time);
  const [playing, setPlaying] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const total = timelineDuration(timeline);
  const size = aspectSize(timeline.aspect, '720p');
  const scale = timeline.aspect === '16:9' ? 0.75 : 0.6;
  const W = Math.round(size.width * scale);
  const H = Math.round(size.height * scale);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    if (!compRef.current || compRef.current.width !== W) {
      compRef.current?.cache.clear();
      compRef.current = new Compositor(ctx, timeline, W, H);
    } else compRef.current.setTimeline(timeline);
    void loadFonts().then(() => draw(timeRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, W, H]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    srcRef.current?.stop();
    compRef.current?.cache.clear();
  }, []);

  const draw = useCallback(async (t: number, wait = true) => {
    const comp = compRef.current;
    if (!comp) return;
    if (wait) await comp.prepare(t);
    comp.draw(t);
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    try {
      srcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    srcRef.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback(
    async (from?: number) => {
      stop();
      let start = from ?? timeRef.current;
      if (start >= total - 0.05) start = 0;
      const ctx = audioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      const sig = audioSignature(timeline);
      if (mixRef.current?.sig !== sig) {
        setPreparing(true);
        try {
          const { buffer } = await renderMix(timeline, 44100);
          mixRef.current = { sig, buffer };
          setAudioError(null);
        } catch (e) {
          mixRef.current = null;
          setAudioError((e as Error).message);
        } finally {
          setPreparing(false);
        }
      }
      await draw(start);
      const t0 = ctx.currentTime;
      if (mixRef.current) {
        const src = ctx.createBufferSource();
        src.buffer = mixRef.current.buffer;
        src.connect(ctx.destination);
        src.start(0, start);
        srcRef.current = src;
      }
      setPlaying(true);
      let lastEmit = 0;
      const tick = () => {
        const t = start + (ctx.currentTime - t0);
        timeRef.current = t;
        if (t >= total) {
          stop();
          onTime(total);
          return;
        }
        compRef.current?.draw(t);
        if (performance.now() - lastEmit > 100) {
          onTime(t);
          lastEmit = performance.now();
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [draw, onTime, stop, timeline, total],
  );

  useImperativeHandle(ref, () => ({
    seek: (t) => {
      const was = !!srcRef.current;
      stop();
      timeRef.current = Math.max(0, Math.min(total, t));
      onTime(timeRef.current);
      if (was) void play(timeRef.current);
      else void draw(timeRef.current);
    },
    play: (from) => void play(from),
    pause: stop,
  }));

  useEffect(() => {
    if (!playing && Math.abs(time - timeRef.current) > 0.01) {
      timeRef.current = time;
      void draw(time);
    }
  }, [time, playing, draw]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative overflow-hidden rounded-2xl border border-line bg-black ${timeline.aspect === '9:16' ? 'h-[52dvh] max-h-[560px] aspect-[9/16]' : timeline.aspect === '1:1' ? 'w-full max-w-md aspect-square' : 'w-full aspect-video'}`}>
        <canvas ref={canvasRef} className="size-full" aria-label="Video preview" />
        {preparing && (
          <div className="absolute inset-0 grid place-items-center bg-black/50 text-sm text-white">
            <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Mixing audio…</span>
          </div>
        )}
      </div>
      <div className="flex w-full max-w-xl items-center gap-2">
        <Button size="sm" variant="ghost" aria-label="Back to start" onClick={() => { stop(); timeRef.current = 0; onTime(0); void draw(0); }}>
          <SkipBack className="size-4" />
        </Button>
        <Button size="sm" variant="primary" aria-label={playing ? 'Pause' : 'Play'} onClick={() => (playing ? stop() : play())}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <input
          type="range"
          min={0}
          max={total || 1}
          step={0.01}
          value={Math.min(time, total)}
          onChange={(e) => {
            const t = Number(e.target.value);
            stop();
            timeRef.current = t;
            onTime(t);
            void draw(t);
          }}
          className="h-8 flex-1 accent-[var(--accent)]"
          aria-label="Seek"
        />
        <span className="w-24 text-right text-xs tabular-nums text-muted">
          {formatTime(time, true)} / {formatTime(total)}
        </span>
      </div>
      {audioError && <div className="text-xs text-warning">Audio preview unavailable: {audioError}</div>}
    </div>
  );
});
