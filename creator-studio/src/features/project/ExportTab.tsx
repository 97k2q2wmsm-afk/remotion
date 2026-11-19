'use client';
import Link from 'next/link';
import { useState } from 'react';
import JSZip from 'jszip';
import { Archive, Captions, Download, FileText, Film, ImageIcon, LayoutTemplate, Music, Package, Search } from 'lucide-react';
import type { Project } from '@/types';
import { RENDER_ENGINE_LABELS, RENDER_STATUS_LABELS, RESOLUTION_LABELS } from '@/config/states';
import { AssetImage } from '@/components/common';
import { Badge, Button, Card, EmptyState, ProgressBar, SectionTitle } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { useAssetUrl } from '@/hooks/data';
import { buildProjectZip, exportProjectBackup, scriptMarkdown, seoText, storyboardMarkdown } from '@/services/export/zip';
import { toSrt, toVtt } from '@/services/export/subtitles';
import { getAssetBlob, getAssetMeta } from '@/services/storage/assets';
import { downloadBlob, downloadText, errorMessage, formatBytes, formatDate, pad, slugify } from '@/utils';
import { zipSceneImages } from './ImagesTab';

export function ExportTab({ project }: { project: Project }) {
  const { toast } = useFeedback();
  const videoUrl = useAssetUrl(project.finalVideoAssetId);
  const [zipMsg, setZipMsg] = useState<string | null>(null);
  const slug = slugify(project.title);
  const t = project.timelines[project.editMode];

  const fullZip = async () => {
    setZipMsg('Starting');
    try {
      const blob = await buildProjectZip(project, setZipMsg);
      downloadBlob(blob, `${slug}_VIDEO_PROJECT.zip`);
      toast(`Package ready (${formatBytes(blob.size)})`, 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setZipMsg(null);
    }
  };

  const audioZip = async () => {
    const zip = new JSZip();
    for (const s of project.scenes) {
      if (!s.audioAssetId) continue;
      const b = await getAssetBlob(s.audioAssetId);
      const m = await getAssetMeta(s.audioAssetId);
      if (b) zip.file(`narration_scene_${pad(s.number)}.${m?.name.split('.').pop() ?? 'mp3'}`, b);
    }
    if (project.voice.fullAssetId) {
      const b = await getAssetBlob(project.voice.fullAssetId);
      const m = await getAssetMeta(project.voice.fullAssetId);
      if (b) zip.file(m?.name ?? 'narration_full', b);
    }
    downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `${slug}_audio.zip`);
  };

  const item = (icon: React.ReactNode, label: string, action: () => void, disabled = false, hint?: string) => (
    <Button className="h-auto min-h-14 justify-start py-2 text-left" disabled={disabled} icon={icon} onClick={action}>
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-xs font-normal text-muted">{hint}</span>}
      </span>
    </Button>
  );

  return (
    <div className="space-y-4">
      <SectionTitle>Final video</SectionTitle>
      {project.finalVideoAssetId && videoUrl ? (
        <Card className="space-y-3">
          <video src={videoUrl} controls playsInline className={`mx-auto max-h-[70dvh] rounded-xl bg-black ${project.brief.aspect === '9:16' ? 'aspect-[9/16]' : 'w-full'}`} />
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            icon={<Download className="size-5" />}
            onClick={async () => {
              const b = await getAssetBlob(project.finalVideoAssetId!);
              if (b) downloadBlob(b, `${slug}_final.mp4`);
            }}
          >
            Download MP4
          </Button>
          <p className="text-xs text-muted">On iPhone: after downloading, open Files → Downloads and use Share → Save Video to put it in Photos.</p>
        </Card>
      ) : (
        <EmptyState icon={<Film className="size-7" />} title="Not rendered yet" action={<Link href={`/editor?project=${project.id}&panel=render`}><Button variant="primary">Open editor to render</Button></Link>}>
          Build the edit and render to get the MP4.
        </EmptyState>
      )}

      <SectionTitle>Downloads</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        {item(<Package className="size-5 text-accent" />, 'Full ZIP package', fullZip, !!zipMsg, 'SCRIPT · STORYBOARD · IMAGES · THUMBNAILS · AUDIO · SUBTITLES · SEO · EDIT_PLAN · FINAL_VIDEO')}
        {item(<FileText className="size-5 text-accent" />, 'Script (.md)', () => downloadText(scriptMarkdown(project), `${slug}_script.md`, 'text/markdown'), !project.scenes.length)}
        {item(<FileText className="size-5 text-accent" />, 'Storyboard (.md)', () => downloadText(storyboardMarkdown(project), `${slug}_storyboard.md`, 'text/markdown'), !project.scenes.length)}
        {item(<ImageIcon className="size-5 text-accent" />, 'Scene images (ZIP)', async () => downloadBlob(await zipSceneImages(project), `${slug}_images.zip`), !project.scenes.some((s) => s.imageAssetId))}
        {item(<Music className="size-5 text-accent" />, 'Narration audio (ZIP)', audioZip, !project.scenes.some((s) => s.audioAssetId) && !project.voice.fullAssetId)}
        {item(<Captions className="size-5 text-accent" />, 'Subtitles (.srt)', () => t && downloadText(toSrt(t.captions), `${slug}.srt`), !t?.captions.length)}
        {item(<Captions className="size-5 text-accent" />, 'Subtitles (.vtt)', () => t && downloadText(toVtt(t.captions), `${slug}.vtt`, 'text/vtt'), !t?.captions.length)}
        {item(<Search className="size-5 text-accent" />, 'SEO package (.txt)', () => downloadText(seoText(project), `${slug}_seo.txt`), !project.seo)}
        {item(<Archive className="size-5 text-accent" />, 'Project backup', async () => downloadBlob(await exportProjectBackup(project), `${slug}.creatorstudio.zip`), false, 'Re-import on any device from My Projects')}
      </div>
      {zipMsg && (
        <Card>
          <div className="mb-2 text-sm">Building package: {zipMsg}…</div>
          <ProgressBar indeterminate />
        </Card>
      )}

      <SectionTitle action={<Link href={`/thumbnails?project=${project.id}`} className="text-sm font-semibold text-accent">Thumbnail Studio</Link>}>Thumbnails</SectionTitle>
      {project.thumbExports.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {project.thumbExports.map((id, i) => (
            <button
              key={id}
              className="overflow-hidden rounded-xl border border-line"
              onClick={async () => {
                const b = await getAssetBlob(id);
                if (b) downloadBlob(b, `${slug}_thumbnail_${pad(i + 1, 2)}.${b.type === 'image/png' ? 'png' : 'jpg'}`);
              }}
            >
              <AssetImage id={id} alt={`Thumbnail ${i + 1}`} className="aspect-video w-full" />
              <div className="flex items-center justify-center gap-1 py-1.5 text-xs font-semibold"><Download className="size-3.5" /> Download</div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState icon={<LayoutTemplate className="size-6" />} title="No thumbnails exported yet" />
      )}

      <SectionTitle>Render history</SectionTitle>
      {project.renders.length ? (
        <div className="space-y-2">
          {project.renders.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <Badge tone={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'danger' : 'neutral'}>{RENDER_STATUS_LABELS[r.status]}</Badge>
              <span>{RESOLUTION_LABELS[r.resolution]}</span>·<span className="text-muted">{RENDER_ENGINE_LABELS[r.engine].title}</span>·<span className="text-muted">{formatDate(r.startedAt)}</span>
              {r.sizeBytes && <span className="text-muted">· {formatBytes(r.sizeBytes)}</span>}
              {r.finishedAt && <span className="text-muted">· {Math.round((r.finishedAt - r.startedAt) / 1000)} s</span>}
              {r.outputAssetId && (
                <Button size="sm" className="ml-auto" icon={<Download className="size-4" />} onClick={async () => {
                  const b = await getAssetBlob(r.outputAssetId!);
                  if (b) downloadBlob(b, `${slug}_${r.resolution}.mp4`);
                  else toast('This render file was deleted.', 'warning');
                }}>
                  MP4
                </Button>
              )}
              {r.error && <div className="w-full text-xs text-danger">{r.error}</div>}
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No renders yet.</p>
      )}
    </div>
  );
}
