import JSZip from 'jszip';
import type { Project } from '@/types';
import { MOTION_LABELS, TRANSITION_LABELS, FACT_STATUS_LABELS, VISUAL_STYLE_LABELS } from '@/config/states';
import { getAssetBlob, getAssetMeta, listAssets, saveAsset } from '@/services/storage/assets';
import { collectAssetIds, migrateProject, saveProject } from '@/services/storage/projects';
import { getChannel } from '@/services/storage/channels';
import { formatTime, pad, slugify, uid } from '@/utils';
import { toSrt, toVtt } from './subtitles';
import { contactSheet } from './storyboard';

function ext(name: string, mime: string) {
  const m = /\.(\w+)$/.exec(name);
  if (m) return m[1];
  return mime.split('/')[1]?.replace('mpeg', 'mp3') ?? 'bin';
}

export function scriptMarkdown(p: Project): string {
  const lines = [`# ${p.title}`, '', `Topic: ${p.brief.topic}`, `Language: ${p.brief.language} · Style: ${VISUAL_STYLE_LABELS[p.brief.visualStyle]}`, ''];
  if (p.concept) {
    lines.push('## Concept', p.concept.concept, '', '## Hook', p.concept.hook, '');
    if (p.concept.verifiedFacts.length) lines.push('## Facts to verify before publishing', ...p.concept.verifiedFacts.map((f) => `- ${f}`), '');
    if (p.concept.fictionalElements.length) lines.push('## Dramatized elements', ...p.concept.fictionalElements.map((f) => `- ${f}`), '');
    if (p.concept.factsNote) lines.push(`> ${p.concept.factsNote}`, '');
  }
  lines.push('## Full narration', '', p.scenes.map((s) => s.narration).join('\n\n'), '', '## Scenes', '');
  for (const s of p.scenes) lines.push(`### Scene ${s.number} (${formatTime(s.start)}–${formatTime(s.end)}, ${s.duration.toFixed(1)} s)`, s.narration, '');
  return lines.join('\n');
}

export function storyboardMarkdown(p: Project): string {
  const lines = [`# Storyboard — ${p.title}`, ''];
  for (const s of p.scenes) {
    lines.push(
      `## Scene ${pad(s.number)} · ${formatTime(s.start)}–${formatTime(s.end)} · ${s.duration.toFixed(1)} s`,
      `- **Narration:** ${s.narration}`,
      `- **Visual:** ${s.visual}`,
      `- **Image prompt:** ${s.imagePrompt}`,
      `- **Negative prompt:** ${s.negativePrompt}`,
      `- **Camera:** ${MOTION_LABELS[s.camera]}`,
      `- **Transition:** ${TRANSITION_LABELS[s.transition]}`,
      `- **Characters:** ${s.characters.join(', ') || '—'}`,
      `- **Environment:** ${s.environment}`,
      `- **Sound effects:** ${s.sfx.join(', ') || '—'}`,
      `- **Fact status:** ${FACT_STATUS_LABELS[s.factStatus]}`,
      '',
    );
  }
  return lines.join('\n');
}

export function seoText(p: Project): string {
  const s = p.seo;
  if (!s) return 'SEO package not generated yet.';
  return [
    'NOTE: AI recommendations — not verified analytics. Search volumes and rankings are not included.',
    '',
    'RECOMMENDED TITLES',
    ...s.recommended.map((t, i) => `${i + 1}. ${t}`),
    '',
    'ALL TITLES',
    ...s.titles.map((t, i) => `${i + 1}. ${t}`),
    '',
    'DESCRIPTION',
    s.description,
    '',
    'TAGS',
    s.tags.join(', '),
    '',
    'KEYWORDS',
    s.keywords.join(', '),
    '',
    'HASHTAGS',
    s.hashtags.join(' '),
    '',
    'PINNED COMMENT',
    s.pinnedComment,
    '',
    'CTA',
    s.cta,
    '',
    'PROMO',
    s.promo,
    '',
    s.chapters ? `CHAPTERS\n${s.chapters}` : '',
  ].join('\n');
}

/** Full production package with the folder structure requested for delivery. */
export async function buildProjectZip(p: Project, onProgress?: (msg: string) => void): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder('VIDEO_PROJECT')!;
  const slug = slugify(p.title);
  const t = p.timelines[p.editMode];
  onProgress?.('Script & storyboard');
  root.folder('SCRIPT')!.file(`${slug}_script.md`, scriptMarkdown(p));
  root.folder('SCRIPT')!.file(`${slug}_narration.txt`, p.scenes.map((s) => s.narration).join('\n\n'));
  const sb = root.folder('STORYBOARD')!;
  sb.file(`${slug}_storyboard.md`, storyboardMarkdown(p));
  sb.file(`${slug}_storyboard.json`, JSON.stringify(p.scenes.map(({ imageHistory: _h, ...s }) => s), null, 2));
  try {
    const sheet = await contactSheet(p);
    if (sheet) sb.file(`${slug}_contact_sheet.jpg`, sheet);
  } catch {
    /* contact sheet is optional */
  }
  onProgress?.('Images');
  const imgs = root.folder('IMAGES')!;
  for (const s of p.scenes) {
    if (!s.imageAssetId) continue;
    const blob = await getAssetBlob(s.imageAssetId);
    const meta = await getAssetMeta(s.imageAssetId);
    if (blob) imgs.file(`scene_${pad(s.number)}.${ext(meta?.name ?? '', blob.type)}`, blob);
  }
  onProgress?.('Thumbnails');
  const th = root.folder('THUMBNAILS')!;
  for (const [i, id] of p.thumbExports.entries()) {
    const blob = await getAssetBlob(id);
    const meta = await getAssetMeta(id);
    if (blob) th.file(`thumbnail_${pad(i + 1, 2)}.${ext(meta?.name ?? '', blob.type)}`, blob);
  }
  onProgress?.('Audio');
  const au = root.folder('AUDIO')!;
  for (const s of p.scenes) {
    if (!s.audioAssetId) continue;
    const blob = await getAssetBlob(s.audioAssetId);
    const meta = await getAssetMeta(s.audioAssetId);
    if (blob) au.file(`narration_scene_${pad(s.number)}.${ext(meta?.name ?? '', blob.type)}`, blob);
  }
  if (p.voice.fullAssetId) {
    const blob = await getAssetBlob(p.voice.fullAssetId);
    const meta = await getAssetMeta(p.voice.fullAssetId);
    if (blob) au.file(`narration_full.${ext(meta?.name ?? '', blob.type)}`, blob);
  }
  if (t) {
    for (const m of [...t.music, ...t.sfx]) {
      const meta = await getAssetMeta(m.assetId);
      const blob = await getAssetBlob(m.assetId);
      if (blob && meta && !au.file(meta.name)) au.file(meta.name, blob);
    }
    au.file('AUDIO_LICENSES.txt', (await Promise.all([...t.music, ...t.sfx].map(async (m) => {
      const meta = await getAssetMeta(m.assetId);
      return meta ? `${meta.name}: ${meta.license ?? meta.source ?? 'user provided — make sure you own the rights'}` : '';
    }))).filter((v, i, a) => v && a.indexOf(v) === i).join('\n'));
  }
  const subs = root.folder('SUBTITLES')!;
  if (t?.captions.length) {
    subs.file(`${slug}.srt`, toSrt(t.captions));
    subs.file(`${slug}.vtt`, toVtt(t.captions));
  }
  root.folder('SEO')!.file(`${slug}_seo.txt`, seoText(p));
  if (p.seo) root.folder('SEO')!.file(`${slug}_seo.json`, JSON.stringify(p.seo, null, 2));
  const ep = root.folder('EDIT_PLAN')!;
  if (t) ep.file(`${slug}_timeline_${p.editMode}.json`, JSON.stringify(t, null, 2));
  ep.file('render_settings.json', JSON.stringify(p.render, null, 2));
  onProgress?.('Final video');
  const fv = root.folder('FINAL_VIDEO')!;
  if (p.finalVideoAssetId) {
    const blob = await getAssetBlob(p.finalVideoAssetId);
    if (blob) fv.file(`${slug}_final.mp4`, blob);
  } else fv.file('README.txt', 'The final video has not been rendered yet.');
  onProgress?.('Compressing');
  // Media is already compressed: STORE keeps memory and CPU low on phones.
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

// ---------- Project backup (lossless re-import) ----------

export async function exportProjectBackup(p: Project): Promise<Blob> {
  const zip = new JSZip();
  const ids = collectAssetIds(p);
  const assets = [];
  for (const id of ids) {
    const meta = await getAssetMeta(id);
    const blob = await getAssetBlob(id);
    if (!meta || !blob) continue;
    assets.push(meta);
    zip.file(`assets/${id}`, blob);
  }
  const channel = await getChannel(p.channelId);
  zip.file('backup.json', JSON.stringify({ app: 'creator-studio-ai', format: 1, exportedAt: Date.now(), project: p, assets, channel }, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export async function importProjectBackup(file: Blob): Promise<Project> {
  const zip = await JSZip.loadAsync(file);
  const manifest = zip.file('backup.json');
  if (!manifest) throw new Error('This file is not a Creator Studio project backup.');
  const data = JSON.parse(await manifest.async('string'));
  if (data.app !== 'creator-studio-ai' || data.format !== 1) throw new Error('Unsupported backup format.');
  const existing = new Set((await listAssets()).map((a) => a.id));
  const remap = new Map<string, string>();
  for (const meta of data.assets as { id: string; name: string; kind: Parameters<typeof saveAsset>[0]['kind']; mime: string; width?: number; height?: number; duration?: number; source?: string; license?: string; prompt?: string }[]) {
    const entry = zip.file(`assets/${meta.id}`);
    if (!entry) continue;
    if (existing.has(meta.id)) {
      remap.set(meta.id, meta.id);
      continue;
    }
    const blob = new Blob([await entry.async('arraybuffer')], { type: meta.mime });
    const saved = await saveAsset({ projectId: undefined, kind: meta.kind, name: meta.name, blob, width: meta.width, height: meta.height, duration: meta.duration, source: meta.source, license: meta.license, prompt: meta.prompt });
    remap.set(meta.id, saved.id);
  }
  const newId = uid('p');
  let json = JSON.stringify(data.project);
  for (const [from, to] of remap) if (from !== to) json = json.split(`"${from}"`).join(`"${to}"`);
  const project = migrateProject({ ...JSON.parse(json), id: newId, title: `${data.project.title} (imported)`, updatedAt: Date.now() });
  // Assign imported media to the new project.
  const { updateAssetMeta } = await import('@/services/storage/assets');
  for (const id of remap.values()) await updateAssetMeta(id, { projectId: newId });
  return saveProject(project);
}
