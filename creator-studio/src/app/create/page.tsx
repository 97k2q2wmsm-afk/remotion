'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ImagePlus, Rocket, Sparkles, X } from 'lucide-react';
import type { Brief, Channel, VideoFormat, VisualStyle } from '@/types';
import { ASPECT_LABELS, ASPECT_RATIOS, FORMAT_DEFAULTS, FORMAT_LABELS, VIDEO_FORMATS, VISUAL_STYLES, VISUAL_STYLE_LABELS, type AspectRatio } from '@/config/states';
import { newProject } from '@/config/defaults';
import { AssetImage } from '@/components/common';
import { useFeedback } from '@/components/feedback';
import { Button, Card, Field, InfoNote, Input, PageHeader, SectionTitle, Select, Textarea, Toggle } from '@/components/ui';
import { useChannels, useProviders, useSettings } from '@/hooks/data';
import { saveProject } from '@/services/storage/projects';
import { saveAsset } from '@/services/storage/assets';
import { resizeImage, imageDimensions } from '@/services/media/image';
import { runFullProduction, type ProductionOptions } from '@/services/production';
import { errorMessage, formatTime } from '@/utils';

const STORY_STYLES = ['Documentary', 'Suspense / mystery', 'What-if scenario', 'Countdown / top list', 'Personal POV ("you")', 'Historical drama', 'Explainer', 'Emotional true story'];
const TONES = ['Dramatic', 'Curious', 'Energetic', 'Calm and warm', 'Solemn', 'Humorous', 'Suspenseful'];

export default function CreatePage() {
  const router = useRouter();
  const { toast } = useFeedback();
  const { data: channels } = useChannels();
  const { data: providers } = useProviders();
  const { settings } = useSettings();
  const [channelId, setChannelId] = useState('');
  const [b, setB] = useState<Brief>({
    topic: '',
    language: 'English',
    format: 'shorts',
    aspect: '9:16',
    targetDuration: 55,
    audience: '',
    storytelling: STORY_STYLES[0],
    visualStyle: 'cartoon2d',
    sceneCount: 8,
    tone: TONES[0],
    referenceText: '',
    referenceAssetIds: [],
  });
  const [opts, setOpts] = useState<ProductionOptions>({ images: true, voice: true, thumbnail: true, edit: true, render: false });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => setB((x) => ({ ...x, [k]: v }));

  const channel = channels?.find((c) => c.id === channelId);
  const applyChannel = (c?: Channel) => {
    if (!c) return;
    const f = FORMAT_DEFAULTS[c.defaultFormat];
    setB((x) => ({
      ...x,
      language: c.language,
      format: c.defaultFormat,
      aspect: c.preferredAspect,
      targetDuration: c.preferredDuration,
      sceneCount: Math.max(4, Math.round((c.preferredDuration / f.duration) * f.scenes)),
      audience: c.targetAudience,
      visualStyle: c.defaultVisualStyle,
      tone: c.narrationStyle ? x.tone : x.tone,
    }));
  };
  useEffect(() => {
    if (!channelId && channels?.length) {
      setChannelId(channels[0].id);
      applyChannel(channels[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);
  useEffect(() => {
    if (settings && !channels?.length) set('language', settings.defaultLanguage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const setFormat = (f: VideoFormat) => {
    const d = FORMAT_DEFAULTS[f];
    setB((x) => ({ ...x, format: f, aspect: d.aspect, targetDuration: d.duration, sceneCount: d.scenes }));
  };

  const hasText = providers?.some((p) => p.kind === 'text' && p.enabled);
  const hasImage = providers?.some((p) => p.kind === 'image' && p.enabled);
  const hasVoice = providers?.some((p) => p.kind === 'voice' && p.enabled);

  const addRefs = async (files: FileList | null) => {
    if (!files) return;
    const ids: string[] = [];
    for (const f of Array.from(files).slice(0, 6)) {
      const small = await resizeImage(f, 1536);
      const dims = await imageDimensions(small);
      const meta = await saveAsset({ kind: 'reference-image', name: f.name, blob: small, ...dims, source: 'upload' });
      ids.push(meta.id);
    }
    set('referenceAssetIds', [...b.referenceAssetIds, ...ids]);
  };

  const create = async (runAll: boolean) => {
    if (b.topic.trim().length < 4) return toast('Describe the video idea first.', 'warning');
    setBusy(true);
    try {
      const p = newProject({ ...b, topic: b.topic.trim() }, channel);
      p.imageSettings.providerId = settings?.preferredImage;
      if (settings) p.render = { ...settings.defaultRender };
      await saveProject(p);
      if (runAll) {
        if (!hasText) {
          toast('Connect a text AI provider first — opening the project so you can write the script manually.', 'warning');
        } else void runFullProduction(p.id, opts).catch(() => {});
      }
      router.push(`/project?id=${p.id}${runAll && hasText ? '&tab=overview' : '&tab=script'}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Create Video" subtitle="Enter an idea — the studio produces the whole video." icon={<Sparkles className="size-5" />} />
      {!hasText && providers && (
        <InfoNote tone="warning">
          No text AI provider is connected, so the script cannot be generated automatically. Connect one in <b>Settings → Providers</b> (Gemini, Hugging Face, Groq and OpenRouter have free tiers), or create the project and write the script yourself.
        </InfoNote>
      )}
      <Card className="mt-4 space-y-4">
        <Field label="Video idea / topic">
          <Textarea autoFocus value={b.topic} onChange={(e) => set('topic', e.target.value)} placeholder="e.g. What if gravity disappeared for 10 seconds?" rows={3} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Channel">
            <Select
              value={channelId}
              onChange={(v) => {
                setChannelId(v);
                applyChannel(channels?.find((c) => c.id === v));
              }}
              options={[{ value: '', label: 'No channel' }, ...(channels ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            />
          </Field>
          <Field label="Video language" hint="Turkish, English, Spanish or any language your text model supports.">
            <Input value={b.language} onChange={(e) => set('language', e.target.value)} list="langs" />
            <datalist id="langs">
              {['Turkish', 'English', 'Spanish', 'German', 'French', 'Portuguese', 'Arabic', 'Italian'].map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </Field>
          <Field label="Format">
            <Select value={b.format} onChange={setFormat} options={VIDEO_FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))} />
          </Field>
          <Field label="Aspect ratio">
            <Select value={b.aspect} onChange={(v: AspectRatio) => set('aspect', v)} options={ASPECT_RATIOS.map((a) => ({ value: a, label: ASPECT_LABELS[a] }))} />
          </Field>
          <Field label={`Target duration · ${formatTime(b.targetDuration)}`}>
            <input
              type="range"
              min={15}
              max={b.format === 'standard' || b.format === 'custom' ? 1800 : 180}
              step={5}
              value={b.targetDuration}
              onChange={(e) => set('targetDuration', Number(e.target.value))}
              className="h-11 w-full accent-[var(--accent)]"
            />
          </Field>
          <Field label="Number of scenes">
            <Input type="number" min={2} max={80} value={b.sceneCount} onChange={(e) => set('sceneCount', Math.max(2, Math.min(80, Number(e.target.value) || 2)))} />
          </Field>
          <Field label="Visual style">
            <Select value={b.visualStyle} onChange={(v: VisualStyle) => set('visualStyle', v)} options={VISUAL_STYLES.map((s) => ({ value: s, label: VISUAL_STYLE_LABELS[s] }))} />
          </Field>
          <Field label="Storytelling style">
            <Input value={b.storytelling} onChange={(e) => set('storytelling', e.target.value)} list="story" />
            <datalist id="story">{STORY_STYLES.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Narration tone">
            <Input value={b.tone} onChange={(e) => set('tone', e.target.value)} list="tones" />
            <datalist id="tones">{TONES.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Target audience">
            <Input value={b.audience} onChange={(e) => set('audience', e.target.value)} placeholder="e.g. curious teens and young adults" />
          </Field>
        </div>
        <Field label="Reference text (optional)" hint="Notes, sources or facts the script must use.">
          <Textarea value={b.referenceText} onChange={(e) => set('referenceText', e.target.value)} rows={3} />
        </Field>
        <div>
          <div className="mb-1.5 text-sm font-semibold">Reference images (optional)</div>
          <div className="flex flex-wrap gap-2">
            {b.referenceAssetIds.map((id) => (
              <div key={id} className="relative">
                <AssetImage id={id} alt="Reference" className="size-20 rounded-xl" />
                <button onClick={() => set('referenceAssetIds', b.referenceAssetIds.filter((x) => x !== id))} className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-surface-3" aria-label="Remove">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <label className="grid size-20 cursor-pointer place-items-center rounded-xl border border-dashed border-line-strong text-muted">
              <ImagePlus className="size-6" />
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addRefs(e.target.files)} />
            </label>
          </div>
        </div>
      </Card>

      <SectionTitle>Automatic production</SectionTitle>
      <Card className="space-y-1">
        <p className="mb-2 text-sm text-muted">Script, storyboard, characters, SEO and thumbnail concepts always run. Choose what else the studio does for you:</p>
        <Toggle checked={opts.images && !!hasImage} onChange={(v) => setOpts({ ...opts, images: v })} label={`Generate all scene images${hasImage ? '' : ' — no image provider connected'}`} />
        <Toggle checked={opts.thumbnail && !!hasImage} onChange={(v) => setOpts({ ...opts, thumbnail: v })} label="Design the first thumbnail" />
        <Toggle checked={opts.voice && !!hasVoice} onChange={(v) => setOpts({ ...opts, voice: v })} label={`Generate voice-over${hasVoice ? '' : ' — no voice provider (you can upload/record later)'}`} />
        <Toggle checked={opts.edit} onChange={(v) => setOpts({ ...opts, edit: v })} label="Build the automatic edit (camera moves, transitions, music, SFX, subtitles)" />
        <Toggle checked={opts.render && opts.edit} onChange={(v) => setOpts({ ...opts, render: v })} label="Render the MP4 at the end (keep the app open)" />
      </Card>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+76px)] mt-5 flex flex-col gap-2 rounded-2xl border border-line bg-bg/90 p-3 backdrop-blur lg:bottom-4 sm:flex-row">
        <Button variant="primary" size="lg" className="flex-1" loading={busy} icon={<Rocket className="size-5" />} onClick={() => create(true)}>
          Produce my video
        </Button>
        <Button size="lg" disabled={busy} onClick={() => create(false)}>
          Create empty project
        </Button>
      </div>
    </div>
  );
}
