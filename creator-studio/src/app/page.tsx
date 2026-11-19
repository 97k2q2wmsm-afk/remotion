'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Clapperboard, Cpu, Database, Download, Film, FolderOpen, ImageIcon, LayoutTemplate, Plus, Search, Sparkles, Tv, Wand2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ProgressBar, SectionTitle, Stat } from '@/components/ui';
import { ProjectCard, useActiveRender, useImageQueue } from '@/components/common';
import { useLive, useProjects, useProviders } from '@/hooks/data';
import { listAssets } from '@/services/storage/assets';
import { storageEstimate } from '@/services/storage/db';
import { listUsage } from '@/services/storage/settings';
import { adapterInfo } from '@/config/providers';
import { PROVIDER_KIND_LABELS, PROVIDER_BILLING_LABELS, RENDER_STATUS_LABELS } from '@/config/states';
import { formatBytes, formatDate } from '@/utils';

export default function Dashboard() {
  const { data: projects } = useProjects();
  const { data: providers } = useProviders();
  const { data: videos } = useLive(() => listAssets({ kind: 'video' }), [], ['assets']);
  const { data: usage } = useLive(listUsage, [], ['usage']);
  const queue = useImageQueue();
  const render = useActiveRender();
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  useEffect(() => {
    storageEstimate().then(setStorage);
  }, [projects?.length, videos?.length]);

  const list = projects ?? [];
  const images = list.reduce((a, p) => a + p.scenes.filter((s) => s.imageAssetId).length, 0);
  const renders = list.reduce((a, p) => a + p.renders.filter((r) => r.status === 'completed').length, 0);
  const activeQueue = queue.items.filter((i) => i.status === 'queued' || i.status === 'generating');
  const doneQueue = queue.items.filter((i) => i.status === 'done').length;
  const failedQueue = queue.items.filter((i) => i.status === 'failed').length;

  return (
    <div>
      <section className="relative mb-6 overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-accent/25 via-surface to-accent-2/15 p-5 sm:p-7">
        <div className="absolute -right-10 -top-10 size-48 rounded-full bg-accent/30 blur-3xl" />
        <div className="relative">
          <Badge tone="accent">
            <Sparkles className="size-3" /> Your production company
          </Badge>
          <h1 className="mt-3 font-display text-4xl leading-none tracking-wide sm:text-5xl">
            IDEA <span className="gradient-text">→</span> FINISHED VIDEO
          </h1>
          <p className="mt-2 max-w-lg text-sm text-muted">Script, storyboard, scene images, voice-over, subtitles, automatic edit and a downloadable MP4 — from one idea.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/create">
              <Button variant="primary" size="lg" icon={<Plus className="size-5" />}>
                New video project
              </Button>
            </Link>
            <Link href="/projects">
              <Button size="lg" icon={<FolderOpen className="size-5" />}>
                Projects
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Projects" value={list.length} icon={<Clapperboard className="size-3.5" />} />
        <Stat label="Scene images" value={images} icon={<ImageIcon className="size-3.5" />} />
        <Stat label="Rendered MP4s" value={renders} icon={<Film className="size-3.5" />} />
        <Stat
          label="Storage"
          value={storage ? formatBytes(storage.usage) : '—'}
          icon={<Database className="size-3.5" />}
          hint={storage ? `of ${formatBytes(storage.quota)} · ${storage.persisted ? 'persistent' : 'may be evicted by iOS'}` : undefined}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold">
              <ImageIcon className="size-4 text-accent" /> Image generation
            </div>
            <Badge tone={activeQueue.length ? 'info' : 'neutral'}>{activeQueue.length ? (queue.paused ? 'Paused' : 'Running') : 'Idle'}</Badge>
          </div>
          {queue.items.length ? (
            <>
              <ProgressBar value={(doneQueue + failedQueue) / queue.items.length} />
              <div className="mt-2 text-sm text-muted">
                {doneQueue} done · {activeQueue.length} pending · {failedQueue} failed
                {queue.waitingUntil && ' · waiting for rate limit'}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted">No images in the queue.</div>
          )}
        </Card>
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold">
              <Film className="size-4 text-accent" /> Render
            </div>
            <Badge tone={render ? 'info' : 'neutral'}>{render ? RENDER_STATUS_LABELS[render.status] : 'Idle'}</Badge>
          </div>
          {render ? (
            <>
              <ProgressBar value={render.ratio} indeterminate={render.ratio === undefined} />
              <div className="mt-2 text-sm text-muted">
                {render.detail}
                {render.ratio !== undefined && ` · ${Math.round(render.ratio * 100)}%`}
              </div>
              <Link href={`/editor?project=${render.projectId}`} className="mt-1 inline-block text-sm font-semibold text-accent">
                Open render →
              </Link>
            </>
          ) : (
            <div className="text-sm text-muted">No render running.</div>
          )}
        </Card>
      </div>

      <SectionTitle action={<Link href="/projects" className="text-sm font-semibold text-accent">All projects</Link>}>Recent projects</SectionTitle>
      {list.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {list.slice(0, 8).map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Clapperboard className="size-7" />} title="No projects yet" action={<Link href="/create"><Button variant="primary" icon={<Plus className="size-4" />}>Create your first video</Button></Link>}>
          Enter a video idea and the studio builds the whole production.
        </EmptyState>
      )}

      <SectionTitle>Quick actions</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { href: '/create', icon: Wand2, label: 'Idea → video' },
          { href: '/images', icon: ImageIcon, label: 'Generate image' },
          { href: '/thumbnails', icon: LayoutTemplate, label: 'Design thumbnail' },
          { href: '/seo', icon: Search, label: 'SEO package' },
          { href: '/channels', icon: Tv, label: 'Channels' },
          { href: '/settings', icon: Cpu, label: 'AI providers' },
        ].map((a) => (
          <Link key={a.href} href={a.href} className="flex min-h-14 items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 text-sm font-semibold hover:border-accent/50">
            <a.icon className="size-5 text-accent" /> {a.label}
          </Link>
        ))}
      </div>

      <SectionTitle action={<Link href="/settings" className="text-sm font-semibold text-accent">Manage</Link>}>Connected AI providers</SectionTitle>
      {providers?.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {providers.map((p) => {
            const info = adapterInfo(p.type);
            const u = usage?.find((x) => x.providerId === p.id);
            return (
              <Card key={p.id} className="flex items-center gap-3 p-3">
                <div className={`size-2.5 shrink-0 rounded-full ${!p.enabled ? 'bg-muted' : p.lastTest?.ok === false ? 'bg-danger' : p.lastTest?.ok ? 'bg-success' : 'bg-warning'}`} />
                <div className="flex-1">
                  <div className="text-sm font-bold">{p.name}</div>
                  <div className="text-xs text-muted">
                    {PROVIDER_KIND_LABELS[p.kind]} · {info ? PROVIDER_BILLING_LABELS[info.billing] : ''}
                    {u ? ` · today: ${u.requests} requests${u.failures ? `, ${u.failures} failed` : ''}` : ''}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Cpu className="size-7" />} title="No AI providers connected" action={<Link href="/settings"><Button variant="primary">Connect a provider</Button></Link>}>
          Script, image and voice generation need at least one provider. Free options are available; nothing is generated without one.
        </EmptyState>
      )}

      <SectionTitle>Recent exports</SectionTitle>
      {videos?.length ? (
        <div className="space-y-2">
          {videos.slice(0, 5).map((v) => (
            <Card key={v.id} className="flex items-center gap-3 p-3">
              <Film className="size-5 text-accent" />
              <div className="flex-1">
                <div className="text-sm font-semibold">{v.name}</div>
                <div className="text-xs text-muted">
                  {formatDate(v.createdAt)} · {formatBytes(v.size)}
                </div>
              </div>
              {v.projectId && (
                <Link href={`/project?id=${v.projectId}&tab=export`}>
                  <Button size="sm" icon={<Download className="size-4" />}>Open</Button>
                </Link>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted">Rendered videos appear here.</div>
      )}
    </div>
  );
}
