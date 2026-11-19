'use client';
import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import { CheckSquare, Download, History, Pause, Play, RefreshCw, Square, Upload, Wand2, XCircle } from 'lucide-react';
import type { Project } from '@/types';
import { IMAGE_JOB_LABELS } from '@/config/states';
import { adapterInfo } from '@/config/providers';
import { AssetImage, useImageQueue } from '@/components/common';
import { Badge, Button, Card, EmptyState, ErrorNote, Field, InfoNote, Input, ProgressBar, Select, Slider, Toggle, cn, type Tone } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { useProviders } from '@/hooks/data';
import { imageQueue } from '@/services/image-providers/queue';
import { getAssetBlob, getAssetMeta, saveAsset } from '@/services/storage/assets';
import { imageDimensions } from '@/services/media/image';
import { downloadBlob, errorMessage, pad, slugify } from '@/utils';
import type { Updater } from './Workspace';

const TONE: Record<Project['scenes'][number]['imageStatus'], Tone> = { none: 'neutral', queued: 'info', generating: 'accent', done: 'success', failed: 'danger', interrupted: 'warning' };

export async function zipSceneImages(project: Project, ids?: Set<string>) {
  const zip = new JSZip();
  for (const s of project.scenes) {
    if (!s.imageAssetId || (ids && !ids.has(s.id))) continue;
    const blob = await getAssetBlob(s.imageAssetId);
    const meta = await getAssetMeta(s.imageAssetId);
    if (blob) zip.file(`scene_${pad(s.number)}.${meta?.name.split('.').pop() ?? 'png'}`, blob);
  }
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export function ImagesTab({ project, update }: { project: Project; update: Updater }) {
  const { toast } = useFeedback();
  const { data: providers } = useProviders();
  const queue = useImageQueue();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<string | null>(null);
  const imageProviders = (providers ?? []).filter((p) => p.kind === 'image' && p.enabled);
  const provider = imageProviders.find((p) => p.id === project.imageSettings.providerId) ?? imageProviders[0];
  const info = provider ? adapterInfo(provider.type) : undefined;
  const mine = queue.items.filter((i) => i.projectId === project.id);
  const active = mine.filter((i) => i.status === 'queued' || i.status === 'generating');
  const done = project.scenes.filter((s) => s.imageAssetId).length;
  const failed = project.scenes.filter((s) => s.imageStatus === 'failed' || s.imageStatus === 'interrupted');
  const lastError = useMemo(() => project.scenes.find((s) => s.imageError)?.imageError, [project.scenes]);

  const enqueue = (ids: string[]) => {
    if (!ids.length) return toast('Nothing to generate.', 'info');
    imageQueue.enqueue(project.id, ids, provider?.id).catch((e) => toast(errorMessage(e), 'error'));
  };
  const setImg = (patch: Partial<Project['imageSettings']>) => update((p) => void (p.imageSettings = { ...p.imageSettings, ...patch }));

  if (!project.scenes.length) return <EmptyState title="No scenes yet">Generate the script first; each scene gets its own image.</EmptyState>;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        {imageProviders.length === 0 ? (
          <ErrorNote>No image provider is connected. Add one in Settings → Providers (Pollinations works without a key). You can still upload your own images per scene.</ErrorNote>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Provider" hint={info?.quotaNote}>
              <Select value={provider?.id ?? ''} onChange={(v) => setImg({ providerId: v })} options={imageProviders.map((p) => ({ value: p.id, label: p.name }))} />
            </Field>
            <Field label="Quality / resolution">
              <Select value={project.imageSettings.quality} onChange={(v) => setImg({ quality: v })} options={[{ value: 'draft', label: 'Draft (fast, 1024 px)' }, { value: 'standard', label: 'Standard (1344 px)' }, { value: 'high', label: 'High (1536 px)' }]} />
            </Field>
            <Field label="Seed" hint={info?.supports?.seed ? 'Fixed seeds help keep a consistent look.' : 'This provider ignores seeds.'}>
              <div className="flex gap-2">
                <Select value={project.imageSettings.seedMode} onChange={(v) => setImg({ seedMode: v })} options={[{ value: 'fixed', label: 'Fixed base seed' }, { value: 'random', label: 'Random' }]} />
                {project.imageSettings.seedMode === 'fixed' && <Input type="number" value={project.imageSettings.baseSeed} onChange={(e) => setImg({ baseSeed: Number(e.target.value) || 0 })} />}
              </div>
            </Field>
            <div>
              <Toggle checked={project.imageSettings.useCharacterReference} onChange={(v) => setImg({ useCharacterReference: v })} label={`Use character reference images${info?.supports?.referenceImage ? '' : ' (not supported by this provider)'}`} />
              {project.imageSettings.useCharacterReference && info?.supports?.referenceImage && (
                <Slider label="Reference strength" value={project.imageSettings.referenceStrength} min={0.1} max={0.9} step={0.05} onChange={(v) => setImg({ referenceStrength: v })} format={(v) => `${Math.round(v * 100)}%`} />
              )}
            </div>
          </div>
        )}
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-semibold">
              {done}/{project.scenes.length} scenes have images
            </span>
            <span className="text-muted">
              {active.length ? `${active.length} in queue${queue.paused ? ' (paused)' : ''}` : 'Queue idle'}
              {queue.waitingUntil ? ' · rate limited, waiting…' : ''}
            </span>
          </div>
          <ProgressBar value={done / project.scenes.length} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!provider} icon={<Wand2 className="size-4" />} onClick={() => enqueue(project.scenes.filter((s) => !s.imageAssetId).map((s) => s.id))}>
            Generate missing ({project.scenes.length - done})
          </Button>
          <Button disabled={!provider || !sel.size} icon={<RefreshCw className="size-4" />} onClick={() => enqueue([...sel])}>
            Generate selected ({sel.size})
          </Button>
          <Button disabled={!provider || !failed.length} icon={<RefreshCw className="size-4" />} onClick={() => enqueue(failed.map((s) => s.id))}>
            Retry failed ({failed.length})
          </Button>
          {queue.paused ? (
            <Button icon={<Play className="size-4" />} onClick={() => imageQueue.resume()}>Resume</Button>
          ) : (
            <Button disabled={!active.length} icon={<Pause className="size-4" />} onClick={() => imageQueue.pause()}>Pause</Button>
          )}
          <Button variant="danger" disabled={!active.length} icon={<XCircle className="size-4" />} onClick={() => imageQueue.cancel(project.id)}>
            Cancel
          </Button>
        </div>
        {lastError && <div className="text-xs text-danger">Last provider error: {lastError}</div>}
        {project.scenes.some((s) => s.imageStatus === 'interrupted') && <InfoNote tone="warning">Some images were interrupted when the app closed. They are not resumed automatically — press “Retry failed”.</InfoNote>}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" icon={<CheckSquare className="size-4" />} onClick={() => setSel(sel.size === project.scenes.length ? new Set() : new Set(project.scenes.map((s) => s.id)))}>
          {sel.size === project.scenes.length ? 'Select none' : 'Select all'}
        </Button>
        <Button size="sm" icon={<Download className="size-4" />} disabled={!done} onClick={async () => downloadBlob(await zipSceneImages(project), `${slugify(project.title)}_images.zip`)}>
          All images (ZIP)
        </Button>
        <Button size="sm" icon={<Download className="size-4" />} disabled={!sel.size} onClick={async () => downloadBlob(await zipSceneImages(project, sel), `${slugify(project.title)}_selected.zip`)}>
          Selected (ZIP)
        </Button>
      </div>

      <div className={cn('grid gap-3', project.brief.aspect === '9:16' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
        {project.scenes.map((s) => {
          const selected = sel.has(s.id);
          return (
            <Card key={s.id} className={cn('overflow-hidden p-0', selected && 'ring-2 ring-accent')}>
              <button
                className={cn('relative block w-full', project.brief.aspect === '9:16' ? 'aspect-[9/16]' : project.brief.aspect === '1:1' ? 'aspect-square' : 'aspect-video')}
                onClick={() => {
                  const n = new Set(sel);
                  if (selected) n.delete(s.id);
                  else n.add(s.id);
                  setSel(n);
                }}
                aria-label={`Select scene ${s.number}`}
              >
                <AssetImage id={s.imageAssetId} alt={`Scene ${s.number}`} className={cn('size-full', s.imageStatus === 'generating' && 'opacity-50')} />
                {s.imageStatus === 'generating' && <div className="skeleton absolute inset-0 opacity-40" />}
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">scene_{pad(s.number)}</span>
                <span className="absolute right-2 top-2">{selected ? <CheckSquare className="size-5 text-accent" /> : <Square className="size-5 text-white/70" />}</span>
              </button>
              <div className="space-y-2 p-2.5">
                <div className="flex items-center justify-between gap-1">
                  <Badge tone={TONE[s.imageStatus]}>{IMAGE_JOB_LABELS[s.imageStatus]}</Badge>
                  <div className="flex">
                    {s.imageHistory.length > 0 && (
                      <Button size="sm" variant="ghost" aria-label="Previous versions" onClick={() => setHistory(history === s.id ? null : s.id)}>
                        <History className="size-4" />
                      </Button>
                    )}
                    <label className="inline-flex h-9 cursor-pointer items-center rounded-lg px-2 hover:bg-surface-2" aria-label="Upload image">
                      <Upload className="size-4" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const meta = await saveAsset({ projectId: project.id, kind: 'scene-image', name: `scene_${pad(s.number)}.${f.name.split('.').pop()}`, blob: f, ...(await imageDimensions(f)), source: 'upload' });
                          await update((p) => {
                            const x = p.scenes.find((y) => y.id === s.id)!;
                            if (x.imageAssetId) x.imageHistory = [x.imageAssetId, ...x.imageHistory].slice(0, 12);
                            x.imageAssetId = meta.id;
                            x.imageStatus = 'done';
                            x.imageError = undefined;
                          });
                        }}
                      />
                    </label>
                    {s.imageAssetId && (
                      <Button size="sm" variant="ghost" aria-label="Download" onClick={async () => {
                        const b = await getAssetBlob(s.imageAssetId!);
                        if (b) downloadBlob(b, `scene_${pad(s.number)}.${b.type === 'image/png' ? 'png' : 'jpg'}`);
                      }}>
                        <Download className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {s.imageError && s.imageStatus === 'failed' && <p className="line-clamp-3 text-[11px] text-danger">{s.imageError}</p>}
                {history === s.id && (
                  <div className="flex gap-1.5 overflow-x-auto">
                    {s.imageHistory.map((h) => (
                      <button
                        key={h}
                        className="size-14 shrink-0 overflow-hidden rounded-lg border border-line"
                        onClick={() =>
                          update((p) => {
                            const x = p.scenes.find((y) => y.id === s.id)!;
                            const cur = x.imageAssetId;
                            x.imageAssetId = h;
                            x.imageHistory = [...(cur ? [cur] : []), ...x.imageHistory.filter((y) => y !== h)];
                            x.imageStatus = 'done';
                          })
                        }
                      >
                        <AssetImage id={h} alt="Previous version" className="size-full" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
