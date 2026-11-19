'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Download, Eye, EyeOff, ImagePlus, LayoutTemplate, Redo2, Save, Square, Trash2, Type, Undo2, Wand2 } from 'lucide-react';
import type { Project, ThumbDesign, ThumbImageLayer, ThumbLayer, ThumbShapeLayer, ThumbTextLayer } from '@/types';
import { VISUAL_STYLE_PROMPTS } from '@/config/states';
import { AssetImage } from '@/components/common';
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Select, Sheet, Slider, Textarea, Toggle, cn } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { useLive } from '@/hooks/data';
import { FONTS } from '@/features/editor/Inspector';
import { runThumbConcepts, resolveProvider } from '@/services/ai/pipeline';
import { generateImage } from '@/services/ai/client';
import { getChannel } from '@/services/storage/channels';
import { saveAsset } from '@/services/storage/assets';
import { deleteTemplate, listTemplates, saveTemplate } from '@/services/storage/settings';
import { imageDimensions, generationSize, resizeImage } from '@/services/media/image';
import { THUMB_H, THUMB_W, designFromConcept, exportDesign, imageLayer, renderDesign, shapeLayer, textLayer } from '@/services/thumbnail/design';
import { downloadBlob, errorMessage, pad, slugify, uid } from '@/utils';

type Update = (fn: (p: Project) => Project | void) => Promise<void>;

export function ThumbnailEditor({ project, update }: { project: Project; update: Update }) {
  const { toast, confirm } = useFeedback();
  const [designId, setDesignId] = useState<string | undefined>(project.thumbDesigns[0]?.id);
  const stored = project.thumbDesigns.find((d) => d.id === designId);
  const [design, setDesign] = useState<ThumbDesign | undefined>(stored);
  const [selected, setSelected] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const past = useRef<ThumbDesign[]>([]);
  const future = useRef<ThumbDesign[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragRef = useRef<{ id: string; ox: number; oy: number; lx: number; ly: number } | null>(null);
  const { data: templates } = useLive(listTemplates, [], ['templates']);

  useEffect(() => {
    setDesign(project.thumbDesigns.find((d) => d.id === designId));
    past.current = [];
    future.current = [];
    // only when switching designs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !design) return;
    void renderDesign(c.getContext('2d')!, design, selected);
  }, [design, selected]);

  const persist = useCallback(
    (d: ThumbDesign) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void update((p) => {
          p.thumbDesigns = p.thumbDesigns.map((x) => (x.id === d.id ? d : x));
        });
      }, 400);
    },
    [update],
  );

  const change = (d: ThumbDesign, record = true) => {
    if (record && design) {
      past.current = [...past.current.slice(-49), design];
      future.current = [];
    }
    const next = { ...d, updatedAt: Date.now() };
    setDesign(next);
    persist(next);
  };
  const patchLayer = (id: string, p: Partial<ThumbLayer>, record = true) => design && change({ ...design, layers: design.layers.map((l) => (l.id === id ? ({ ...l, ...p } as ThumbLayer) : l)) }, record);

  const addDesign = async (d: ThumbDesign) => {
    await update((p) => void p.thumbDesigns.unshift(d));
    setDesignId(d.id);
    setDesign(d);
  };

  const buildFromConcept = async (conceptId: string, useSceneImage: boolean) => {
    const c = project.thumbConcepts.find((x) => x.id === conceptId);
    if (!c) return;
    setBusy(conceptId);
    try {
      let assetId: string | undefined;
      if (useSceneImage) assetId = project.scenes.find((s) => s.imageAssetId)?.imageAssetId;
      else {
        const provider = await resolveProvider('image', project.imageSettings.providerId);
        if (!provider) throw new Error('No image provider connected — use a scene image or upload one.');
        const size = generationSize('16:9', 'high');
        const style = VISUAL_STYLE_PROMPTS[project.brief.visualStyle];
        const blob = await generateImage(provider, { prompt: `${c.imagePrompt}. ${style.positive}. YouTube thumbnail artwork, no text`, negativePrompt: style.negative, width: size.width, height: size.height });
        const meta = await saveAsset({ projectId: project.id, kind: 'thumb-source', name: `thumb_art_${c.id}.${blob.type === 'image/png' ? 'png' : 'jpg'}`, blob, ...(await imageDimensions(blob)), prompt: c.imagePrompt, providerId: provider.id, source: provider.name });
        assetId = meta.id;
      }
      await addDesign(designFromConcept(c, assetId, await getChannel(project.channelId)));
      await update((p) => void (p.stages.thumbnails = { status: 'running', updatedAt: Date.now() }));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const pointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * THUMB_W, y: ((e.clientY - rect.top) / rect.height) * THUMB_H };
  };

  const exportAs = async (type: 'image/png' | 'image/jpeg') => {
    if (!design) return;
    setBusy('export');
    try {
      const blob = await exportDesign(design, type);
      const n = project.thumbExports.length + 1;
      const name = `thumbnail_${pad(n, 2)}.${type === 'image/png' ? 'png' : 'jpg'}`;
      const meta = await saveAsset({ projectId: project.id, kind: 'thumbnail', name, blob, width: THUMB_W, height: THUMB_H, source: 'Thumbnail Studio' });
      await update((p) => {
        p.thumbExports.unshift(meta.id);
        p.stages.thumbnails = { status: 'done', updatedAt: Date.now() };
      });
      downloadBlob(blob, `${slugify(project.title)}_${name}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const layer = design?.layers.find((l) => l.id === selected);
  const sceneImages = [...new Set(project.scenes.flatMap((s) => [s.imageAssetId, ...s.imageHistory]).filter((x): x is string => !!x))];

  return (
    <div className="space-y-4">
      <SectionTitle
        action={
          <Button size="sm" loading={busy === 'concepts'} icon={<Wand2 className="size-4" />} onClick={async () => {
            setBusy('concepts');
            try {
              await runThumbConcepts(project.id);
            } catch (e) {
              toast(errorMessage(e), 'error');
            } finally {
              setBusy(null);
            }
          }}>
            {project.thumbConcepts.length ? 'New concepts' : 'Generate concepts'}
          </Button>
        }
      >
        Concepts
      </SectionTitle>
      {project.thumbConcepts.length === 0 ? (
        <Card className="text-sm text-muted">Generate at least three distinct concepts from your script, or start a blank design below.</Card>
      ) : (
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {project.thumbConcepts.map((c) => (
            <Card key={c.id} className="w-72 shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <div className="font-bold">{c.title}</div>
                <Badge>{c.layout}</Badge>
              </div>
              <div className="font-display text-xl" style={{ color: c.colors[0] }}>{c.text}</div>
              <p className="line-clamp-3 text-xs text-muted">{c.composition}</p>
              <p className="text-xs"><b>Emotion:</b> {c.emotion}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="primary" loading={busy === c.id} onClick={() => buildFromConcept(c.id, false)}>Generate art & design</Button>
                <Button size="sm" disabled={!!busy || !sceneImages.length} onClick={() => buildFromConcept(c.id, true)}>Use scene image</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle
        action={
          <div className="flex gap-1.5">
            <Button size="sm" icon={<LayoutTemplate className="size-4" />} onClick={() => setTemplatesOpen(true)}>Templates</Button>
            <Button size="sm" onClick={() => addDesign({ id: uid('td'), name: 'Blank design', background: '#0b0d17', layers: [textLayer({ text: 'YOUR TITLE' })], updatedAt: Date.now() })}>Blank</Button>
          </div>
        }
      >
        Designs
      </SectionTitle>
      {project.thumbDesigns.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {project.thumbDesigns.map((d) => (
            <button key={d.id} onClick={() => setDesignId(d.id)} className={cn('h-10 shrink-0 rounded-full px-4 text-sm font-semibold', d.id === designId ? 'bg-ink text-bg' : 'bg-surface-2 text-muted')}>
              {d.name}
            </button>
          ))}
        </div>
      )}

      {!design ? (
        <EmptyState icon={<LayoutTemplate className="size-7" />} title="No design selected">Build one from a concept, a template, or start blank.</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="ghost" aria-label="Undo" disabled={!past.current.length} onClick={() => { const p = past.current.pop(); if (p && design) { future.current.push(design); change(p, false); } }}><Undo2 className="size-4" /></Button>
            <Button size="sm" variant="ghost" aria-label="Redo" disabled={!future.current.length} onClick={() => { const n = future.current.pop(); if (n && design) { past.current.push(design); change(n, false); } }}><Redo2 className="size-4" /></Button>
            <Button size="sm" icon={<Type className="size-4" />} onClick={() => { const l = textLayer({ text: 'NEW TEXT', x: 200, y: 250 }); change({ ...design, layers: [...design.layers, l] }); setSelected(l.id); }}>Text</Button>
            <Button size="sm" icon={<ImagePlus className="size-4" />} onClick={() => setPicker(true)}>Image</Button>
            <Button size="sm" icon={<Square className="size-4" />} onClick={() => { const l = shapeLayer({ name: 'Box', x: 80, y: 80, w: 400, h: 160, color: '#FF4F7B', radius: 24 }); change({ ...design, layers: [...design.layers, l] }); setSelected(l.id); }}>Shape</Button>
            <div className="ml-auto flex gap-1.5">
              <Button size="sm" loading={busy === 'export'} icon={<Download className="size-4" />} onClick={() => exportAs('image/png')}>PNG</Button>
              <Button size="sm" icon={<Download className="size-4" />} onClick={() => exportAs('image/jpeg')}>JPG</Button>
            </div>
          </div>
          <div className="checker overflow-hidden rounded-xl border border-line">
            <canvas
              ref={canvasRef}
              width={THUMB_W}
              height={THUMB_H}
              className="block aspect-video w-full touch-none"
              aria-label="Thumbnail canvas"
              onPointerDown={(e) => {
                const p = pointer(e);
                const hit = [...design.layers].reverse().find((l) => l.visible && p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h);
                setSelected(hit?.id);
                if (hit) {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  past.current = [...past.current.slice(-49), design];
                  future.current = [];
                  dragRef.current = { id: hit.id, ox: p.x, oy: p.y, lx: hit.x, ly: hit.y };
                }
              }}
              onPointerMove={(e) => {
                const d = dragRef.current;
                if (!d) return;
                const p = pointer(e);
                patchLayer(d.id, { x: Math.round(d.lx + p.x - d.ox), y: Math.round(d.ly + p.y - d.oy) }, false);
              }}
              onPointerUp={() => (dragRef.current = null)}
              onPointerCancel={() => (dragRef.current = null)}
            />
          </div>
          <p className="text-xs text-muted">Tap a layer to select it, drag to move. Use the small preview to check readability at phone size.</p>
          <div className="flex items-end gap-3">
            <div className="w-40 overflow-hidden rounded-lg border border-line">
              <PreviewSmall design={design} />
            </div>
            <span className="text-xs text-muted">≈ size in the YouTube mobile feed</span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-bold">Layers</div>
                <Field label="" className="w-28"><Input type="color" value={design.background} onChange={(e) => change({ ...design, background: e.target.value })} aria-label="Background color" /></Field>
              </div>
              {[...design.layers].reverse().map((l) => {
                const i = design.layers.indexOf(l);
                return (
                  <div key={l.id} className={cn('flex items-center gap-1 rounded-xl border p-1.5', l.id === selected ? 'border-accent bg-accent/10' : 'border-line')}>
                    <button className="flex-1 truncate px-1 text-left text-sm" onClick={() => setSelected(l.id)}>
                      {l.type === 'text' ? `T · ${l.text.slice(0, 24)}` : l.type === 'image' ? 'Image' : `Shape · ${l.name}`}
                    </button>
                    <Button size="sm" variant="ghost" aria-label="Toggle visibility" onClick={() => patchLayer(l.id, { visible: !l.visible })}>{l.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</Button>
                    <Button size="sm" variant="ghost" aria-label="Bring forward" disabled={i === design.layers.length - 1} onClick={() => { const ls = [...design.layers]; [ls[i], ls[i + 1]] = [ls[i + 1], ls[i]]; change({ ...design, layers: ls }); }}><ArrowUp className="size-4" /></Button>
                    <Button size="sm" variant="ghost" aria-label="Send backward" disabled={i === 0} onClick={() => { const ls = [...design.layers]; [ls[i], ls[i - 1]] = [ls[i - 1], ls[i]]; change({ ...design, layers: ls }); }}><ArrowDown className="size-4" /></Button>
                    <Button size="sm" variant="ghost" aria-label="Duplicate layer" onClick={() => change({ ...design, layers: [...design.layers.slice(0, i + 1), { ...l, id: uid('l'), x: l.x + 20, y: l.y + 20 }, ...design.layers.slice(i + 1)] })}><Copy className="size-4" /></Button>
                    <Button size="sm" variant="ghost" aria-label="Delete layer" onClick={() => change({ ...design, layers: design.layers.filter((x) => x.id !== l.id) })}><Trash2 className="size-4 text-danger" /></Button>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-1.5 pt-2">
                <Button size="sm" icon={<Copy className="size-4" />} onClick={() => addDesign({ ...structuredClone(design), id: uid('td'), name: `${design.name} (variant)` })}>Duplicate design</Button>
                <Button size="sm" icon={<Save className="size-4" />} onClick={async () => { await saveTemplate({ id: uid('tt'), name: design.name, channelId: project.channelId, design: structuredClone(design), createdAt: Date.now() }); toast('Saved as template', 'success'); }}>Save as template</Button>
                <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={async () => {
                  if (!(await confirm({ title: 'Delete this design?', body: 'Exported PNG/JPG files are kept.', confirm: 'Delete', danger: true }))) return;
                  await update((p) => void (p.thumbDesigns = p.thumbDesigns.filter((d) => d.id !== design.id)));
                  setDesignId(project.thumbDesigns.find((d) => d.id !== design.id)?.id);
                }}>Delete design</Button>
              </div>
            </Card>
            {layer ? <LayerInspector layer={layer} onPatch={(p) => patchLayer(layer.id, p)} /> : <Card className="text-sm text-muted">Select a layer to edit text, colors, outline, shadow, crop and size.</Card>}
          </div>
        </>
      )}

      <Sheet open={picker} onClose={() => setPicker(false)} title="Add image" wide>
        <label className="mb-3 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium">
          <ImagePlus className="size-4" /> Upload image
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f || !design) return;
            const small = await resizeImage(f, 2048, f.type === 'image/png' ? 'image/png' : 'image/jpeg');
            const meta = await saveAsset({ projectId: project.id, kind: 'thumb-source', name: f.name, blob: small, ...(await imageDimensions(small)), source: 'upload' });
            const l = imageLayer(meta.id, { x: 640, y: 80, w: 560, h: 560 });
            change({ ...design, layers: [...design.layers, l] });
            setSelected(l.id);
            setPicker(false);
          }} />
        </label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {sceneImages.map((id) => (
            <button key={id} className="overflow-hidden rounded-lg border border-line" onClick={() => {
              if (!design) return;
              const l = imageLayer(id);
              change({ ...design, layers: [l, ...design.layers] });
              setSelected(l.id);
              setPicker(false);
            }}>
              <AssetImage id={id} alt="" className="aspect-video w-full" />
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={templatesOpen} onClose={() => setTemplatesOpen(false)} title="Templates">
        {!templates?.length ? (
          <p className="text-sm text-muted">No templates yet. Save a design as a template to reuse its layout.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <Card key={t.id} className="flex items-center gap-2 p-3">
                <div className="flex-1 text-sm font-semibold">{t.name}</div>
                <Button size="sm" variant="primary" onClick={async () => {
                  const d = structuredClone(t.design);
                  d.id = uid('td');
                  d.name = `${t.name}`;
                  d.layers = d.layers.map((l) => ({ ...l, id: uid('l') }));
                  await addDesign(d);
                  setTemplatesOpen(false);
                }}>Use</Button>
                <Button size="sm" variant="ghost" aria-label="Delete template" onClick={() => deleteTemplate(t.id)}><Trash2 className="size-4 text-danger" /></Button>
              </Card>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function PreviewSmall({ design }: { design: ThumbDesign }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const big = document.createElement('canvas');
    big.width = THUMB_W;
    big.height = THUMB_H;
    void renderDesign(big.getContext('2d')!, design).then(() => {
      const ctx = c.getContext('2d')!;
      ctx.drawImage(big, 0, 0, c.width, c.height);
      big.width = big.height = 0;
    });
  }, [design]);
  return <canvas ref={ref} width={320} height={180} className="block aspect-video w-full" />;
}

function LayerInspector({ layer, onPatch }: { layer: ThumbLayer; onPatch: (p: Partial<ThumbLayer>) => void }) {
  const box = (
    <div className="grid grid-cols-2 gap-2">
      <Slider label="X" value={layer.x} min={-600} max={THUMB_W} step={2} onChange={(v) => onPatch({ x: v })} />
      <Slider label="Y" value={layer.y} min={-400} max={THUMB_H} step={2} onChange={(v) => onPatch({ y: v })} />
      <Slider label="Width" value={layer.w} min={20} max={THUMB_W * 2} step={2} onChange={(v) => onPatch({ w: v })} />
      <Slider label="Height" value={layer.h} min={20} max={THUMB_H * 2} step={2} onChange={(v) => onPatch({ h: v })} />
      <Slider label="Rotation" value={layer.rotation} min={-45} max={45} step={1} onChange={(v) => onPatch({ rotation: v })} format={(v) => `${v}°`} />
      <Slider label="Opacity" value={layer.opacity} min={0} max={1} step={0.05} onChange={(v) => onPatch({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
    </div>
  );
  if (layer.type === 'text') {
    const l = layer as ThumbTextLayer;
    const p = (x: Partial<ThumbTextLayer>) => onPatch(x as Partial<ThumbLayer>);
    return (
      <Card className="space-y-3">
        <Field label="Text"><Textarea rows={2} value={l.text} onChange={(e) => p({ text: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Font"><Select value={l.font} onChange={(v) => p({ font: v })} options={FONTS} /></Field>
          <Field label="Align"><Select value={l.align} onChange={(v) => p({ align: v })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} /></Field>
          <Field label="Color"><Input type="color" value={l.color} onChange={(e) => p({ color: e.target.value })} /></Field>
          <Field label="Outline color"><Input type="color" value={l.strokeColor} onChange={(e) => p({ strokeColor: e.target.value })} /></Field>
          <Slider label="Size" value={l.size} min={20} max={260} step={2} onChange={(v) => p({ size: v })} />
          <Slider label="Outline" value={l.strokeWidth} min={0} max={40} step={1} onChange={(v) => p({ strokeWidth: v })} />
          <Slider label="Shadow" value={l.shadowBlur} min={0} max={60} step={1} onChange={(v) => p({ shadowBlur: v })} />
          <Slider label="Line height" value={l.lineHeight} min={0.7} max={1.6} step={0.05} onChange={(v) => p({ lineHeight: v })} />
          <Toggle checked={l.uppercase} onChange={(v) => p({ uppercase: v })} label="UPPERCASE" />
          <Toggle checked={!!l.highlightColor} onChange={(v) => p({ highlightColor: v ? '#FF4F7B' : '' })} label="Highlight box" />
          {l.highlightColor && <Field label="Highlight color"><Input type="color" value={l.highlightColor} onChange={(e) => p({ highlightColor: e.target.value })} /></Field>}
        </div>
        {box}
      </Card>
    );
  }
  if (layer.type === 'image') {
    const l = layer as ThumbImageLayer;
    const zoom = 1 / l.crop.w;
    const setZoom = (z: number) => {
      const w = 1 / z;
      const cx = l.crop.x + l.crop.w / 2;
      const cy = l.crop.y + l.crop.h / 2;
      const nx = Math.min(1 - w, Math.max(0, cx - w / 2));
      const ny = Math.min(1 - w, Math.max(0, cy - w / 2));
      onPatch({ crop: { x: nx, y: ny, w, h: w } } as Partial<ThumbLayer>);
    };
    return (
      <Card className="space-y-3">
        <div className="font-bold">Image · crop</div>
        <Slider label="Crop zoom" value={zoom} min={1} max={4} step={0.05} onChange={setZoom} format={(v) => `${v.toFixed(2)}×`} />
        <Slider label="Crop horizontal" value={l.crop.x} min={0} max={Math.max(0, 1 - l.crop.w)} step={0.005} onChange={(v) => onPatch({ crop: { ...l.crop, x: v } } as Partial<ThumbLayer>)} />
        <Slider label="Crop vertical" value={l.crop.y} min={0} max={Math.max(0, 1 - l.crop.h)} step={0.005} onChange={(v) => onPatch({ crop: { ...l.crop, y: v } } as Partial<ThumbLayer>)} />
        <Toggle checked={l.flipX} onChange={(v) => onPatch({ flipX: v } as Partial<ThumbLayer>)} label="Flip horizontally" />
        {box}
      </Card>
    );
  }
  const l = layer as ThumbShapeLayer;
  const p = (x: Partial<ThumbShapeLayer>) => onPatch(x as Partial<ThumbLayer>);
  return (
    <Card className="space-y-3">
      <Field label="Shape"><Select value={l.shape} onChange={(v) => p({ shape: v })} options={[{ value: 'rect', label: 'Rectangle' }, { value: 'gradient', label: 'Linear gradient' }, { value: 'circle', label: 'Radial vignette' }]} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Color"><Input value={l.color} onChange={(e) => p({ color: e.target.value })} /></Field>
        {l.shape !== 'rect' && <Field label="Color 2"><Input value={l.color2} onChange={(e) => p({ color2: e.target.value })} /></Field>}
        {l.shape === 'gradient' && <Slider label="Angle" value={l.angle} min={0} max={360} step={5} onChange={(v) => p({ angle: v })} format={(v) => `${v}°`} />}
        {l.shape === 'rect' && <Slider label="Corner radius" value={l.radius} min={0} max={120} step={2} onChange={(v) => p({ radius: v })} />}
      </div>
      {box}
    </Card>
  );
}
