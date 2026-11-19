import type { Project } from '@/types';
import { initialStages } from '@/config/defaults';
import { uid } from '@/utils';
import { emitDBChange, getDB, wrapQuota } from './db';
import { deleteAsset, listAssets } from './assets';

export async function listProjects(): Promise<Project[]> {
  const db = await getDB();
  const all = await db.getAll('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const p = await (await getDB()).get('projects', id);
  return p ? migrateProject(p) : undefined;
}

/** Fills fields added after a project was first saved so older projects keep opening. */
export function migrateProject(p: Project): Project {
  const stages = { ...initialStages(), ...(p.stages ?? {}) };
  return {
    ...p,
    stages,
    scenes: (p.scenes ?? []).map((s) => ({ ...s, imageHistory: s.imageHistory ?? [], sfx: s.sfx ?? [], characters: s.characters ?? [] })),
    characters: p.characters ?? [],
    thumbConcepts: p.thumbConcepts ?? [],
    thumbDesigns: p.thumbDesigns ?? [],
    thumbExports: p.thumbExports ?? [],
    seoVersions: p.seoVersions ?? [],
    timelines: p.timelines ?? {},
    imageSettings: p.imageSettings ?? { seedMode: 'fixed', baseSeed: 12345, useCharacterReference: true, referenceStrength: 0.5, quality: 'standard' },
    renders: p.renders ?? [],
  };
}

export async function saveProject(project: Project): Promise<Project> {
  const next = { ...project, updatedAt: Date.now() };
  try {
    await (await getDB()).put('projects', next);
  } catch (err) {
    throw wrapQuota(err);
  }
  emitDBChange('projects', next.id);
  return next;
}

/** Read-modify-write helper so background jobs never overwrite edits made in another screen. */
export async function updateProject(id: string, mutate: (p: Project) => Project | void): Promise<Project | undefined> {
  const db = await getDB();
  const tx = db.transaction('projects', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    return undefined;
  }
  const draft = structuredClone(migrateProject(current));
  const result = mutate(draft) ?? draft;
  result.updatedAt = Date.now();
  try {
    await tx.store.put(result);
    await tx.done;
  } catch (err) {
    throw wrapQuota(err);
  }
  emitDBChange('projects', id);
  return result;
}

export async function duplicateProject(id: string): Promise<Project | undefined> {
  const p = await getProject(id);
  if (!p) return undefined;
  const now = Date.now();
  // Assets are shared by id (read-only references); deleting the copy never deletes the original's media.
  const copy: Project = { ...structuredClone(p), id: uid('p'), title: `${p.title} (copy)`, createdAt: now, updatedAt: now };
  return saveProject(copy);
}

/** Deletes a project and, only if requested, the media that belongs to it. */
export async function deleteProject(id: string, withMedia: boolean) {
  const db = await getDB();
  if (withMedia) {
    const others = (await db.getAll('projects')).filter((p) => p.id !== id);
    const referenced = new Set<string>();
    for (const o of others) for (const a of collectAssetIds(o)) referenced.add(a);
    for (const a of await listAssets({ projectId: id })) if (!referenced.has(a.id)) await deleteAsset(a.id);
  }
  await db.delete('projects', id);
  emitDBChange('projects', id);
}

export function collectAssetIds(p: Project): Set<string> {
  const ids = new Set<string>();
  const add = (v?: string) => v && ids.add(v);
  p.brief.referenceAssetIds.forEach(add);
  p.characters.forEach((c) => add(c.referenceAssetId));
  for (const s of p.scenes) {
    add(s.imageAssetId);
    add(s.audioAssetId);
    s.imageHistory.forEach(add);
  }
  p.thumbExports.forEach(add);
  for (const d of p.thumbDesigns) for (const l of d.layers) if (l.type === 'image') add(l.assetId);
  add(p.voice.fullAssetId);
  add(p.music.assetId);
  for (const t of Object.values(p.timelines)) {
    if (!t) continue;
    t.clips.forEach((c) => add(c.assetId));
    [...t.narration, ...t.music, ...t.sfx].forEach((c) => add(c.assetId));
  }
  p.renders.forEach((r) => add(r.outputAssetId));
  add(p.finalVideoAssetId);
  return ids;
}
