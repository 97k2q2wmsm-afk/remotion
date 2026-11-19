'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Copy, FolderOpen, Import, Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, Input, PageHeader, Select } from '@/components/ui';
import { ProjectCard } from '@/components/common';
import { useFeedback } from '@/components/feedback';
import { useChannels, useProjects } from '@/hooks/data';
import { deleteProject, duplicateProject } from '@/services/storage/projects';
import { importProjectBackup } from '@/services/export/zip';
import { errorMessage } from '@/utils';

type Filter = 'all' | 'rendered' | 'in-progress' | 'empty';

export default function ProjectsPage() {
  const { data: projects } = useProjects();
  const { data: channels } = useChannels();
  const { toast, confirm } = useFeedback();
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [importing, setImporting] = useState(false);

  const list = useMemo(
    () =>
      (projects ?? []).filter((p) => {
        if (q && !`${p.title} ${p.brief.topic}`.toLowerCase().includes(q.toLowerCase())) return false;
        if (channel && p.channelId !== channel) return false;
        if (filter === 'rendered' && !p.finalVideoAssetId) return false;
        if (filter === 'in-progress' && (p.finalVideoAssetId || !p.scenes.length)) return false;
        if (filter === 'empty' && p.scenes.length) return false;
        return true;
      }),
    [projects, q, channel, filter],
  );

  const remove = async (id: string, title: string) => {
    const ok = await confirm({
      title: `Delete “${title}”?`,
      body: (
        <div className="space-y-2">
          <p>The project is removed from this device. Media used only by this project (images, audio, renders) is deleted too. Export a backup first if you may need it.</p>
        </div>
      ),
      confirm: 'Delete project and its media',
      danger: true,
    });
    if (!ok) return;
    await deleteProject(id, true);
    toast('Project deleted', 'success');
  };

  return (
    <div>
      <PageHeader
        title="My Projects"
        subtitle={`${projects?.length ?? 0} projects stored on this device`}
        icon={<FolderOpen className="size-5" />}
        actions={
          <>
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 text-[15px] font-medium">
              <Import className="size-4" /> {importing ? 'Importing…' : 'Import backup'}
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                disabled={importing}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setImporting(true);
                  try {
                    const p = await importProjectBackup(f);
                    toast(`Imported “${p.title}”`, 'success');
                  } catch (err) {
                    toast(errorMessage(err), 'error');
                  } finally {
                    setImporting(false);
                    e.target.value = '';
                  }
                }}
              />
            </label>
            <Link href="/create"><Button variant="primary" icon={<Plus className="size-4" />}>New</Button></Link>
          </>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Input placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
        <Select value={channel} onChange={setChannel} options={[{ value: '', label: 'All channels' }, ...(channels ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        <Select<Filter> value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'rendered', label: 'Rendered' }, { value: 'in-progress', label: 'In progress' }, { value: 'empty', label: 'No script yet' }]} />
      </div>
      {list.length === 0 ? (
        <EmptyState title={projects?.length ? 'No matching projects' : 'No projects yet'} action={<Link href="/create"><Button variant="primary">Create a video</Button></Link>} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => (
            <div key={p.id}>
              <ProjectCard p={p} />
              <div className="mt-1 flex justify-end gap-1">
                <Button size="sm" variant="ghost" aria-label="Duplicate" onClick={async () => { await duplicateProject(p.id); toast('Project duplicated', 'success'); }}>
                  <Copy className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove(p.id, p.title)}>
                  <Trash2 className="size-4 text-danger" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
