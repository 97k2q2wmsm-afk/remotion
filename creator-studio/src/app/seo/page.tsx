'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Copy, History, RefreshCw, Save, Search, Star } from 'lucide-react';
import type { SeoPackage } from '@/types';
import { AutoText, Badge, Button, Card, CopyButton, EmptyState, InfoNote, PageHeader, SectionTitle, cn } from '@/components/ui';
import { ProjectPicker } from '@/components/ProjectPicker';
import { useFeedback } from '@/components/feedback';
import { useProject } from '@/hooks/data';
import { runSeo } from '@/services/ai/pipeline';
import { seoText } from '@/services/export/zip';
import { errorMessage, formatDate, uid } from '@/utils';

function Seo({ id }: { id: string }) {
  const { project, update } = useProject(id);
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  if (!project) return <div className="skeleton h-40 rounded-2xl" />;
  const seo = project.seo;
  const gen = async () => {
    setBusy(true);
    try {
      await runSeo(project.id);
      toast('SEO package generated', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const set = (p: Partial<SeoPackage>) => update((d) => void (d.seo = { ...d.seo!, ...p }));
  const list = (key: 'tags' | 'keywords' | 'hashtags', sep: string) => (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <div className="font-bold capitalize">{key}</div>
        <CopyButton text={seo![key].join(sep)} />
      </div>
      <AutoText multiline rows={3} value={seo![key].join(sep === ' ' ? ' ' : ', ')} onSave={(v) => set({ [key]: v.split(sep === ' ' ? /\s+/ : /,\s*/).map((x) => x.trim()).filter(Boolean) } as Partial<SeoPackage>)} />
      {key === 'tags' && <div className="mt-1 text-xs text-muted">{seo!.tags.join(',').length}/500 characters (YouTube limit)</div>}
    </Card>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="line-clamp-1 flex-1 text-lg font-extrabold">{project.title}</div>
        <Button variant="primary" loading={busy} icon={<RefreshCw className="size-4" />} onClick={gen}>{seo ? 'Regenerate' : 'Generate SEO'}</Button>
      </div>
      <InfoNote>Everything here is an AI recommendation. No search volumes, rankings or analytics are shown because none are verified — check them in YouTube Studio or your analytics tool.</InfoNote>
      {!seo ? (
        <EmptyState icon={<Search className="size-7" />} title="No SEO package yet">Generate titles, description, tags, hashtags, pinned comment and CTA from the script.</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={seoText(project)} label="Copy complete package" size="md" />
            <Button icon={<Save className="size-4" />} onClick={() => update((d) => void d.seoVersions.unshift({ id: uid('v'), createdAt: Date.now(), label: 'Saved version', data: structuredClone(d.seo!) }))}>Save version</Button>
          </div>
          <SectionTitle>Titles — tap two or more to compare</SectionTitle>
          <div className="space-y-2">
            {seo.titles.map((t, i) => (
              <Card key={i} className={cn('flex items-center gap-2 p-3', compare.includes(t) && 'ring-2 ring-accent')}>
                <button className="flex-1 text-left text-sm font-semibold" onClick={() => setCompare((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]))}>
                  {seo.recommended.includes(t) && <Star className="mr-1 inline size-4 fill-warning text-warning" />}
                  {t}
                </button>
                <Badge tone={t.length > 70 ? 'danger' : t.length > 60 ? 'warning' : 'neutral'}>{t.length}</Badge>
                <CopyButton text={t} label="" />
              </Card>
            ))}
          </div>
          {compare.length > 1 && (
            <Card>
              <div className="mb-2 font-bold">Comparison</div>
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="pb-1">Title</th><th>Chars</th><th>Words</th><th>Has number</th><th>Question</th></tr></thead>
                <tbody>
                  {compare.map((t) => (
                    <tr key={t} className="border-t border-line">
                      <td className="py-1.5 pr-2">{t}</td>
                      <td>{t.length}</td>
                      <td>{t.split(/\s+/).length}</td>
                      <td>{/\d/.test(t) ? 'yes' : '—'}</td>
                      <td>{/[?¿]/.test(t) ? 'yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">Text properties only — not performance predictions. Shorter titles (under ~60 characters) are less likely to be cut off on mobile.</p>
            </Card>
          )}
          <Card>
            <div className="mb-2 flex items-center justify-between"><div className="font-bold">Recommended titles</div><CopyButton text={seo.recommended.join('\n')} /></div>
            <AutoText multiline rows={3} value={seo.recommended.join('\n')} onSave={(v) => set({ recommended: v.split('\n').filter(Boolean) })} />
          </Card>
          <Card>
            <div className="mb-2 flex items-center justify-between"><div className="font-bold">Description</div><CopyButton text={seo.description} /></div>
            <AutoText multiline rows={10} value={seo.description} onSave={(v) => set({ description: v })} />
            <div className="mt-1 text-xs text-muted">{seo.description.length}/5000 characters</div>
          </Card>
          {list('tags', ', ')}
          {list('keywords', ', ')}
          {list('hashtags', ' ')}
          {(['pinnedComment', 'cta', 'promo', 'chapters'] as const).map((k) => (
            <Card key={k}>
              <div className="mb-2 flex items-center justify-between"><div className="font-bold">{{ pinnedComment: 'Pinned comment', cta: 'Call to action', promo: 'Short promotional text', chapters: 'Chapters' }[k]}</div><CopyButton text={seo[k]} /></div>
              <AutoText multiline rows={k === 'chapters' ? 6 : 3} value={seo[k]} onSave={(v) => set({ [k]: v })} />
            </Card>
          ))}
          {project.seoVersions.length > 0 && (
            <>
              <SectionTitle>Saved versions</SectionTitle>
              <div className="space-y-2">
                {project.seoVersions.map((v) => (
                  <Card key={v.id} className="flex items-center gap-2 p-3 text-sm">
                    <History className="size-4 text-muted" />
                    <div className="flex-1">
                      <div className="font-semibold">{v.label}</div>
                      <div className="text-xs text-muted">{formatDate(v.createdAt)} · {v.data.recommended[0] ?? v.data.titles[0]}</div>
                    </div>
                    <Button size="sm" icon={<Copy className="size-4" />} onClick={() => update((d) => {
                      if (d.seo) d.seoVersions.unshift({ id: uid('v'), createdAt: Date.now(), label: 'Before restore', data: d.seo });
                      d.seo = structuredClone(v.data);
                    })}>Restore</Button>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Inner() {
  const id = useSearchParams().get('project');
  return id ? <Seo id={id} /> : <ProjectPicker base="/seo" title="SEO Studio" />;
}

export default function SeoPage() {
  return (
    <div>
      <PageHeader title="SEO Studio" subtitle="Titles, description, tags, hashtags and more." icon={<Search className="size-5" />} />
      <Suspense fallback={<div className="skeleton h-40 rounded-2xl" />}>
        <Inner />
      </Suspense>
    </div>
  );
}
