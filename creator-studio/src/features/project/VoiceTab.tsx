'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, Mic, Square, Upload, Wand2, Volume2 } from 'lucide-react';
import type { Project } from '@/types';
import { GEMINI_VOICES, adapterInfo } from '@/config/providers';
import { Badge, Button, Card, ErrorNote, Field, InfoNote, Input, ProgressBar, SectionTitle, Select, Slider } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { useAssetUrl, useProviders } from '@/hooks/data';
import { generateVoice, listVoices } from '@/services/ai/client';
import { resolveProvider } from '@/services/ai/pipeline';
import { attachFullNarration, attachSceneAudio, generateAllVoices, generateSceneVoice } from '@/services/voice-providers/voice';
import { startRecording } from '@/services/media/audio';
import { getAssetBlob } from '@/services/storage/assets';
import { downloadBlob, errorMessage, pad } from '@/utils';
import type { Updater } from './Workspace';

export function AudioPlayer({ id }: { id?: string }) {
  const url = useAssetUrl(id);
  if (!url) return null;
  return <audio controls src={url} className="h-10 w-full" preload="metadata" />;
}

export function Recorder({ onDone }: { onDone: (b: Blob) => Promise<void> | void }) {
  const [rec, setRec] = useState<Awaited<ReturnType<typeof startRecording>> | null>(null);
  const [secs, setSecs] = useState(0);
  const { toast } = useFeedback();
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  return rec ? (
    <Button
      size="sm"
      variant="danger"
      icon={<Square className="size-4" />}
      onClick={async () => {
        clearInterval(timer.current);
        const b = await rec.stop();
        setRec(null);
        await onDone(b);
      }}
    >
      Stop {secs}s
    </Button>
  ) : (
    <Button
      size="sm"
      icon={<Mic className="size-4" />}
      onClick={async () => {
        try {
          const r = await startRecording();
          setSecs(0);
          timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
          setRec(r);
        } catch (e) {
          toast(errorMessage(e), 'error');
        }
      }}
    >
      Record
    </Button>
  );
}

export function VoiceTab({ project, update }: { project: Project; update: Updater }) {
  const { toast } = useFeedback();
  const { data: providers } = useProviders();
  const voiceProviders = (providers ?? []).filter((p) => p.kind === 'voice' && p.enabled);
  const provider = voiceProviders.find((p) => p.id === project.voice.providerId) ?? voiceProviders[0];
  const info = provider ? adapterInfo(provider.type) : undefined;
  const [voices, setVoices] = useState<{ id: string; name: string; info?: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setVoices([]);
    if (!provider) return;
    if (provider.type === 'gemini-tts') setVoices(GEMINI_VOICES.map((v) => ({ id: v, name: v })));
    else listVoices(provider).then(setVoices).catch(() => setVoices([]));
  }, [provider]);

  const setVoice = (patch: Partial<Project['voice']>) => update((p) => void (p.voice = { ...p.voice, ...patch }));
  const withAudio = project.scenes.filter((s) => s.audioAssetId).length;
  const fullText = project.scenes.map((s) => s.narration).join('\n\n');

  const all = async (onlyMissing: boolean) => {
    abortRef.current = new AbortController();
    setBusy('all');
    setProgress({ done: 0, total: project.scenes.length });
    try {
      const r = await generateAllVoices(project.id, { onlyMissing, signal: abortRef.current.signal, onProgress: (done, total) => setProgress({ done, total }) });
      toast(r.errors.length ? `${r.done} generated, ${r.errors.length} failed: ${r.errors[0]}` : `${r.done} scene narrations generated`, r.errors.length ? 'warning' : 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        {voiceProviders.length === 0 ? (
          <ErrorNote>No voice provider is connected. Connect one in Settings → Providers (Gemini TTS and ElevenLabs have free tiers), or upload / record your own narration below.</ErrorNote>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Voice provider" hint={info?.quotaNote}>
              <Select value={provider?.id ?? ''} onChange={(v) => setVoice({ providerId: v, voiceId: undefined })} options={voiceProviders.map((p) => ({ value: p.id, label: p.name }))} />
            </Field>
            <Field label="Narrator voice">
              {voices.length ? (
                <Select value={project.voice.voiceId ?? ''} onChange={(v) => setVoice({ voiceId: v })} options={[{ value: '', label: 'Default voice' }, ...voices.map((v) => ({ value: v.id, label: v.info ? `${v.name} — ${v.info}` : v.name }))]} />
              ) : (
                <Input value={project.voice.voiceId ?? ''} placeholder="Voice id" onChange={(e) => setVoice({ voiceId: e.target.value })} />
              )}
            </Field>
            <Slider label="Speed" value={project.voice.speed} min={0.7} max={1.3} step={0.05} onChange={(v) => setVoice({ speed: v })} format={(v) => `${v.toFixed(2)}×${info?.supports?.speed ? '' : ' (not sent: unsupported)'}`} />
            <div className="text-sm text-muted">Pitch: not supported by the connected providers — choose a different voice instead.</div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!provider || !!busy} loading={busy === 'all'} icon={<Wand2 className="size-4" />} onClick={() => all(true)}>
            Generate missing ({project.scenes.length - withAudio})
          </Button>
          <Button disabled={!provider || !!busy} onClick={() => all(false)}>Regenerate all scenes</Button>
          {busy === 'all' && <Button variant="danger" onClick={() => abortRef.current?.abort()}>Stop</Button>}
        </div>
        {progress && <ProgressBar value={progress.done / Math.max(1, progress.total)} />}
        <p className="text-xs text-muted">Scene-by-scene narration gives exact picture/voice sync. {withAudio}/{project.scenes.length} scenes have narration.</p>
      </Card>

      <SectionTitle>Single narration file (alternative)</SectionTitle>
      <Card className="space-y-3">
        <p className="text-sm text-muted">Use one file for the whole video (your own recording or one TTS request). Scene cuts are then placed by word count — check them in the editor.</p>
        <AudioPlayer id={project.voice.fullAssetId} />
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 text-sm font-medium">
            <Upload className="size-4" /> Upload narration
            <input type="file" accept="audio/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                await attachFullNarration(project.id, f, 'upload');
                toast('Narration added', 'success');
              } catch (err) {
                toast(errorMessage(err), 'error');
              }
            }} />
          </label>
          <Recorder onDone={async (b) => {
            await attachFullNarration(project.id, b, 'recording');
            toast('Recording saved', 'success');
          }} />
          <Button
            size="sm"
            disabled={!provider || !!busy || fullText.length > 5000 || !fullText}
            loading={busy === 'full'}
            icon={<Wand2 className="size-4" />}
            onClick={async () => {
              setBusy('full');
              try {
                const p = await resolveProvider('voice', project.voice.providerId);
                if (!p) throw new Error('No voice provider');
                const blob = await generateVoice(p, { text: fullText, voiceId: project.voice.voiceId, speed: project.voice.speed });
                await attachFullNarration(project.id, blob, p.name);
                toast('Full narration generated', 'success');
              } catch (e) {
                toast(errorMessage(e), 'error');
              } finally {
                setBusy(null);
              }
            }}
          >
            Generate full narration {fullText.length > 5000 ? '(too long — use scenes)' : ''}
          </Button>
          {project.voice.fullAssetId && <Button size="sm" variant="ghost" onClick={() => setVoice({ fullAssetId: undefined })}>Detach</Button>}
        </div>
      </Card>

      <SectionTitle>Scene narration</SectionTitle>
      {!project.scenes.length && <InfoNote>Generate the script first.</InfoNote>}
      <div className="space-y-2">
        {project.scenes.map((s) => (
          <Card key={s.id} className="space-y-2 p-3">
            <div className="flex items-center gap-2">
              <Badge tone="accent">#{s.number}</Badge>
              {s.audioDuration ? <Badge tone="success">{s.audioDuration.toFixed(1)} s</Badge> : <Badge>no audio</Badge>}
              <p className="line-clamp-1 flex-1 text-xs text-muted">{s.narration}</p>
            </div>
            <AudioPlayer id={s.audioAssetId} />
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" disabled={!provider || !!busy} loading={busy === s.id} icon={<Volume2 className="size-4" />} onClick={async () => {
                setBusy(s.id);
                try {
                  await generateSceneVoice(project.id, s.id);
                } catch (e) {
                  toast(errorMessage(e), 'error');
                } finally {
                  setBusy(null);
                }
              }}>
                {s.audioAssetId ? 'Regenerate' : 'Generate'}
              </Button>
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 text-sm font-medium">
                <Upload className="size-4" /> Upload
                <input type="file" accept="audio/*" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) await attachSceneAudio(project.id, s.id, f, 'upload').catch((err) => toast(errorMessage(err), 'error'));
                }} />
              </label>
              <Recorder onDone={(b) => attachSceneAudio(project.id, s.id, b, 'recording').then(() => undefined)} />
              {s.audioAssetId && (
                <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={async () => {
                  const b = await getAssetBlob(s.audioAssetId!);
                  if (b) downloadBlob(b, `narration_scene_${pad(s.number)}.${b.type.includes('wav') ? 'wav' : b.type.includes('mp4') ? 'm4a' : 'mp3'}`);
                }}>
                  Download
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
