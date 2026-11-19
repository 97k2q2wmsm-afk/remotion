'use client';
import { useMemo, useRef, useState } from 'react';
import { GripVertical, Minus, Plus } from 'lucide-react';
import type { Timeline } from '@/types';
import { AssetImage } from '@/components/common';
import { cn } from '@/components/ui';
import { clipStarts, timelineDuration } from '@/services/timeline/math';
import { formatTime } from '@/utils';

export type Selection = { kind: 'clip' | 'audio' | 'cue' | 'overlay'; id: string } | null;

const LABEL_W = 76;

export function TimelineView({
  timeline,
  time,
  selection,
  onSelect,
  onSeek,
  onReorder,
}: {
  timeline: Timeline;
  time: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onSeek: (t: number) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const total = timelineDuration(timeline);
  const [pps, setPps] = useState(() => Math.max(24, Math.min(90, 900 / Math.max(10, total)))); // pixels per second
  const starts = useMemo(() => clipStarts(timeline), [timeline]);
  const width = Math.max(total * pps + 40, 300);
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; x0: number; dx: number } | null>(null);

  const seekFromEvent = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onSeek(Math.max(0, Math.min(total, (e.clientX - rect.left) / pps)));
  };

  const dropIndex = (from: number, dx: number) => {
    const center = starts[from] * pps + (timeline.clips[from].duration * pps) / 2 + dx;
    let to = 0;
    for (let i = 0; i < timeline.clips.length; i++) if (center > starts[i] * pps + (timeline.clips[i].duration * pps) / 2) to = i;
    return center < (timeline.clips[0].duration * pps) / 2 ? 0 : to;
  };

  const ticks: number[] = [];
  const step = pps > 60 ? 1 : pps > 30 ? 2 : pps > 12 ? 5 : 10;
  for (let t = 0; t <= total; t += step) ticks.push(t);

  const row = (label: string, children: React.ReactNode, h = 'h-12') => (
    <div className="flex">
      <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-line bg-surface px-2 text-[11px] font-bold uppercase tracking-wide text-muted" style={{ width: LABEL_W }}>
        {label}
      </div>
      <div className={cn('relative border-b border-line/60', h)} style={{ width }}>
        {children}
      </div>
    </div>
  );

  const audioRow = (label: string, track: 'narration' | 'music' | 'sfx', color: string) =>
    row(
      label,
      timeline[track].map((a) => (
        <button
          key={a.id}
          onClick={() => onSelect({ kind: 'audio', id: a.id })}
          className={cn('absolute top-1.5 h-9 overflow-hidden rounded-md border px-1.5 text-left text-[10px] font-semibold text-white', color, selection?.id === a.id ? 'ring-2 ring-white' : 'border-white/10')}
          style={{ left: a.start * pps, width: Math.max(8, a.duration * pps) }}
          title={a.label}
        >
          <span className="line-clamp-1">{a.label}</span>
        </button>
      )),
    );

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs text-muted">
        <span>
          {timeline.clips.length} clips · {formatTime(total, true)} · drag <GripVertical className="inline size-3" /> to reorder
        </span>
        <div className="flex items-center gap-1">
          <button className="grid size-8 place-items-center rounded-lg hover:bg-surface-2" aria-label="Zoom out" onClick={() => setPps((p) => Math.max(6, p / 1.5))}>
            <Minus className="size-4" />
          </button>
          <button className="grid size-8 place-items-center rounded-lg hover:bg-surface-2" aria-label="Zoom in" onClick={() => setPps((p) => Math.min(240, p * 1.5))}>
            <Plus className="size-4" />
          </button>
        </div>
      </div>
      <div ref={scroller} className="relative overflow-x-auto overscroll-x-contain">
        <div style={{ width: width + LABEL_W }} className="relative">
          {row(
            'Time',
            <div className="absolute inset-0 cursor-pointer" onPointerDown={seekFromEvent}>
              {ticks.map((t) => (
                <span key={t} className="absolute top-1 text-[10px] tabular-nums text-muted" style={{ left: t * pps + 2 }}>
                  <span className="absolute -left-0.5 top-4 h-2 w-px bg-line-strong" />
                  {formatTime(t)}
                </span>
              ))}
            </div>,
            'h-8',
          )}
          {row(
            'Video',
            timeline.clips.map((c, i) => {
              const dragging = drag?.from === i;
              return (
                <div
                  key={c.id}
                  className={cn(
                    'absolute top-1 flex h-16 overflow-hidden rounded-lg border bg-surface-3 transition-[box-shadow]',
                    selection?.id === c.id ? 'z-10 border-accent ring-2 ring-accent' : 'border-line-strong',
                    dragging && 'z-20 opacity-80 shadow-2xl',
                  )}
                  style={{ left: starts[i] * pps + (dragging ? drag.dx : 0), width: Math.max(10, c.duration * pps - 2) }}
                >
                  <button className="relative flex-1 text-left" onClick={() => onSelect({ kind: 'clip', id: c.id })} aria-label={`Clip ${i + 1}`}>
                    {c.kind === 'image' ? (
                      <AssetImage id={c.assetId} alt="" className="absolute inset-0 size-full opacity-80" />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-[10px] font-bold" style={{ background: c.title?.background, color: c.title?.color }}>
                        {c.title?.text}
                      </div>
                    )}
                    <span className="absolute bottom-0.5 left-1 rounded bg-black/60 px-1 text-[10px] font-bold text-white">
                      {i + 1} · {c.duration.toFixed(1)}s
                    </span>
                    {i > 0 && c.transition !== 'cut' && <span className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-r from-accent-2 to-transparent" />}
                  </button>
                  <span
                    className="flex w-5 shrink-0 cursor-grab touch-none items-center justify-center bg-black/40 text-white"
                    onPointerDown={(e) => {
                      (e.target as HTMLElement).setPointerCapture(e.pointerId);
                      setDrag({ from: i, x0: e.clientX, dx: 0 });
                    }}
                    onPointerMove={(e) => drag && drag.from === i && setDrag({ ...drag, dx: e.clientX - drag.x0 })}
                    onPointerUp={() => {
                      if (drag && drag.from === i) {
                        const to = dropIndex(i, drag.dx);
                        setDrag(null);
                        if (to !== i) onReorder(i, to);
                      }
                    }}
                    onPointerCancel={() => setDrag(null)}
                    aria-label="Drag to reorder"
                  >
                    <GripVertical className="size-3.5" />
                  </span>
                </div>
              );
            }),
            'h-[72px]',
          )}
          {audioRow('Voice', 'narration', 'bg-emerald-600/80')}
          {audioRow('Music', 'music', 'bg-violet-600/80')}
          {audioRow('SFX', 'sfx', 'bg-amber-600/80')}
          {row(
            'Subs',
            timeline.captions.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect({ kind: 'cue', id: c.id })}
                className={cn('absolute top-2 h-8 overflow-hidden rounded bg-sky-700/70 px-1 text-left text-[10px] text-white', selection?.id === c.id && 'ring-2 ring-white')}
                style={{ left: c.start * pps, width: Math.max(6, (c.end - c.start) * pps - 1) }}
                title={c.text}
              >
                <span className="line-clamp-1">{c.text}</span>
              </button>
            )),
          )}
          {row(
            'Text',
            timeline.overlays.map((o) => (
              <button
                key={o.id}
                onClick={() => onSelect({ kind: 'overlay', id: o.id })}
                className={cn('absolute top-2 h-8 overflow-hidden rounded bg-pink-700/70 px-1 text-left text-[10px] text-white', selection?.id === o.id && 'ring-2 ring-white')}
                style={{ left: o.start * pps, width: Math.max(6, (o.end - o.start) * pps) }}
              >
                <span className="line-clamp-1">{o.text}</span>
              </button>
            )),
          )}
          <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-danger" style={{ left: LABEL_W + time * pps }} />
        </div>
      </div>
    </div>
  );
}
