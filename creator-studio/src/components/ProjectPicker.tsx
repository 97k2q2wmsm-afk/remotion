'use client';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useProjects } from '@/hooks/data';
import { AssetImage, projectCover } from './common';
import { Button, EmptyState } from './ui';
import { formatDate } from '@/utils';

export function ProjectPicker({ base, title }: { base: string; title: string }) {
  const { data } = useProjects();
  if (!data) return <div className="skeleton h-32 rounded-2xl" />;
  if (!data.length)
    return (
      <EmptyState title="No projects yet" action={<Link href="/create"><Button variant="primary" icon={<Plus className="size-4" />}>Create a video project</Button></Link>}>
        {title} works on a video project.
      </EmptyState>
    );
  return (
    <div>
      <p className="mb-3 text-sm text-muted">Choose a project:</p>
      <div className="space-y-2">
        {data.map((p) => (
          <Link key={p.id} href={`${base}${base.includes('?') ? '&' : '?'}project=${p.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 hover:border-accent/50">
            <AssetImage id={projectCover(p)} alt="" className="size-14 rounded-xl" />
            <div className="flex-1">
              <div className="line-clamp-1 font-semibold">{p.title}</div>
              <div className="text-xs text-muted">{p.scenes.length} scenes · {formatDate(p.updatedAt)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
