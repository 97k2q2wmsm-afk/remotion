'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Film, Pencil } from 'lucide-react';
import { STAGE_IDS, type StageId } from '@/config/states';
import { EmptyState, Tabs, Button, AutoText, Badge } from '@/components/ui';
import { useProject } from '@/hooks/data';
import { markInterrupted } from '@/services/image-providers/queue';
import { Overview } from './Overview';
import { ScriptTab } from './ScriptTab';
import { StoryboardTab } from './StoryboardTab';
import { CharactersTab } from './CharactersTab';
import { ImagesTab } from './ImagesTab';
import { VoiceTab } from './VoiceTab';
import { ExportTab } from './ExportTab';

const TABS = ['overview', 'script', 'storyboard', 'characters', 'images', 'voice', 'export'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Production',
  script: 'Script',
  storyboard: 'Storyboard',
  characters: 'Characters',
  images: 'Images',
  voice: 'Voice',
  export: 'Export',
};
const TAB_STAGE: Partial<Record<Tab, StageId>> = { script: 'script', storyboard: 'storyboard', characters: 'characters', images: 'images', voice: 'voice', export: 'render' };

export function ProjectWorkspace({ id, tab }: { id: string | null; tab: string | null }) {
  const router = useRouter();
  const { project, loading, update } = useProject(id);
  const [current, setCurrent] = useState<Tab>((TABS as readonly string[]).includes(tab ?? '') ? (tab as Tab) : 'overview');
  useEffect(() => {
    if ((TABS as readonly string[]).includes(tab ?? '')) setCurrent(tab as Tab);
  }, [tab]);
  useEffect(() => {
    if (id) void markInterrupted(id);
  }, [id]);

  if (!id) return <EmptyState title="No project selected" action={<Link href="/projects"><Button>My projects</Button></Link>} />;
  if (loading && !project) return <div className="skeleton h-40 rounded-2xl" />;
  if (!project) return <EmptyState title="Project not found" action={<Link href="/projects"><Button>My projects</Button></Link>}>It may have been deleted.</EmptyState>;

  const go = (t: Tab) => {
    setCurrent(t);
    router.replace(`/project?id=${project.id}&tab=${t}`, { scroll: false });
  };
  const done = STAGE_IDS.filter((s) => project.stages[s].status === 'done').length;

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-start gap-2">
          <Pencil className="mt-3 size-4 shrink-0 text-muted" />
          <AutoText value={project.title} onSave={(v) => update((p) => void (p.title = v || p.title))} className="!h-auto !border-transparent !bg-transparent !px-1 text-xl font-extrabold" aria-label="Project title" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 pl-6 text-xs text-muted">
          <Badge tone="accent">{project.brief.aspect}</Badge>
          <span>{project.brief.language}</span>·<span>{project.scenes.length} scenes</span>·<span>{done}/{STAGE_IDS.length} stages done</span>
          <Link href={`/editor?project=${project.id}`} className="ml-auto">
            <Button size="sm" variant="primary" icon={<Film className="size-4" />}>Video editor</Button>
          </Link>
        </div>
      </div>
      <Tabs
        value={current}
        onChange={go}
        tabs={TABS.map((t) => ({ value: t, label: TAB_LABELS[t], badge: TAB_STAGE[t] && project.stages[TAB_STAGE[t]!].status === 'error' ? <span className="size-2 rounded-full bg-danger" /> : undefined }))}
      />
      {current === 'overview' && <Overview project={project} onOpen={(t) => go(t as Tab)} />}
      {current === 'script' && <ScriptTab project={project} update={update} />}
      {current === 'storyboard' && <StoryboardTab project={project} update={update} />}
      {current === 'characters' && <CharactersTab project={project} update={update} />}
      {current === 'images' && <ImagesTab project={project} update={update} />}
      {current === 'voice' && <VoiceTab project={project} update={update} />}
      {current === 'export' && <ExportTab project={project} />}
    </div>
  );
}

export type Updater = (fn: (p: import('@/types').Project) => import('@/types').Project | void) => Promise<void>;
