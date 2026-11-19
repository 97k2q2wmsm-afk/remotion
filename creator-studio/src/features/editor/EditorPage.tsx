'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Film, Redo2, Ruler, Undo2, Wand2 } from 'lucide-react';
import type { EditMode, Project, RenderSettings, Timeline } from '@/types';
import { EDIT_MODES, EDIT_MODE_LABELS } from '@/config/states';
import { Button, Card, EmptyState, InfoNote, PageHeader, Tabs, cn } from '@/components/ui';
import { ProjectPicker } from '@/components/ProjectPicker';
import { useFeedback } from '@/components/feedback';
import { useProject } from '@/hooks/data';
import { buildTimeline } from '@/services/timeline/autoEdit';
import { getChannel } from '@/services/storage/channels';
import { renderProject } from '@/services/rendering/renderManager';
import { errorMessage, isAbort } from '@/utils';
import { Player, type PlayerHandle } from './Player';
import { TimelineView, type Selection } from './TimelineView';
import { Inspector } from './Inspector';
import { AudioPanel, CaptionsPanel, RenderPanel, TextPanel } from './Panels';
import { fitToNarration, moveClip } from './ops';

const PANELS = ['edit', 'captions', 'audio', 'text', 'render'] as const;
type Panel = (typeof PANELS)[number];
const PANEL_LABELS: Record<Panel, string> = { edit: 'Inspector', captions: 'Subtitles', audio: 'Audio', text: 'Text & transitions', render: 'QC & Render' };

export function EditorPage({ projectId, panel }: { projectId: string | null; panel: string | null }) {
  const { project, update } = useProject(projectId);
  if (!projectId) {
    return (
      <div>
        <PageHeader title="Video Editor" subtitle="Automatic edit, multi-track timeline and MP4 rendering." icon={<Film className="size-5" />} />
        <ProjectPicker base="/editor" title="The editor" />
      </div>
    );
  }
  if (!project) return <div className="skeleton h-64 rounded-2xl" />;
  return <Editor key={project.id} project={project} update={update} initialPanel={(PANELS as readonly string[]).includes(panel ?? '') ? (panel as Panel) : 'edit'} />;
}

function Editor({ project, update, initialPanel }: { project: Project; update: (fn: (p: Project) => Project | void) => Promise<void>; initialPanel: Panel }) {
  const { toast, confirm } = useFeedback();
  const mode = project.editMode;
  const stored = project.timelines[mode];
  const [tl, setTl] = useState<Timeline | undefined>(stored);
  const [time, setTime] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [building, setBuilding] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const past = useRef<Timeline[]>([]);
  const future = useRef<Timeline[]>([]);
  const savedAt = useRef(stored?.updatedAt ?? 0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const player = useRef<PlayerHandle>(null);
  const [, force] = useState(0);

  // Adopt timelines written elsewhere (auto production, other tab) when we have no unsaved edits.
  useEffect(() => {
    if (stored && stored.updatedAt !== savedAt.current && !saveTimer.current) {
      savedAt.current = stored.updatedAt;
      setTl(stored);
    }
    if (!stored && !saveTimer.current) setTl(undefined);
  }, [stored]);

  const persist = useCallback(
    (t: Timeline, m: EditMode) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        saveTimer.current = undefined;
        savedAt.current = t.updatedAt;
        await update((p) => {
          p.timelines[m] = t;
          p.stages.edit = { status: 'done', updatedAt: Date.now() };
        });
      }, 500);
    },
    [update],
  );
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const change = useCallback(
    (t: Timeline) => {
      if (!tl) return;
      past.current = [...past.current.slice(-49), tl];
      future.current = [];
      const next = { ...t, updatedAt: Date.now() };
      setTl(next);
      persist(next, mode);
    },
    [tl, persist, mode],
  );
  const undo = () => {
    const prev = past.current.pop();
    if (!prev || !tl) return;
    future.current.push(tl);
    const next = { ...prev, updatedAt: Date.now() };
    setTl(next);
    persist(next, mode);
    force((x) => x + 1);
  };
  const redo = () => {
    const nxt = future.current.pop();
    if (!nxt || !tl) return;
    past.current.push(tl);
    const next = { ...nxt, updatedAt: Date.now() };
    setTl(next);
    persist(next, mode);
    force((x) => x + 1);
  };

  const switchMode = async (m: EditMode) => {
    if (m === mode || switching) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    // Block editing until the new mode's timeline is loaded, so no edit lands on the old mode.
    setSwitching(true);
    setSelection(null);
    try {
      await update((p) => {
        if (tl) p.timelines[mode] = tl; // keep the edits of the mode we leave
        if (m === 'manual' && !p.timelines.manual && tl) p.timelines.manual = { ...structuredClone(tl), updatedAt: Date.now() };
        p.editMode = m;
      });
    } finally {
      past.current = [];
      future.current = [];
      setSwitching(false);
    }
  };

  /** Writes any pending edit immediately (used before rendering). */
  const flush = useCallback(async () => {
    if (!saveTimer.current || !tl) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    savedAt.current = tl.updatedAt;
    await update((p) => {
      p.timelines[mode] = tl;
    });
  }, [tl, mode, update]);

  const autoBuild = async (thenRender: boolean) => {
    await flush();
    if (tl && !(await confirm({ title: `Rebuild the ${EDIT_MODE_LABELS[mode === 'manual' ? 'auto' : mode].title}?`, body: 'The timeline of this mode is rebuilt from the scenes. Other modes keep their edits. You can undo.', confirm: 'Rebuild' }))) return;
    setBuilding(true);
    try {
      const m = mode === 'manual' ? 'auto' : mode;
      const { timeline, notes } = await buildTimeline(project, m, await getChannel(project.channelId));
      setNotes(notes);
      if (tl) past.current.push(tl);
      savedAt.current = timeline.updatedAt;
      setTl(timeline);
      await update((p) => {
        p.editMode = m;
        p.timelines[m] = timeline;
        const at = Date.now();
        p.stages.edit = { status: 'done', updatedAt: at };
        p.stages.music = { status: timeline.music.length ? 'done' : 'skipped', updatedAt: at };
        p.stages.sfx = { status: 'done', updatedAt: at };
        p.stages.subtitles = timeline.captions.length ? { status: 'done', updatedAt: at } : { status: 'skipped', error: 'No narration audio', updatedAt: at };
      });
      if (thenRender) {
        setPanel('render');
        try {
          await renderProject(project.id);
          toast('Your MP4 is ready!', 'success');
        } catch (e) {
          if (!isAbort(e)) toast(errorMessage(e), 'error');
        }
      } else toast('Edit created', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBuilding(false);
    }
  };

  const setRender = (s: Partial<RenderSettings>) => update((p) => void (p.render = { ...p.render, ...s }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={`/project?id=${project.id}`} className="line-clamp-1 flex-1 text-lg font-extrabold hover:text-accent">{project.title}</Link>
        <Button size="sm" variant="ghost" aria-label="Undo" disabled={!past.current.length} onClick={undo}><Undo2 className="size-4" /></Button>
        <Button size="sm" variant="ghost" aria-label="Redo" disabled={!future.current.length} onClick={redo}><Redo2 className="size-4" /></Button>
      </div>
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {EDIT_MODES.map((m) => (
          <button key={m} onClick={() => switchMode(m)} className={cn('min-w-44 shrink-0 rounded-2xl border p-3 text-left transition', m === mode ? 'border-accent bg-accent/10' : 'border-line bg-surface')}>
            <div className="text-sm font-bold">{EDIT_MODE_LABELS[m].title}</div>
            <div className="text-xs text-muted">{project.timelines[m] ? 'Edit saved' : 'Not created yet'}</div>
          </button>
        ))}
      </div>
      <p className="mb-3 text-xs text-muted">{EDIT_MODE_LABELS[mode].description}</p>

      {!project.scenes.length ? (
        <EmptyState title="No scenes to edit">Create the script and scenes first.</EmptyState>
      ) : (
        <>
          <Button variant="primary" size="lg" className="mb-2 w-full" loading={building} icon={<Wand2 className="size-5" />} onClick={() => autoBuild(true)}>
            CREATE MY VIDEO AUTOMATICALLY
          </Button>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" disabled={building} onClick={() => autoBuild(false)}>{tl ? 'Rebuild edit only' : 'Build edit (no render)'}</Button>
            {tl && <Button size="sm" icon={<Ruler className="size-4" />} onClick={() => change(fitToNarration(tl))}>Fit clips to narration</Button>}
          </div>
          {notes.length > 0 && <div className="mb-3 space-y-1">{notes.map((n) => <InfoNote key={n} tone="warning">{n}</InfoNote>)}</div>}
        </>
      )}

      {switching && <div className="skeleton h-64 rounded-2xl" />}
      {tl && !switching && (
        <div className="space-y-4">
          <Player ref={player} timeline={tl} time={time} onTime={setTime} />
          <TimelineView
            timeline={tl}
            time={time}
            selection={selection}
            onSelect={(s) => {
              setSelection(s);
              setPanel('edit');
            }}
            onSeek={(t) => player.current?.seek(t)}
            onReorder={(from, to) => change(moveClip(tl, from, to))}
          />
          <Tabs value={panel} onChange={setPanel} tabs={PANELS.map((p) => ({ value: p, label: PANEL_LABELS[p] }))} />
          {panel === 'edit' && <Inspector project={project} timeline={tl} selection={selection} onChange={change} onSelect={setSelection} onPreview={(t) => player.current?.play(t)} />}
          {panel === 'captions' && <CaptionsPanel project={project} timeline={tl} onChange={change} />}
          {panel === 'audio' && <AudioPanel project={project} timeline={tl} onChange={change} time={time} />}
          {panel === 'text' && <TextPanel timeline={tl} onChange={change} time={time} />}
          {panel === 'render' && <RenderPanel project={project} timeline={tl} onSettings={setRender} beforeRender={flush} />}
        </div>
      )}
      {!tl && project.scenes.length > 0 && <Card className="text-sm text-muted">No edit for this mode yet. Press the button above to create it from your scenes, images and narration.</Card>}
    </div>
  );
}
