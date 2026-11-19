'use client';
import { useState } from 'react';
import { Download, FileText, ImageIcon } from 'lucide-react';
import type { Project } from '@/types';
import { IMAGE_JOB_LABELS, MOTION_LABELS, TRANSITION_LABELS } from '@/config/states';
import { AssetImage } from '@/components/common';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { contactSheet } from '@/services/export/storyboard';
import { storyboardMarkdown } from '@/services/export/zip';
import { imageQueue } from '@/services/image-providers/queue';
import { downloadBlob, downloadText, errorMessage, formatTime, slugify } from '@/utils';
import type { Updater } from './Workspace';

export function StoryboardTab({ project }: { project: Project; update: Updater }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  if (!project.scenes.length) return <EmptyState title="No storyboard yet">Generate the script first — the storyboard is built from its scenes.</EmptyState>;
  const portrait = project.brief.aspect === '9:16';
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" icon={<FileText className="size-4" />} onClick={() => downloadText(storyboardMarkdown(project), `${slugify(project.title)}_storyboard.md`, 'text/markdown')}>
          Storyboard (.md)
        </Button>
        <Button
          size="sm"
          loading={busy}
          icon={<Download className="size-4" />}
          onClick={async () => {
            setBusy(true);
            try {
              const b = await contactSheet(project);
              if (b) downloadBlob(b, `${slugify(project.title)}_contact_sheet.jpg`);
              else toast('No scene images yet.', 'warning');
            } catch (e) {
              toast(errorMessage(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Contact sheet
        </Button>
      </div>
      <div className={`grid gap-3 ${portrait ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
        {project.scenes.map((s) => (
          <Card key={s.id} className="overflow-hidden p-0">
            <div className={`relative ${portrait ? 'aspect-[9/16]' : project.brief.aspect === '1:1' ? 'aspect-square' : 'aspect-video'}`}>
              <AssetImage id={s.imageAssetId} alt={`Scene ${s.number}`} className="size-full" fallback={<div className="p-3 text-center text-xs">{IMAGE_JOB_LABELS[s.imageStatus]}</div>} />
              <Badge tone="accent" className="absolute left-2 top-2">#{s.number}</Badge>
              <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">{formatTime(s.start)}</span>
            </div>
            <div className="space-y-1.5 p-3">
              <p className="line-clamp-3 text-xs text-ink/90">{s.narration}</p>
              <p className="line-clamp-2 text-[11px] text-muted">{s.visual}</p>
              <div className="flex flex-wrap gap-1">
                <Badge>{MOTION_LABELS[s.camera]}</Badge>
                <Badge>{TRANSITION_LABELS[s.transition]}</Badge>
              </div>
              {!s.imageAssetId && (
                <Button
                  size="sm"
                  className="w-full"
                  icon={<ImageIcon className="size-4" />}
                  disabled={imageQueue.isActive(project.id, s.id)}
                  onClick={() => imageQueue.enqueue(project.id, [s.id]).catch((e) => toast(errorMessage(e), 'error'))}
                >
                  Generate image
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
