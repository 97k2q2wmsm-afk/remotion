'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Heart, ImageIcon, ImagePlus, Wand2, X } from 'lucide-react';
import type { AssetMeta, VisualStyle } from '@/types';
import { VISUAL_STYLES, VISUAL_STYLE_LABELS, VISUAL_STYLE_PROMPTS } from '@/config/states';
import { adapterInfo } from '@/config/providers';
import { AssetImage } from '@/components/common';
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, PageHeader, ProgressBar, SectionTitle, Select, Sheet, Textarea, Toggle } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { useLive, useProjects, useProviders, useSettings } from '@/hooks/data';
import { generateImage } from '@/services/ai/client';
import { approvePaid } from '@/services/ai/approval';
import { getAssetBlob, listAssets, saveAsset, updateAssetMeta } from '@/services/storage/assets';
import { updateProject } from '@/services/storage/projects';
import { generationSize, imageDimensions, resizeImage } from '@/services/media/image';
import { downloadBlob, errorMessage, isAbort, pad } from '@/utils';

type Aspect = '16:9' | '9:16' | '1:1' | 'custom';

function Studio() {
  const q = useSearchParams();
  const { toast } = useFeedback();
  const { data: providers } = useProviders();
  const { data: projects } = useProjects();
  const { settings } = useSettings();
  const imageProviders = (providers ?? []).filter((p) => p.kind === 'image' && p.enabled);
  const [providerId, setProviderId] = useState('');
  const provider = imageProviders.find((p) => p.id === providerId) ?? imageProviders.find((p) => p.id === settings?.preferredImage) ?? imageProviders[0];
  const info = provider ? adapterInfo(provider.type) : undefined;
  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [style, setStyle] = useState<VisualStyle>('cinematic');
  const [applyStyle, setApplyStyle] = useState(true);
  const [aspect, setAspect] = useState<Aspect>('16:9');
  const [custom, setCustom] = useState({ w: 1024, h: 768 });
  const [quality, setQuality] = useState<'draft' | 'standard' | 'high'>('standard');
  const [count, setCount] = useState(1);
  const [seed, setSeed] = useState('');
  const [ref, setRef] = useState<Blob | null>(null);
  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(q.get('project') ?? '');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ctrl, setCtrl] = useState<AbortController | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [assign, setAssign] = useState<AssetMeta | null>(null);
  const { data: library } = useLive(async () => (await listAssets()).filter((a) => a.mime.startsWith('image/') && (a.kind === 'scene-image' || a.kind === 'other' || a.kind === 'thumb-source')), [], ['assets']);

  useEffect(() => () => {
    if (refUrl) URL.revokeObjectURL(refUrl);
  }, [refUrl]);

  const run = async () => {
    if (!provider) return;
    if (prompt.trim().length < 3) return toast('Write a prompt first.', 'warning');
    const c = new AbortController();
    setCtrl(c);
    setError(null);
    setProgress({ done: 0, total: count });
    try {
      await approvePaid(provider, `Generate ${count} image${count > 1 ? 's' : ''}`, count);
      const size = generationSize(aspect, quality, custom);
      const sp = VISUAL_STYLE_PROMPTS[style];
      for (let i = 0; i < count; i++) {
        const blob = await generateImage(provider, {
          prompt: applyStyle ? `${prompt}. ${sp.positive}` : prompt,
          negativePrompt: [negative, applyStyle ? sp.negative : ''].filter(Boolean).join(', ') || undefined,
          width: size.width,
          height: size.height,
          seed: seed ? Number(seed) + i : undefined,
          referenceImage: ref ?? undefined,
          signal: c.signal,
        });
        const dims = await imageDimensions(blob);
        await saveAsset({ projectId: projectId || undefined, kind: 'other', name: `image_${Date.now()}.${blob.type === 'image/png' ? 'png' : 'jpg'}`, blob, ...dims, prompt, providerId: provider.id, source: provider.name });
        setProgress({ done: i + 1, total: count });
      }
      toast(`${count} image${count > 1 ? 's' : ''} generated`, 'success');
    } catch (e) {
      if (!isAbort(e)) setError(errorMessage(e));
    } finally {
      setProgress(null);
      setCtrl(null);
    }
  };

  const shown = (library ?? []).filter((a) => !favOnly || a.favorite);
  const assignProject = projects?.find((p) => p.id === projectId);

  return (
    <div className="space-y-4">
      {imageProviders.length === 0 && <ErrorNote>No image provider is connected. Add one in Settings → AI providers. No placeholder images are ever shown as generated results.</ErrorNote>}
      <Card className="space-y-3">
        <Field label="Prompt"><Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A lone astronaut on a red desert at golden hour, wide shot" /></Field>
        <Field label="Negative prompt" hint={info && !info.supports?.negativePrompt ? 'This provider ignores negative prompts.' : undefined}>
          <Input value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="blurry, text, watermark" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Provider" hint={info?.quotaNote}>
            <Select value={provider?.id ?? ''} onChange={setProviderId} options={imageProviders.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="Style">
            <Select value={style} onChange={setStyle} options={VISUAL_STYLES.map((s) => ({ value: s, label: VISUAL_STYLE_LABELS[s] }))} />
          </Field>
          <Field label="Aspect ratio">
            <Select<Aspect> value={aspect} onChange={setAspect} options={[{ value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }, { value: 'custom', label: 'Custom' }]} />
          </Field>
          {aspect === 'custom' ? (
            <Field label="Custom size (px, max 2048)">
              <div className="flex gap-2">
                <Input type="number" value={custom.w} onChange={(e) => setCustom({ ...custom, w: Math.min(2048, Math.max(256, Number(e.target.value) || 256)) })} />
                <Input type="number" value={custom.h} onChange={(e) => setCustom({ ...custom, h: Math.min(2048, Math.max(256, Number(e.target.value) || 256)) })} />
              </div>
            </Field>
          ) : (
            <Field label="Resolution">
              <Select value={quality} onChange={setQuality} options={[{ value: 'draft', label: 'Draft (1024 px)' }, { value: 'standard', label: 'Standard (1344 px)' }, { value: 'high', label: 'High (1536 px)' }]} />
            </Field>
          )}
          <Field label="Number of images"><Select value={String(count) as '1'} onChange={(v) => setCount(Number(v))} options={['1', '2', '3', '4'].map((n) => ({ value: n as '1', label: n }))} /></Field>
          <Field label="Seed (optional)" hint={info && !info.supports?.seed ? 'This provider ignores seeds.' : undefined}><Input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} /></Field>
          <Field label="Save into project">
            <Select value={projectId} onChange={setProjectId} options={[{ value: '', label: 'Library only' }, ...(projects ?? []).map((p) => ({ value: p.id, label: p.title }))]} />
          </Field>
          <Toggle checked={applyStyle} onChange={setApplyStyle} label="Add style keywords to the prompt" />
        </div>
        <div className="flex items-center gap-3">
          {refUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={refUrl} alt="Reference" className="size-16 rounded-lg object-cover" />
              <button className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-surface-3" aria-label="Remove reference" onClick={() => { setRef(null); setRefUrl(null); }}><X className="size-3.5" /></button>
            </div>
          ) : (
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 text-sm text-muted">
              <ImagePlus className="size-4" /> Reference image
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const small = await resizeImage(f, 1024);
                setRef(small);
                setRefUrl(URL.createObjectURL(small));
              }} />
            </label>
          )}
          <span className="text-xs text-muted">{info?.supports?.referenceImage ? 'Used as image-to-image input.' : 'The selected provider does not accept reference images.'}</span>
        </div>
        {progress ? (
          <div className="space-y-2">
            <ProgressBar value={progress.done / progress.total} />
            <div className="flex items-center justify-between text-sm text-muted">
              Generating {progress.done + 1} of {progress.total}…
              <Button size="sm" variant="danger" onClick={() => ctrl?.abort()}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="primary" size="lg" className="w-full" disabled={!provider} icon={<Wand2 className="size-5" />} onClick={run}>Generate</Button>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
      </Card>

      <SectionTitle action={<Toggle checked={favOnly} onChange={setFavOnly} label="Favorites" />}>Image library</SectionTitle>
      {!shown.length ? (
        <EmptyState icon={<ImageIcon className="size-7" />} title="No images yet">Generated and uploaded images appear here.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {shown.slice(0, 120).map((a) => (
            <Card key={a.id} className="overflow-hidden p-0">
              <AssetImage id={a.id} alt={a.prompt ?? a.name} className="aspect-square w-full" />
              <div className="flex items-center gap-1 p-1.5">
                <Button size="sm" variant="ghost" aria-label="Favorite" onClick={() => updateAssetMeta(a.id, { favorite: !a.favorite })}>
                  <Heart className={`size-4 ${a.favorite ? 'fill-danger text-danger' : ''}`} />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Download" onClick={async () => { const b = await getAssetBlob(a.id); if (b) downloadBlob(b, a.name); }}>
                  <Download className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setAssign(a)}>Use</Button>
              </div>
              {a.source && <div className="px-2 pb-2"><Badge>{a.source}</Badge></div>}
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!assign} onClose={() => setAssign(null)} title="Assign image to a scene">
        <Field label="Project">
          <Select value={projectId} onChange={setProjectId} options={[{ value: '', label: 'Choose…' }, ...(projects ?? []).map((p) => ({ value: p.id, label: p.title }))]} />
        </Field>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {assignProject?.scenes.map((s) => (
            <button
              key={s.id}
              className="overflow-hidden rounded-lg border border-line text-xs"
              onClick={async () => {
                if (!assign) return;
                await updateProject(assignProject.id, (p) => {
                  const x = p.scenes.find((y) => y.id === s.id)!;
                  if (x.imageAssetId) x.imageHistory = [x.imageAssetId, ...x.imageHistory].slice(0, 12);
                  x.imageAssetId = assign.id;
                  x.imageStatus = 'done';
                });
                await updateAssetMeta(assign.id, { projectId: assignProject.id });
                toast(`Set as scene_${pad(s.number)}`, 'success');
                setAssign(null);
              }}
            >
              <AssetImage id={s.imageAssetId} alt="" className="aspect-video w-full" />
              <div className="py-1">Scene {s.number}</div>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

export default function ImagesPage() {
  return (
    <div>
      <PageHeader title="AI Image Studio" subtitle="Real images from your connected providers." icon={<ImageIcon className="size-5" />} />
      <Suspense fallback={<div className="skeleton h-40 rounded-2xl" />}>
        <Studio />
      </Suspense>
    </div>
  );
}
