'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { EditorPage } from '@/features/editor/EditorPage';

function Inner() {
  const q = useSearchParams();
  return <EditorPage projectId={q.get('project')} panel={q.get('panel')} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}>
      <Inner />
    </Suspense>
  );
}
