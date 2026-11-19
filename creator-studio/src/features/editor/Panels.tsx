'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Music, Plus, RefreshCw, Rocket, Square, Upload, XCircle } from 'lucide-react';
import type { CaptionStyle, MusicMood, Project, RenderSettings, SfxKind, Timeline, TransitionType } from '@/types';
import {
  CAPTION_ANIMATIONS,
  CAPTION_ANIMATION_LABELS,
  CAPTION_POSITIONS,
  CAPTION_POSITION_LABELS,
  MUSIC_MOODS,
  MUSIC_MOOD_LABELS,
  RENDER_ENGINES,
  RENDER_ENGINE_LABELS,
  RENDER_RESOLUTIONS,
  RENDER_STATUS_LABELS,
  RESOLUTION_LABELS,
  SFX_KINDS,
  SFX_LABELS,
  TRANSITION_LABELS,
  TRANSITION_TYPES,
} from '@/config/states';
import { Badge, Button, Card, Field, InfoNote, Input, ProgressBar, SectionTitle, Select, Slider, Toggle } from '@/components/ui';
import { useActiveRender } from '@/components/common';
import { useFeedback } from '@/components/feedback';
import { useAssetUrl, useSettings } from '@/hooks/data';
import { ensureMusicLoop, ensureSfx } from '@/services/media/library';
import { audioDuration } from '@/services/media/audio';
import { saveAsset } from '@/services/storage/assets';
import { rebuildCaptions } from '@/services/timeline/autoEdit';
import { runQualityChecks, type QcIssue } from '@/services/timeline/qc';
import { timelineDuration } from '@/services/timeline/math';
import { parseSrtOrVtt, toSrt, toVtt } from '@/services/export/subtitles';
import { cancelRender, chooseEngine, renderProject } from '@/services/rendering/renderManager';
import { webCodecsSupport } from '@/services/rendering/webcodecs';
import { getAssetBlob } from '@/services/storage/assets';
import { aspectSize, downloadBlob, downloadText, errorMessage, formatTime, isAbort, round, slugify, uid } from '@/utils';
import { FONTS } from './Inspector';

type Change = (t: Timeline) => void;

export function CaptionsPanel({ project, timeline, onChange }: { project: Project; timeline: Timeline; onChange: Change }) {
  const s = timeline.captionStyle;
  const set = (p: Partial<CaptionStyle>) => onChange({ ...timeline, captionStyle: { ...s, ...p }, updatedAt: Date.now() });
  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <Toggle checked={s.enabled} onChange={(v) => set({ enabled: v })} label="Burn subtitles into the video" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Font"><Select value={s.font} onChange={(v) => set({ font: v })} options={FONTS} /></Field>
          <Field label="Position"><Select value={s.position} onChange={(v) => set({ position: v })} options={CAPTION_POSITIONS.map((p) => ({ value: p, label: CAPTION_POSITION_LABELS[p] }))} /></Field>
          <Slider label="Size" value={s.size} min={2.5} max={10} step={0.1} onChange={(v) => set({ size: v })} format={(v) => `${v.toFixed(1)}%`} />
          <Slider label="Distance from edge" value={s.offset} min={2} max={40} step={0.5} onChange={(v) => set({ offset: v })} format={(v) => `${v}%`} />
          <Field label="Text color"><Input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} /></Field>
          <Field label="Highlight color"><Input type="color" value={s.highlightColor} onChange={(e) => set({ highlightColor: e.target.value })} /></Field>
          <Field label="Outline color"><Input type="color" value={s.outlineColor} onChange={(e) => set({ outlineColor: e.target.value })} /></Field>
          <Slider label="Outline width" value={s.outlineWidth} min={0} max={16} step={1} onChange={(v) => set({ outlineWidth: v })} />
          <Field label="Animation"><Select value={s.animation} onChange={(v) => set({ animation: v })} options={CAPTION_ANIMATIONS.map((a) => ({ value: a, label: CAPTION_ANIMATION_LABELS[a] }))} /></Field>
          <Slider label="Max words per subtitle" value={s.maxWords} min={1} max={12} step={1} onChange={(v) => set({ maxWords: v })} />
          <Toggle checked={s.wordHighlight} onChange={(v) => set({ wordHighlight: v })} label="Word highlighting (estimated timing)" />
          <Toggle checked={s.uppercase} onChange={(v) => set({ uppercase: v })} label="UPPERCASE" />
          <Toggle checked={s.background} onChange={(v) => set({ background: v })} label="Background box" />
          {s.background && <Slider label="Box opacity" value={s.backgroundOpacity} min={0.1} max={1} step={0.05} onChange={(v) => set({ backgroundOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} />}
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<RefreshCw className="size-4" />} onClick={() => onChange(rebuildCaptions(project, timeline))}>Rebuild from narration</Button>
        <Button size="sm" icon={<Download className="size-4" />} disabled={!timeline.captions.length} onClick={() => downloadText(toSrt(timeline.captions), `${slugify(project.title)}.srt`)}>SRT</Button>
        <Button size="sm" icon={<Download className="size-4" />} disabled={!timeline.captions.length} onClick={() => downloadText(toVtt(timeline.captions), `${slugify(project.title)}.vtt`, 'text/vtt')}>VTT</Button>
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 text-sm font-medium">
          <Upload className="size-4" /> Import SRT/VTT
          <input type="file" accept=".srt,.vtt,text/vtt" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onChange({ ...timeline, captions: parseSrtOrVtt(await f.text()), updatedAt: Date.now() });
          }} />
        </label>
      </div>
      <p className="text-xs text-muted">Subtitle timing follows each narration clip; word timing inside a subtitle is estimated from word length. Fine-tune any cue by tapping it in the Subs track.</p>
    </div>
  );
}

export function AudioPanel({ project, timeline, onChange, time }: { project: Project; timeline: Timeline; onChange: Change; time: number }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const mix = timeline.mix;
  const setMix = (p: Partial<Timeline['mix']>) => onChange({ ...timeline, mix: { ...mix, ...p }, updatedAt: Date.now() });
  const total = timelineDuration(timeline);
  const [mood, setMood] = useState<MusicMood>(project.music.mood);
  const [sfx, setSfx] = useState<SfxKind>('whoosh');

  const setMusic = async (assetId: string, label: string, dur: number) => {
    onChange({ ...timeline, music: [{ id: uid('m'), assetId, label, start: 0, offset: 0, duration: round(total, 3), volume: 1, fadeIn: mix.musicFadeIn, fadeOut: mix.musicFadeOut, loop: dur < total }], updatedAt: Date.now() });
  };

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="font-bold">Mix</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Slider label="Narration" value={mix.narration} min={0} max={2} step={0.05} onChange={(v) => setMix({ narration: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Music" value={mix.music} min={0} max={1.5} step={0.05} onChange={(v) => setMix({ music: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Sound effects" value={mix.sfx} min={0} max={2} step={0.05} onChange={(v) => setMix({ sfx: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Music level under voice (ducking)" value={mix.duckLevel} min={0.05} max={1} step={0.05} onChange={(v) => setMix({ duckLevel: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Toggle checked={mix.ducking} onChange={(v) => setMix({ ducking: v })} label="Duck music under narration" />
          <Toggle checked={mix.normalize} onChange={(v) => setMix({ normalize: v })} label="Normalize loudness" />
        </div>
      </Card>
      <Card className="space-y-3">
        <div className="font-bold">Background music</div>
        <InfoNote>Use only music you own, licensed or public-domain tracks — or the original music synthesized in this app (free to use). Nothing is downloaded from other sites.</InfoNote>
        <div className="flex flex-wrap gap-2">
          <Select value={mood} onChange={setMood} options={MUSIC_MOODS.map((m) => ({ value: m, label: MUSIC_MOOD_LABELS[m] }))} className="!w-auto" />
          <Button size="sm" className="h-11" loading={busy} icon={<Music className="size-4" />} onClick={async () => {
            setBusy(true);
            try {
              const a = await ensureMusicLoop(mood);
              await setMusic(a.id, a.name, a.duration ?? 0);
            } catch (e) {
              toast(errorMessage(e), 'error');
            } finally {
              setBusy(false);
            }
          }}>
            Use synthesized {MUSIC_MOOD_LABELS[mood]}
          </Button>
          <label className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 text-sm font-medium">
            <Upload className="size-4" /> Upload my track
            <input type="file" accept="audio/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const d = await audioDuration(f);
                const a = await saveAsset({ projectId: project.id, kind: 'music', name: f.name, blob: f, duration: d, source: 'upload', license: 'Uploaded by the user — make sure you hold the rights.' });
                await setMusic(a.id, f.name, d);
              } catch (err) {
                toast(errorMessage(err), 'error');
              }
            }} />
          </label>
          {timeline.music.length > 0 && <Button size="sm" variant="ghost" className="h-11" onClick={() => onChange({ ...timeline, music: [] })}>Remove music</Button>}
        </div>
      </Card>
      <Card className="space-y-3">
        <div className="font-bold">Sound effects</div>
        <div className="flex flex-wrap gap-2">
          <Select value={sfx} onChange={setSfx} options={SFX_KINDS.map((k) => ({ value: k, label: SFX_LABELS[k] }))} className="!w-auto" />
          <Button size="sm" className="h-11" icon={<Plus className="size-4" />} onClick={async () => {
            const a = await ensureSfx(sfx);
            onChange({ ...timeline, sfx: [...timeline.sfx, { id: uid('x'), assetId: a.id, label: sfx, start: round(time, 2), offset: 0, duration: a.duration ?? 1, volume: 1, fadeIn: 0, fadeOut: 0.2 }], updatedAt: Date.now() });
          }}>
            Add at {formatTime(time, true)}
          </Button>
          <label className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 text-sm font-medium">
            <Upload className="size-4" /> Upload SFX / ambience
            <input type="file" accept="audio/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const d = await audioDuration(f);
              const a = await saveAsset({ projectId: project.id, kind: 'sfx', name: f.name, blob: f, duration: d, source: 'upload' });
              onChange({ ...timeline, sfx: [...timeline.sfx, { id: uid('x'), assetId: a.id, label: f.name, start: round(time, 2), offset: 0, duration: d, volume: 1, fadeIn: 0, fadeOut: 0.2 }], updatedAt: Date.now() });
            }} />
          </label>
        </div>
      </Card>
    </div>
  );
}

export function TextPanel({ timeline, onChange, time }: { timeline: Timeline; onChange: Change; time: number }) {
  const [preset, setPreset] = useState<TransitionType>('dissolve');
  const [len, setLen] = useState(0.6);
  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="font-bold">Text & graphics</div>
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => onChange({ ...timeline, overlays: [...timeline.overlays, { id: uid('o'), text: 'Your text', start: round(time, 2), end: round(time + 3, 2), font: 'Anton', size: 7, color: '#FFFFFF', x: 0.5, y: 0.2, background: '' }], updatedAt: Date.now() })}>
          Add text at {formatTime(time, true)}
        </Button>
      </Card>
      <Card className="space-y-3">
        <div className="font-bold">Global transition preset</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Transition"><Select value={preset} onChange={setPreset} options={TRANSITION_TYPES.map((t) => ({ value: t, label: TRANSITION_LABELS[t] }))} /></Field>
          <Slider label="Length" value={len} min={0.2} max={2} step={0.05} onChange={setLen} format={(v) => `${v.toFixed(2)} s`} />
        </div>
        <Button size="sm" onClick={() => onChange({ ...timeline, clips: timeline.clips.map((c, i) => (i === 0 ? c : { ...c, transition: preset, transitionDuration: preset === 'cut' ? 0 : len })), updatedAt: Date.now() })}>
          Apply to all clips
        </Button>
      </Card>
    </div>
  );
}

const QC_ICON = { ok: CheckCircle2, warning: AlertTriangle, error: XCircle };

export function RenderPanel({ project, timeline, onSettings }: { project: Project; timeline: Timeline; onSettings: (s: Partial<RenderSettings>) => void }) {
  const { toast } = useFeedback();
  const { settings } = useSettings();
  const render = useActiveRender();
  const mine = render?.projectId === project.id ? render : null;
  const [qc, setQc] = useState<QcIssue[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [engineInfo, setEngineInfo] = useState('');
  const [wc, setWc] = useState<{ video: boolean; audio: boolean } | null>(null);
  const videoUrl = useAssetUrl(project.finalVideoAssetId);
  const r = project.render;
  const { width, height } = aspectSize(timeline.aspect, r.resolution);

  useEffect(() => {
    chooseEngine(timeline, r).then((e) => setEngineInfo(`${RENDER_ENGINE_LABELS[e.engine].title} — ${e.reason}`)).catch(() => {});
    webCodecsSupport(timeline.aspect, r.resolution).then(setWc).catch(() => setWc(null));
  }, [timeline, r, settings?.cloudWorkerUrl]);

  const check = async () => {
    setChecking(true);
    try {
      setQc(await runQualityChecks(project, timeline));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setChecking(false);
    }
  };

  const start = async () => {
    try {
      await renderProject(project.id);
      toast('Your MP4 is ready!', 'success');
    } catch (e) {
      if (!isAbort(e)) toast(errorMessage(e), 'error');
    }
  };

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Resolution" hint={`${width}×${height} · MP4 (H.264 + AAC)`}>
            <Select value={r.resolution} onChange={(v) => onSettings({ resolution: v })} options={RENDER_RESOLUTIONS.map((x) => ({ value: x, label: RESOLUTION_LABELS[x] }))} />
          </Field>
          <Field label="Rendering engine" hint={engineInfo}>
            <Select value={r.engine} onChange={(v) => onSettings({ engine: v })} options={RENDER_ENGINES.map((e) => ({ value: e, label: RENDER_ENGINE_LABELS[e].title }))} />
          </Field>
          <Field label="Frame rate">
            <Select value={String(r.fps) as '24' | '30' | '60'} onChange={(v) => onSettings({ fps: Number(v) })} options={[{ value: '24', label: '24 fps (film)' }, { value: '30', label: '30 fps' }, { value: '60', label: '60 fps (heavy)' }]} />
          </Field>
          <Field label="Video bitrate">
            <Select value={String(r.videoBitrate)} onChange={(v) => onSettings({ videoBitrate: Number(v) })} options={[{ value: '0', label: 'Automatic (high quality)' }, { value: '4000000', label: '4 Mbps (small)' }, { value: '8000000', label: '8 Mbps' }, { value: '16000000', label: '16 Mbps' }, { value: '40000000', label: '40 Mbps (4K)' }]} />
          </Field>
        </div>
        <p className="text-xs text-muted">
          {RENDER_ENGINE_LABELS[r.engine].description} On-device encoder here: {wc ? (wc.video ? `H.264 yes, AAC ${wc.audio ? 'yes' : 'no (FFmpeg.wasm adds audio)'}` : 'not available') : 'checking…'}.
          {r.resolution === '2160p' && ' 4K needs the cloud worker unless this device can encode 4K.'}
        </p>
      </Card>

      <SectionTitle action={<Button size="sm" loading={checking} onClick={check}>Run checks</Button>}>Quality control</SectionTitle>
      {qc ? (
        <div className="space-y-1.5">
          {qc.map((q, i) => {
            const Icon = QC_ICON[q.level];
            return (
              <Card key={i} className="flex gap-2.5 p-3 text-sm">
                <Icon className={`mt-0.5 size-4 shrink-0 ${q.level === 'ok' ? 'text-success' : q.level === 'warning' ? 'text-warning' : 'text-danger'}`} />
                <div>
                  <b>{q.check}:</b> {q.message}
                  {q.fix && q.level !== 'ok' && <div className="text-xs text-muted">→ {q.fix}</div>}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">Check for missing images/audio, timing, black frames, subtitle sync, clipping, aspect ratio and export support before rendering.</p>
      )}

      <SectionTitle>Render</SectionTitle>
      {mine ? (
        <Card className="glow space-y-2">
          <div className="flex items-center justify-between">
            <Badge tone="info">{RENDER_STATUS_LABELS[mine.status]}</Badge>
            <Button size="sm" variant="danger" icon={<Square className="size-4" />} onClick={cancelRender}>Cancel</Button>
          </div>
          <ProgressBar value={mine.ratio} indeterminate={mine.ratio === undefined} />
          <div className="text-sm text-muted">
            {mine.detail}
            {mine.ratio !== undefined && ` · ${Math.round(mine.ratio * 100)}%`}
          </div>
          <p className="text-xs text-muted">Keep this screen open and the phone awake — iOS pauses web apps in the background.</p>
        </Card>
      ) : (
        <Button variant="primary" size="lg" className="w-full" disabled={!!render} icon={<Rocket className="size-5" />} onClick={start}>
          Render MP4 ({formatTime(timelineDuration(timeline))})
        </Button>
      )}
      {project.finalVideoAssetId && videoUrl && !mine && (
        <Card className="space-y-2">
          <video src={videoUrl} controls playsInline className="mx-auto max-h-[60dvh] rounded-xl bg-black" />
          <Button className="w-full" icon={<Download className="size-4" />} onClick={async () => {
            const b = await getAssetBlob(project.finalVideoAssetId!);
            if (b) downloadBlob(b, `${slugify(project.title)}_final.mp4`);
          }}>
            Download MP4
          </Button>
        </Card>
      )}
    </div>
  );
}
