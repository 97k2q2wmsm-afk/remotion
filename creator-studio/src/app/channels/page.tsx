'use client';
import { useState } from 'react';
import { Copy, Pencil, Plus, Trash2, Tv } from 'lucide-react';
import type { Channel } from '@/types';
import { ASPECT_LABELS, ASPECT_RATIOS, FORMAT_LABELS, MUSIC_MOODS, MUSIC_MOOD_LABELS, VIDEO_FORMATS, VISUAL_STYLES, VISUAL_STYLE_LABELS } from '@/config/states';
import { newChannel } from '@/config/defaults';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, SectionTitle, Select, Sheet, Textarea, Toggle } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { useChannels, useProjects } from '@/hooks/data';
import { deleteChannel, duplicateChannel, saveChannel } from '@/services/storage/channels';
import { CharacterEditor } from '@/features/project/CharactersTab';
import { FONTS } from '@/features/editor/Inspector';
import { uid } from '@/utils';

function ChannelForm({ value, onChange }: { value: Channel; onChange: (c: Channel) => void }) {
  const set = <K extends keyof Channel>(k: K, v: Channel[K]) => onChange({ ...value, [k]: v });
  const text = (k: 'description' | 'targetAudience' | 'category' | 'visualIdentity' | 'thumbnailRules' | 'narrationStyle', label: string, rows = 2) => (
    <Field label={label}>
      <Textarea rows={rows} value={value[k]} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );
  return (
    <div className="space-y-4">
      <Field label="Channel name"><Input value={value.name} onChange={(e) => set('name', e.target.value)} /></Field>
      {text('description', 'Description')}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Language"><Input value={value.language} onChange={(e) => set('language', e.target.value)} /></Field>
        <Field label="Content category"><Input value={value.category} onChange={(e) => set('category', e.target.value)} /></Field>
        <Field label="Default format"><Select value={value.defaultFormat} onChange={(v) => set('defaultFormat', v)} options={VIDEO_FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))} /></Field>
        <Field label="Preferred aspect ratio"><Select value={value.preferredAspect} onChange={(v) => set('preferredAspect', v)} options={ASPECT_RATIOS.map((a) => ({ value: a, label: ASPECT_LABELS[a] }))} /></Field>
        <Field label="Preferred duration (seconds)"><Input type="number" min={10} value={value.preferredDuration} onChange={(e) => set('preferredDuration', Number(e.target.value) || 60)} /></Field>
        <Field label="Default visual style"><Select value={value.defaultVisualStyle} onChange={(v) => set('defaultVisualStyle', v)} options={VISUAL_STYLES.map((s) => ({ value: s, label: VISUAL_STYLE_LABELS[s] }))} /></Field>
        <Field label="Title font"><Select value={value.titleFont} onChange={(v) => set('titleFont', v)} options={FONTS} /></Field>
        <Field label="Music mood"><Select value={value.musicMood} onChange={(v) => set('musicMood', v)} options={MUSIC_MOODS.map((m) => ({ value: m, label: MUSIC_MOOD_LABELS[m] }))} /></Field>
      </div>
      {text('targetAudience', 'Target audience')}
      {text('visualIdentity', 'Visual identity', 3)}
      {text('narrationStyle', 'Narration style')}
      {text('thumbnailRules', 'Thumbnail design rules', 3)}
      <div>
        <div className="mb-1.5 text-sm font-semibold">Brand colors</div>
        <div className="flex flex-wrap items-center gap-2">
          {value.brandColors.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              <input type="color" value={c} onChange={(e) => set('brandColors', value.brandColors.map((x, j) => (j === i ? e.target.value : x)))} className="size-11 rounded-lg border border-line bg-transparent" aria-label={`Brand color ${i + 1}`} />
              <button className="text-xs text-muted" onClick={() => set('brandColors', value.brandColors.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <Button size="sm" onClick={() => set('brandColors', [...value.brandColors, '#ffffff'])}>Add color</Button>
        </div>
      </div>
      <Field label="Example videos (one URL per line)">
        <Textarea rows={2} value={value.exampleVideos.join('\n')} onChange={(e) => set('exampleVideos', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} />
      </Field>
      <SectionTitle>Intro & outro</SectionTitle>
      {(['intro', 'outro'] as const).map((k) => (
        <Card key={k} className="space-y-2">
          <Toggle checked={value[k].enabled} onChange={(v) => set(k, { ...value[k], enabled: v })} label={k === 'intro' ? 'Opening title card' : 'Closing title card'} />
          {value[k].enabled && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Title"><Input value={value[k].text} onChange={(e) => set(k, { ...value[k], text: e.target.value })} /></Field>
              <Field label="Subtitle"><Input value={value[k].subtitle} onChange={(e) => set(k, { ...value[k], subtitle: e.target.value })} /></Field>
              <Field label="Seconds"><Input type="number" step={0.5} min={1} value={value[k].duration} onChange={(e) => set(k, { ...value[k], duration: Number(e.target.value) || 2 })} /></Field>
            </div>
          )}
        </Card>
      ))}
      <SectionTitle action={<Button size="sm" icon={<Plus className="size-4" />} onClick={() => set('characters', [...value.characters, { id: uid('chr'), name: 'New character', face: '', hair: '', clothing: '', age: '', body: '', features: '', style: '' }])}>Add</Button>}>
        Character references
      </SectionTitle>
      {value.characters.map((c) => (
        <CharacterEditor key={c.id} c={c} onChange={(p) => set('characters', value.characters.map((x) => (x.id === c.id ? { ...x, ...p } : x)))} onDelete={() => set('characters', value.characters.filter((x) => x.id !== c.id))} />
      ))}
    </div>
  );
}

export default function ChannelsPage() {
  const { data: channels } = useChannels();
  const { data: projects } = useProjects();
  const { toast, confirm } = useFeedback();
  const [edit, setEdit] = useState<Channel | null>(null);

  return (
    <div>
      <PageHeader title="Channel Manager" subtitle="Each channel keeps its own style, voice, language, characters and presets." icon={<Tv className="size-5" />} actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit(newChannel())}>Add channel</Button>} />
      {!channels?.length ? (
        <EmptyState title="No channels" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {channels.map((c) => (
            <Card key={c.id} className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex shrink-0 -space-x-1.5">
                  {c.brandColors.slice(0, 4).map((col, i) => <span key={i} className="size-6 rounded-full border-2 border-surface" style={{ background: col }} />)}
                </div>
                <div className="flex-1">
                  <div className="text-lg font-extrabold" style={{ fontFamily: c.titleFont }}>{c.name}</div>
                  <div className="line-clamp-2 text-sm text-muted">{c.description}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="accent">{c.language}</Badge>
                <Badge>{FORMAT_LABELS[c.defaultFormat]}</Badge>
                <Badge>{c.preferredAspect}</Badge>
                <Badge>{VISUAL_STYLE_LABELS[c.defaultVisualStyle]}</Badge>
                <Badge>{c.characters.length} characters</Badge>
                <Badge>{projects?.filter((p) => p.channelId === c.id).length ?? 0} projects</Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setEdit(structuredClone(c))}>Edit</Button>
                <Button size="sm" icon={<Copy className="size-4" />} onClick={async () => { await duplicateChannel(c); toast('Channel duplicated', 'success'); }}>Duplicate</Button>
                <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={async () => {
                  if (await confirm({ title: `Delete ${c.name}?`, body: 'Projects of this channel are kept (they keep their own copy of the settings).', confirm: 'Delete', danger: true })) await deleteChannel(c.id);
                }}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Sheet
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.name || 'Channel'}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button variant="primary" onClick={async () => { if (edit) { await saveChannel(edit); toast('Channel saved', 'success'); setEdit(null); } }}>Save channel</Button>
          </>
        }
      >
        {edit && <ChannelForm value={edit} onChange={setEdit} />}
      </Sheet>
    </div>
  );
}
