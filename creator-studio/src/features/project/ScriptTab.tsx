'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Lock, Plus, RefreshCw, Trash2, Unlock, Wand2 } from 'lucide-react';
import type { Project, Scene } from '@/types';
import { FACT_STATUSES, FACT_STATUS_LABELS, MOTION_LABELS, MOTION_TYPES, TRANSITION_LABELS, TRANSITION_TYPES } from '@/config/states';
import { AutoText, Badge, Button, Card, CopyButton, EmptyState, Field, Input, SectionTitle, Select } from '@/components/ui';
import { StageBadge } from '@/components/common';
import { useFeedback } from '@/components/feedback';
import { regenerateScene, retimeScenes, runConcept, runScript } from '@/services/ai/pipeline';
import { normalizeScene } from '@/services/ai/parse';
import { errorMessage, estimateNarrationSeconds, formatTime, wordCount } from '@/utils';
import type { Updater } from './Workspace';

export function patchScene(update: Updater, id: string, patch: Partial<Scene>) {
  return update((p) => {
    p.scenes = p.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s));
    if ('narration' in patch) {
      const s = p.scenes.find((x) => x.id === id);
      if (s && s.audioAssetId) {
        // Narration text changed: the old audio no longer matches it.
        s.audioAssetId = undefined;
        s.audioDuration = undefined;
      }
    }
    p.scenes = retimeScenes(p);
  });
}

export function ScriptTab({ project, update }: { project: Project; update: Updater }) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const [instr, setInstr] = useState<Record<string, string>>({});
  const full = project.scenes.map((s) => s.narration).join('\n\n');
  const total = project.scenes.reduce((a, s) => a + s.duration, 0);
  const est = estimateNarrationSeconds(full, project.brief.language, project.voice.speed);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const move = (i: number, d: -1 | 1) =>
    update((p) => {
      const j = i + d;
      if (j < 0 || j >= p.scenes.length) return;
      [p.scenes[i], p.scenes[j]] = [p.scenes[j], p.scenes[i]];
      p.scenes = retimeScenes(p);
    });

  const add = (i: number) =>
    update((p) => {
      const s = normalizeScene({ narration: '', visual: '', imagePrompt: '' }, i + 1);
      p.scenes.splice(i + 1, 0, s);
      p.scenes = retimeScenes(p);
    });

  const remove = async (s: Scene) => {
    if (!(await confirm({ title: `Delete scene ${s.number}?`, body: 'Its image and narration stay in the project library.', confirm: 'Delete', danger: true }))) return;
    await update((p) => {
      p.scenes = p.scenes.filter((x) => x.id !== s.id);
      p.scenes = retimeScenes(p);
    });
  };

  return (
    <div className="space-y-4">
      <SectionTitle action={<Button size="sm" loading={busy === 'concept'} icon={<RefreshCw className="size-3.5" />} onClick={() => run('concept', () => runConcept(project.id))}>Regenerate</Button>}>
        Concept & research
      </SectionTitle>
      {project.concept ? (
        <Card className="space-y-3 text-sm">
          <div>
            <div className="mb-1 font-bold">Concept</div>
            <p className="text-ink/90">{project.concept.concept}</p>
          </div>
          <div>
            <div className="mb-1 font-bold">Hook</div>
            <p className="text-ink/90">“{project.concept.hook}”</p>
          </div>
          {project.concept.titleIdeas.length > 0 && (
            <div>
              <div className="mb-1 font-bold">Title ideas</div>
              <ol className="list-inside list-decimal space-y-0.5 text-ink/90">{project.concept.titleIdeas.map((t) => <li key={t}>{t}</li>)}</ol>
            </div>
          )}
          {project.concept.structure.length > 0 && (
            <div>
              <div className="mb-1 font-bold">Story structure</div>
              <ul className="space-y-1">{project.concept.structure.map((s, i) => <li key={i}><b>{s.part}:</b> {s.summary}</li>)}</ul>
            </div>
          )}
          {project.concept.research && (
            <details>
              <summary className="cursor-pointer font-bold">Research notes</summary>
              <p className="mt-1 whitespace-pre-wrap text-ink/80">{project.concept.research}</p>
            </details>
          )}
          {(project.concept.verifiedFacts.length > 0 || project.concept.fictionalElements.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-success/10 p-3">
                <div className="mb-1 text-xs font-bold uppercase text-success">Facts (AI-reported — verify before publishing)</div>
                <ul className="list-inside list-disc space-y-0.5 text-xs">{project.concept.verifiedFacts.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
              <div className="rounded-xl bg-warning/10 p-3">
                <div className="mb-1 text-xs font-bold uppercase text-warning">Dramatized / fictional</div>
                <ul className="list-inside list-disc space-y-0.5 text-xs">{project.concept.fictionalElements.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <EmptyState title="No concept yet" action={<Button variant="primary" loading={busy === 'concept'} icon={<Wand2 className="size-4" />} onClick={() => run('concept', () => runConcept(project.id))}>Generate concept</Button>}>
          Research, titles, structure and hook. <StageBadge status={project.stages.research.status} />
        </EmptyState>
      )}

      <SectionTitle
        action={
          <Button size="sm" loading={busy === 'script'} icon={<RefreshCw className="size-3.5" />} onClick={async () => {
            if (project.scenes.length && !(await confirm({ title: 'Rewrite the whole script?', body: 'All scenes are replaced.', confirm: 'Rewrite' }))) return;
            void run('script', () => runScript(project.id));
          }}>
            {project.scenes.length ? 'Rewrite script' : 'Generate script'}
          </Button>
        }
      >
        Full narration
      </SectionTitle>
      {project.stages.script.error && <div className="text-sm text-danger">{project.stages.script.error}</div>}
      {project.scenes.length > 0 && (
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted">
              {wordCount(full)} words · estimated narration {formatTime(est)} · timeline {formatTime(total)} (target {formatTime(project.brief.targetDuration)})
            </span>
            <CopyButton text={full} label="Copy narration" />
          </div>
          <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-sm leading-relaxed">{full}</pre>
        </Card>
      )}

      <SectionTitle action={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => add(project.scenes.length - 1)}>Add scene</Button>}>
        Scenes ({project.scenes.length})
      </SectionTitle>
      {project.scenes.length === 0 && <EmptyState title="No scenes yet">Generate the script with AI or add scenes manually.</EmptyState>}
      <div className="space-y-3">
        {project.scenes.map((s, i) => (
          <Card key={s.id} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">Scene {s.number}</Badge>
              <span className="text-xs tabular-nums text-muted">
                {formatTime(s.start, true)} – {formatTime(s.end, true)}
              </span>
              {s.audioDuration ? <Badge tone="success">voice {s.audioDuration.toFixed(1)}s</Badge> : <Badge>estimated</Badge>}
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
                <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === project.scenes.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
                <Button size="sm" variant="ghost" aria-label="Add scene after" onClick={() => add(i)}><Plus className="size-4" /></Button>
                <Button size="sm" variant="ghost" aria-label="Delete scene" onClick={() => remove(s)}><Trash2 className="size-4 text-danger" /></Button>
              </div>
            </div>
            <Field label="Narrator text">
              <AutoText multiline rows={3} value={s.narration} onSave={(v) => patchScene(update, s.id, { narration: v })} />
            </Field>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-accent">Visual, prompt, camera & timing</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Visual description" className="sm:col-span-2">
                  <AutoText multiline rows={2} value={s.visual} onSave={(v) => patchScene(update, s.id, { visual: v })} />
                </Field>
                <Field label="Image prompt" className="sm:col-span-2">
                  <AutoText multiline rows={3} value={s.imagePrompt} onSave={(v) => patchScene(update, s.id, { imagePrompt: v })} />
                </Field>
                <Field label="Negative prompt" className="sm:col-span-2">
                  <AutoText value={s.negativePrompt} onSave={(v) => patchScene(update, s.id, { negativePrompt: v })} />
                </Field>
                <Field label="Camera movement">
                  <Select value={s.camera} onChange={(v) => patchScene(update, s.id, { camera: v })} options={MOTION_TYPES.map((m) => ({ value: m, label: MOTION_LABELS[m] }))} />
                </Field>
                <Field label="Transition into scene">
                  <Select value={s.transition} onChange={(v) => patchScene(update, s.id, { transition: v })} options={TRANSITION_TYPES.map((m) => ({ value: m, label: TRANSITION_LABELS[m] }))} />
                </Field>
                <Field label="Characters">
                  <AutoText value={s.characters.join(', ')} onSave={(v) => patchScene(update, s.id, { characters: v.split(',').map((x) => x.trim()).filter(Boolean) })} />
                </Field>
                <Field label="Environment">
                  <AutoText value={s.environment} onSave={(v) => patchScene(update, s.id, { environment: v })} />
                </Field>
                <Field label="Sound effect suggestions">
                  <AutoText value={s.sfx.join(', ')} onSave={(v) => patchScene(update, s.id, { sfx: v.split(',').map((x) => x.trim()).filter(Boolean) })} />
                </Field>
                <Field label="Fact status">
                  <Select value={s.factStatus} onChange={(v) => patchScene(update, s.id, { factStatus: v })} options={FACT_STATUSES.map((f) => ({ value: f, label: FACT_STATUS_LABELS[f] }))} />
                </Field>
                <Field label="Duration (seconds)" hint={s.durationLocked ? 'Locked by you' : 'Automatic from narration'}>
                  <div className="flex gap-2">
                    <Input type="number" step={0.1} min={0.5} value={s.duration} onChange={(e) => patchScene(update, s.id, { duration: Number(e.target.value) || 0.5, durationLocked: true })} />
                    <Button aria-label={s.durationLocked ? 'Unlock duration' : 'Lock duration'} onClick={() => patchScene(update, s.id, { durationLocked: !s.durationLocked })}>
                      {s.durationLocked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                    </Button>
                  </div>
                </Field>
              </div>
            </details>
            <div className="flex gap-2">
              <Input placeholder="Rewrite instruction (optional), e.g. more suspense" value={instr[s.id] ?? ''} onChange={(e) => setInstr({ ...instr, [s.id]: e.target.value })} />
              <Button loading={busy === s.id} icon={<Wand2 className="size-4" />} onClick={() => run(s.id, () => regenerateScene(project.id, s.id, instr[s.id] ?? ''))}>
                Regenerate
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
