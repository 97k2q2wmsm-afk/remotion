'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LayoutTemplate } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { ProjectPicker } from '@/components/ProjectPicker';
import { useProject } from '@/hooks/data';
import { ThumbnailEditor } from '@/features/thumbnail/ThumbnailEditor';

function Inner() {
  const id = useSearchParams().get('project');
  const { project, update } = useProject(id);
  if (!id) return <ProjectPicker base="/thumbnails" title="Thumbnail Studio" />;
  if (!project) return <div className="skeleton h-40 rounded-2xl" />;
  return (
    <>
      <div className="mb-3 line-clamp-1 text-lg font-extrabold">{project.title}</div>
      <ThumbnailEditor key={project.id} project={project} update={update} />
    </>
  );
}

export default function ThumbnailsPage() {
  return (
    <div>
      <PageHeader title="Thumbnail Studio" subtitle="1280×720 layered editor with AI concepts." icon={<LayoutTemplate className="size-5" />} />
      <Suspense fallback={<div className="skeleton h-40 rounded-2xl" />}>
        <Inner />
      </Suspense>
    </div>
  );
}
