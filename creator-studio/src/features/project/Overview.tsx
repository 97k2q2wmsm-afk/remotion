'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2, MinusCircle, Play, RefreshCw, Square, XCircle } from 'lucide-react';
import type { Project, StageId } from '@/types';
import { STAGE_IDS, STAGE_LABELS } from '@/config/states';
import { Button, Card, ErrorNote, InfoNote, SectionTitle, Toggle } from '@/components/ui';
import { StageBadge } from '@/components/common';
import { useFeedback } from '@/components/feedback';
import { runCharacters, runConcept, runScript, runSeo, runThumbConcepts } from '@/services/ai/pipeline';
import { runFullProduction, stopProduction, subscribeProduction, type ProductionOptions, type ProductionRun } from '@/services/production';
import { errorMessage } from '@/utils';

const ACTIONS: Partial<Record<StageId, { label: string; run?: (id: string) => Promise<unknown>; tab?: string; href?: (id: string) => string }>> = {
  research: { label: 'Regenerate', run: runConcept },
  titles: { label: 'Regenerate', run: runConcept },
  structure: { label: 'Regenerate', run: runConcept },
  hook: { label: 'Regenerate', run: runConcept },
  script: { label: 'Regenerate', run: runScript },
  scenes: { label: 'Edit', tab: 'script' },
  storyboard: { label: 'Open', tab: 'storyboard' },
  characters: { label: 'Regenerate', run: runCharacters },
  prompts: { label: 'Edit', tab: 'storyboard' },
  images: { label: 'Open', tab: 'images' },
  thumbConcepts: { label: 'Regenerate', run: runThumbConcepts },
  thumbnails: { label: 'Open', href: (id) => `/thumbnails?project=${id}` },
  voice: { label: 'Open', tab: 'voice' },
  subtitles: { label: 'Open', href: (id) => `/editor?project=${id}&panel=captions` },
  sfx: { label: 'Open', href: (id) => `/editor?project=${id}&panel=audio` },
  music: { label: 'Open', href: (id) => `/editor?project=${id}&panel=audio` },
  edit: { label: 'Open', href: (id) => `/editor?project=${id}` },
  render: { label: 'Open', href: (id) => `/editor?project=${id}&panel=render` },
  seo: { label: 'Regenerate', run: runSeo },
  package: { label: 'Open', tab: 'export' },
};

export function Overview({ project, onOpen }: { project: Project; onOpen: (tab: string) => void }) {
  const { toast, confirm } = useFeedback();
  const [run, setRun] = useState<ProductionRun | null>(null);
  const [busy, setBusy] = useState<StageId | null>(null);
  const [opts, setOpts] = useState<ProductionOptions>({ images: true, voice: true, thumbnail: true, edit: true, render: false });
  useEffect(() => {
    const off = subscribeProduction(setRun);
    return () => {
      off();
    };
  }, []);
  const mine = run?.projectId === project.id ? run : null;

  const act = async (s: StageId) => {
    const a = ACTIONS[s];
    if (!a) return;
    if (a.run) {
      if (s === 'script' && project.scenes.length && !(await confirm({ title: 'Rewrite the script?', body: 'The current scenes are replaced. Images and narration already generated stay in the project library but are detached from the new scenes.', confirm: 'Rewrite' }))) return;
      setBusy(s);
      try {
        await a.run(project.id);
        toast(`${STAGE_LABELS[s]} updated`, 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setBusy(null);
      }
    } else if (a.tab) onOpen(a.tab);
  };

  const startAll = async () => {
    if (project.scenes.length && !(await confirm({ title: 'Run the full production again?', body: 'Concept, script and all text stages are regenerated; only scenes without images/narration get new ones.', confirm: 'Run' }))) return;
    void runFullProduction(project.id, opts).catch((e) => toast(errorMessage(e), 'error'));
  };

  const icon = (st: string) =>
    st === 'running' ? <Loader2 className="size-5 animate-spin text-accent-2" /> : st === 'done' ? <CheckCircle2 className="size-5 text-success" /> : st === 'error' ? <XCircle className="size-5 text-danger" /> : st === 'skipped' ? <MinusCircle className="size-5 text-warning" /> : <Circle className="size-5 text-muted" />;

  return (
    <div className="space-y-4">
      {mine && (
        <Card className="glow">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-bold">{mine.running ? 'Producing your video…' : 'Production run finished'}</div>
            {mine.running && (
              <Button size="sm" variant="danger" icon={<Square className="size-4" />} onClick={stopProduction}>
                Stop
              </Button>
            )}
          </div>
          <ol className="space-y-2.5">
            {mine.steps.map((s) => (
              <li key={s.id} className="flex gap-3">
                {icon(s.status)}
                <div className="flex-1">
                  <div className="text-sm font-semibold">{s.label}</div>
                  {s.message && <div className={`text-xs ${s.status === 'error' ? 'text-danger' : 'text-muted'}`}>{s.message}</div>}
                </div>
              </li>
            ))}
          </ol>
          {mine.running && <p className="mt-3 text-xs text-muted">Keep the app open in the foreground: iOS pauses web apps in the background.</p>}
        </Card>
      )}

      {!mine?.running && (
        <Card>
          <div className="mb-2 font-bold">Full automatic production</div>
          <div className="mb-3 space-y-0.5">
            <Toggle checked={opts.images} onChange={(v) => setOpts({ ...opts, images: v })} label="Scene images" />
            <Toggle checked={opts.thumbnail} onChange={(v) => setOpts({ ...opts, thumbnail: v })} label="Thumbnail" />
            <Toggle checked={opts.voice} onChange={(v) => setOpts({ ...opts, voice: v })} label="Voice-over" />
            <Toggle checked={opts.edit} onChange={(v) => setOpts({ ...opts, edit: v })} label="Automatic edit" />
            <Toggle checked={opts.render} onChange={(v) => setOpts({ ...opts, render: v })} label="Render MP4" />
          </div>
          <Button variant="primary" icon={<Play className="size-4" />} onClick={startAll}>
            {project.scenes.length ? 'Run full production again' : 'Run full production'}
          </Button>
        </Card>
      )}

      {project.concept?.factsNote && <InfoNote tone="warning">Fact check: {project.concept.factsNote}</InfoNote>}

      <SectionTitle>Production stages</SectionTitle>
      <div className="space-y-2">
        {STAGE_IDS.map((s, i) => {
          const st = project.stages[s];
          const a = ACTIONS[s];
          return (
            <Card key={s} className="flex items-center gap-3 p-3">
              <span className="w-6 text-center text-xs font-bold tabular-nums text-muted">{i + 1}</span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {STAGE_LABELS[s]} <StageBadge status={st.status} />
                </div>
                {st.error && <div className="mt-0.5 text-xs text-danger">{st.error}</div>}
              </div>
              {a &&
                (a.href ? (
                  <Link href={a.href(project.id)}>
                    <Button size="sm">{a.label}</Button>
                  </Link>
                ) : (
                  <Button size="sm" loading={busy === s} disabled={!!busy || mine?.running} icon={a.run ? <RefreshCw className="size-3.5" /> : undefined} onClick={() => act(s)}>
                    {a.label}
                  </Button>
                ))}
            </Card>
          );
        })}
      </div>
      {Object.values(project.stages).some((s) => s.status === 'error') && <ErrorNote>Some stages failed. Each can be retried on its own — nothing is retried automatically.</ErrorNote>}
    </div>
  );
}
