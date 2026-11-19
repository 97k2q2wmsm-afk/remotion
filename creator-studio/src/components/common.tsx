'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Film, ImageIcon } from 'lucide-react';
import type { Project, StageStatus } from '@/types';
import { STAGE_STATUS_LABELS } from '@/config/states';
import { useAssetUrl } from '@/hooks/data';
import { imageQueue, type QueueSnapshot } from '@/services/image-providers/queue';
import { subscribeRender, type ActiveRender } from '@/services/rendering/renderManager';
import { Badge, cn, type Tone } from './ui';

export const STAGE_TONE: Record<StageStatus, Tone> = { pending: 'neutral', running: 'info', done: 'success', error: 'danger', skipped: 'warning' };

export function StageBadge({ status }: { status: StageStatus }) {
  return <Badge tone={STAGE_TONE[status]}>{STAGE_STATUS_LABELS[status]}</Badge>;
}

export function AssetImage({ id, alt, className, fallback }: { id?: string; alt: string; className?: string; fallback?: React.ReactNode }) {
  const url = useAssetUrl(id);
  if (!id || !url)
    return <div className={cn('grid place-items-center bg-surface-2 text-muted', className)}>{fallback ?? <ImageIcon className="size-6 opacity-50" />}</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={cn('object-cover', className)} loading="lazy" decoding="async" />;
}

export function projectCover(p: Project): string | undefined {
  return p.thumbExports[0] ?? p.scenes.find((s) => s.imageAssetId)?.imageAssetId;
}

export function projectProgress(p: Project): number {
  const vals = Object.values(p.stages);
  return vals.filter((s) => s.status === 'done' || s.status === 'skipped').length / vals.length;
}

export function ProjectCard({ p, href }: { p: Project; href?: string }) {
  const pct = projectProgress(p);
  return (
    <Link href={href ?? `/project?id=${p.id}`} className="group block overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-accent/50">
      <div className={cn('relative w-full overflow-hidden', p.brief.aspect === '9:16' ? 'aspect-[4/5]' : 'aspect-video')}>
        <AssetImage id={projectCover(p)} alt={p.title} className="size-full transition group-hover:scale-105" fallback={<Film className="size-8 opacity-40" />} />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10">
          <div className="line-clamp-2 text-sm font-bold text-white">{p.title}</div>
        </div>
        {p.finalVideoAssetId && <Badge tone="success" className="absolute left-2 top-2">MP4 ready</Badge>}
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${pct * 100}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted">{Math.round(pct * 100)}%</span>
      </div>
    </Link>
  );
}

export function useImageQueue() {
  const [snap, setSnap] = useState<QueueSnapshot>(imageQueue.snapshot());
  useEffect(() => {
    const off = imageQueue.subscribe(setSnap);
    return () => {
      off();
    };
  }, []);
  return snap;
}

export function useActiveRender() {
  const [r, setR] = useState<ActiveRender | null>(null);
  useEffect(() => {
    const off = subscribeRender(setR);
    return () => {
      off();
    };
  }, []);
  return r;
}
