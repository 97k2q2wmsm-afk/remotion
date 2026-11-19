'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProjectWorkspace } from '@/features/project/Workspace';

function Inner() {
  const q = useSearchParams();
  return <ProjectWorkspace id={q.get('id')} tab={q.get('tab')} />;
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 rounded-2xl" />}>
      <Inner />
    </Suspense>
  );
}
