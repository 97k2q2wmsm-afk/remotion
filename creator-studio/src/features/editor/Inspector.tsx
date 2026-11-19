'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, ImageIcon, Play, Trash2, Upload } from 'lucide-react';
import type { FontId, Project, Timeline, VideoClip } from '@/types';
import { MOTION_LABELS, MOTION_TYPES, TRANSITION_LABELS, TRANSITION_TYPES } from '@/config/states';
import { AssetImage } from '@/components/common';
import { Button, Card, Field, Input, Select, Sheet, Slider, Toggle } from '@/components/ui';
import { saveAsset } from '@/services/storage/assets';
import { imageDimensions } from '@/services/media/image';
import { clipStarts } from '@/services/timeline/math';
import { round } from '@/utils';
import { duplicateClip, findAudio, moveClip, patchAudio, patchClip, removeAudio, removeClip } from './ops';
import type { Selection } from './TimelineView';

export const FONTS: { value: FontId; label: string }[] = [
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Anton', label: 'Anton (display)' },
  { value: 'Cinzel', label: 'Cinzel (historical)' },
  { value: 'system-ui', label: 'System' },
  { value: 'Georgia', label: 'Georgia (serif)' },
];

function Num({ label, value, onChange, step = 0.1, min = 0 }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <Field label={label}>
      <div className="flex gap-1">
        <Button size="sm" className="h-11 w-11" onClick={() => onChange(round(Math.max(min, value - step), 3))} aria-label={`Decrease ${label}`}>−</Button>
        <Input type="number" step={step} min={min} value={round(value, 2)} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))} className="text-center" />
        <Button size="sm" className="h-11 w-11" onClick={() => onChange(round(value + step, 3))} aria-label={`Increase ${label}`}>+</Button>
      </div>
    </Field>
  );
}

export function Inspector({
  project,
  timeline,
  selection,
  onChange,
  onSelect,
  onPreview,
}: {
  project: Project;
  timeline: Timeline;
  selection: Selection;
  onChange: (t: Timeline) => void;
  onSelect: (s: Selection) => void;
  onPreview: (from: number) => void;
}) {
  const [pick, setPick] = useState(false);
  if (!selection) return <Card className="text-sm text-muted">Tap a clip, audio block, subtitle or text in the timeline to edit it.</Card>;

  if (selection.kind === 'clip') {
    const i = timeline.clips.findIndex((c) => c.id === selection.id);
    const c = timeline.clips[i];
    if (!c) return null;
    const set = (p: Partial<VideoClip>) => onChange(patchClip(timeline, c.id, p));
    const start = clipStarts(timeline)[i];
    const scene = project.scenes.find((s) => s.id === c.sceneId);
    const sceneImages = project.scenes.flatMap((s) => [s.imageAssetId, ...s.imageHistory]).filter((x): x is string => !!x);
    return (
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          {c.kind === 'image' ? <AssetImage id={c.assetId} alt="" className="size-16 rounded-lg" /> : <div className="grid size-16 place-items-center rounded-lg text-xs font-bold" style={{ background: c.title?.background, color: c.title?.color }}>Title</div>}
          <div className="flex-1 text-sm">
            <div className="font-bold">Clip {i + 1}{scene ? ` · Scene ${scene.number}` : ''}</div>
            <div className="text-xs text-muted">starts {start.toFixed(2)} s</div>
          </div>
          <Button size="sm" icon={<Play className="size-4" />} onClick={() => onPreview(start)}>Preview</Button>
        </div>
        {c.kind === 'image' && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<ImageIcon className="size-4" />} onClick={() => setPick(true)}>Replace image</Button>
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 text-sm font-medium">
              <Upload className="size-4" /> Upload
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const meta = await saveAsset({ projectId: project.id, kind: 'scene-image', name: f.name, blob: f, ...(await imageDimensions(f)), source: 'upload' });
                set({ assetId: meta.id });
              }} />
            </label>
          </div>
        )}
        {c.kind === 'title' && c.title && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title text"><Input value={c.title.text} onChange={(e) => set({ title: { ...c.title!, text: e.target.value } })} /></Field>
            <Field label="Subtitle"><Input value={c.title.subtitle} onChange={(e) => set({ title: { ...c.title!, subtitle: e.target.value } })} /></Field>
            <Field label="Text color"><Input type="color" value={c.title.color} onChange={(e) => set({ title: { ...c.title!, color: e.target.value } })} /></Field>
            <Field label="Background"><Input type="color" value={c.title.background} onChange={(e) => set({ title: { ...c.title!, background: e.target.value } })} /></Field>
            <Field label="Font"><Select value={c.title.font} onChange={(v) => set({ title: { ...c.title!, font: v } })} options={FONTS} /></Field>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Num label="Duration (s)" value={c.duration} onChange={(v) => set({ duration: Math.max(0.3, v) })} min={0.3} />
          {c.kind === 'image' && (
            <Field label="Camera movement">
              <Select value={c.motion} onChange={(v) => set({ motion: v })} options={MOTION_TYPES.map((m) => ({ value: m, label: MOTION_LABELS[m] }))} />
            </Field>
          )}
          {c.kind === 'image' && <Slider label="Motion intensity" value={c.motionIntensity} min={0.3} max={2} step={0.05} onChange={(v) => set({ motionIntensity: v })} format={(v) => `${Math.round(v * 100)}%`} />}
          {i > 0 && (
            <>
              <Field label="Transition in">
                <Select value={c.transition} onChange={(v) => set({ transition: v, transitionDuration: v === 'cut' ? 0 : c.transitionDuration || 0.5 })} options={TRANSITION_TYPES.map((t) => ({ value: t, label: TRANSITION_LABELS[t] }))} />
              </Field>
              {c.transition !== 'cut' && <Slider label="Transition length" value={c.transitionDuration} min={0.2} max={2} step={0.05} onChange={(v) => set({ transitionDuration: v })} format={(v) => `${v.toFixed(2)} s`} />}
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<ArrowLeft className="size-4" />} disabled={i === 0} onClick={() => onChange(moveClip(timeline, i, i - 1))}>Move left</Button>
          <Button size="sm" icon={<ArrowRight className="size-4" />} disabled={i === timeline.clips.length - 1} onClick={() => onChange(moveClip(timeline, i, i + 1))}>Move right</Button>
          <Button size="sm" icon={<Copy className="size-4" />} onClick={() => onChange(duplicateClip(timeline, c.id))}>Duplicate</Button>
          <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} disabled={timeline.clips.length <= 1} onClick={() => { onChange(removeClip(timeline, c.id)); onSelect(null); }}>Remove</Button>
        </div>
        <Sheet open={pick} onClose={() => setPick(false)} title="Choose image" wide>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {[...new Set(sceneImages)].map((id) => (
              <button key={id} onClick={() => { set({ assetId: id }); setPick(false); }} className="overflow-hidden rounded-lg border border-line">
                <AssetImage id={id} alt="" className="aspect-square w-full" />
              </button>
            ))}
          </div>
        </Sheet>
      </Card>
    );
  }

  if (selection.kind === 'audio') {
    const found = findAudio(timeline, selection.id);
    if (!found) return null;
    const { track, clip: a } = found;
    const set = (p: Partial<typeof a>) => onChange(patchAudio(timeline, track, a.id, p));
    return (
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">{track === 'narration' ? 'Narration' : track === 'music' ? 'Music' : 'Sound effect'} · {a.label}</div>
          <Button size="sm" icon={<Play className="size-4" />} onClick={() => onPreview(a.start)}>Preview</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Num label="Start (s)" value={a.start} onChange={(v) => set({ start: v })} />
          <Num label="Trim start (s)" value={a.offset} onChange={(v) => set({ offset: v })} />
          <Num label="Length (s)" value={a.duration} onChange={(v) => set({ duration: Math.max(0.05, v) })} min={0.05} />
          <Slider label="Volume" value={a.volume} min={0} max={2} step={0.05} onChange={(v) => set({ volume: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Fade in" value={a.fadeIn} min={0} max={5} step={0.1} onChange={(v) => set({ fadeIn: v })} format={(v) => `${v.toFixed(1)} s`} />
          <Slider label="Fade out" value={a.fadeOut} min={0} max={5} step={0.1} onChange={(v) => set({ fadeOut: v })} format={(v) => `${v.toFixed(1)} s`} />
          {track === 'music' && <Toggle checked={!!a.loop} onChange={(v) => set({ loop: v })} label="Loop to fill length" />}
        </div>
        <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => { onChange(removeAudio(timeline, track, a.id)); onSelect(null); }}>Remove</Button>
      </Card>
    );
  }

  if (selection.kind === 'cue') {
    const c = timeline.captions.find((x) => x.id === selection.id);
    if (!c) return null;
    const set = (p: Partial<typeof c>) => onChange({ ...timeline, captions: timeline.captions.map((x) => (x.id === c.id ? { ...x, ...p, words: 'text' in p ? undefined : x.words } : x)).sort((a, b) => a.start - b.start), updatedAt: Date.now() });
    return (
      <Card className="space-y-3">
        <Field label="Subtitle text"><Input value={c.text} onChange={(e) => set({ text: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Num label="Start (s)" value={c.start} onChange={(v) => set({ start: Math.min(v, c.end - 0.1) })} />
          <Num label="End (s)" value={c.end} onChange={(v) => set({ end: Math.max(v, c.start + 0.1) })} />
        </div>
        <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => { onChange({ ...timeline, captions: timeline.captions.filter((x) => x.id !== c.id) }); onSelect(null); }}>Remove</Button>
      </Card>
    );
  }

  const o = timeline.overlays.find((x) => x.id === selection.id);
  if (!o) return null;
  const set = (p: Partial<typeof o>) => onChange({ ...timeline, overlays: timeline.overlays.map((x) => (x.id === o.id ? { ...x, ...p } : x)), updatedAt: Date.now() });
  return (
    <Card className="space-y-3">
      <Field label="Text"><Input value={o.text} onChange={(e) => set({ text: e.target.value })} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Num label="Start (s)" value={o.start} onChange={(v) => set({ start: Math.min(v, o.end - 0.2) })} />
        <Num label="End (s)" value={o.end} onChange={(v) => set({ end: Math.max(v, o.start + 0.2) })} />
        <Field label="Font"><Select value={o.font} onChange={(v) => set({ font: v })} options={FONTS} /></Field>
        <Field label="Color"><Input type="color" value={o.color} onChange={(e) => set({ color: e.target.value })} /></Field>
        <Slider label="Size" value={o.size} min={2} max={15} step={0.5} onChange={(v) => set({ size: v })} format={(v) => `${v}%`} />
        <Slider label="Horizontal position" value={o.x} min={0.1} max={0.9} step={0.01} onChange={(v) => set({ x: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Vertical position" value={o.y} min={0.05} max={0.95} step={0.01} onChange={(v) => set({ y: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <Toggle checked={!!o.background} onChange={(v) => set({ background: v ? 'rgba(0,0,0,0.6)' : '' })} label="Background box" />
      </div>
      <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => { onChange({ ...timeline, overlays: timeline.overlays.filter((x) => x.id !== o.id) }); onSelect(null); }}>Remove</Button>
    </Card>
  );
}
