'use client';
import { useState } from 'react';
import { ImagePlus, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import type { Character, Project } from '@/types';
import { AssetImage } from '@/components/common';
import { AutoText, Button, Card, EmptyState, Field, InfoNote } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { runCharacters } from '@/services/ai/pipeline';
import { saveAsset } from '@/services/storage/assets';
import { getChannel, saveChannel } from '@/services/storage/channels';
import { resizeImage, imageDimensions } from '@/services/media/image';
import { errorMessage, uid } from '@/utils';
import type { Updater } from './Workspace';

const FIELDS: { key: keyof Character; label: string }[] = [
  { key: 'face', label: 'Face' },
  { key: 'hair', label: 'Hair' },
  { key: 'clothing', label: 'Clothing' },
  { key: 'age', label: 'Age appearance' },
  { key: 'body', label: 'Body proportions' },
  { key: 'features', label: 'Distinguishing features' },
  { key: 'style', label: 'Visual style' },
];

export function CharacterEditor({ c, onChange, onDelete, projectId }: { c: Character; onChange: (patch: Partial<Character>) => void; onDelete: () => void; projectId?: string }) {
  const upload = async (f?: File) => {
    if (!f) return;
    const small = await resizeImage(f, 1024);
    const meta = await saveAsset({ projectId, kind: 'character-image', name: `character_${c.name || 'ref'}.jpg`, blob: small, ...(await imageDimensions(small)), source: 'upload' });
    onChange({ referenceAssetId: meta.id });
  };
  return (
    <Card className="space-y-3">
      <div className="flex gap-3">
        <label className="relative block size-24 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-line">
          <AssetImage id={c.referenceAssetId} alt={c.name} className="size-full" fallback={<ImagePlus className="size-6" />} />
          <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        <div className="flex-1 space-y-2">
          <Field label="Name">
            <AutoText value={c.name} onSave={(v) => onChange({ name: v })} />
          </Field>
          <div className="flex gap-2">
            <Field label="Seed (optional)" className="flex-1">
              <AutoText value={c.seed?.toString() ?? ''} onSave={(v) => onChange({ seed: v ? Number(v) || undefined : undefined })} />
            </Field>
            <Button variant="ghost" className="self-end" aria-label="Delete character" onClick={onDelete}>
              <Trash2 className="size-4 text-danger" />
            </Button>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <AutoText value={String(c[f.key] ?? '')} onSave={(v) => onChange({ [f.key]: v } as Partial<Character>)} />
          </Field>
        ))}
      </div>
    </Card>
  );
}

export function CharactersTab({ project, update }: { project: Project; update: Updater }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const patch = (id: string, p: Partial<Character>) =>
    update((d) => {
      d.characters = d.characters.map((c) => (c.id === id ? { ...c, ...p } : c));
    });
  return (
    <div className="space-y-3">
      <InfoNote>
        Character descriptions are added to every scene prompt that mentions the character. A reference image is sent as image-to-image input only to providers that support it (ComfyUI, Cloudflare img2img); others rely on the text description and seed. Perfect consistency is not guaranteed by any provider.
      </InfoNote>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={busy}
          icon={<Wand2 className="size-4" />}
          onClick={async () => {
            setBusy(true);
            try {
              await runCharacters(project.id);
            } catch (e) {
              toast(errorMessage(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Detect characters with AI
        </Button>
        <Button icon={<Plus className="size-4" />} onClick={() => update((d) => void d.characters.push({ id: uid('chr'), name: 'New character', face: '', hair: '', clothing: '', age: '', body: '', features: '', style: '' }))}>
          Add character
        </Button>
        {project.channelId && project.characters.length > 0 && (
          <Button
            icon={<Save className="size-4" />}
            onClick={async () => {
              const ch = await getChannel(project.channelId);
              if (!ch) return;
              const names = new Set(ch.characters.map((c) => c.name.toLowerCase()));
              ch.characters = [...ch.characters.map((c) => project.characters.find((p) => p.name.toLowerCase() === c.name.toLowerCase()) ?? c), ...project.characters.filter((c) => !names.has(c.name.toLowerCase()))];
              await saveChannel(ch);
              toast(`Saved ${project.characters.length} character(s) to ${ch.name}`, 'success');
            }}
          >
            Save to channel
          </Button>
        )}
      </div>
      {project.characters.length === 0 && <EmptyState title="No characters">Add recurring characters so every scene draws them the same way.</EmptyState>}
      {project.characters.map((c) => (
        <CharacterEditor key={c.id} c={c} projectId={project.id} onChange={(p) => patch(c.id, p)} onDelete={() => update((d) => void (d.characters = d.characters.filter((x) => x.id !== c.id)))} />
      ))}
    </div>
  );
}
