import type { AssetKind, AssetMeta } from '@/types';
import { uid } from '@/utils';
import { emitDBChange, getDB, wrapQuota } from './db';

export interface NewAsset {
  projectId?: string;
  kind: AssetKind;
  name: string;
  blob: Blob;
  width?: number;
  height?: number;
  duration?: number;
  prompt?: string;
  providerId?: string;
  source?: string;
  license?: string;
}

export async function saveAsset(input: NewAsset): Promise<AssetMeta> {
  const db = await getDB();
  const meta: AssetMeta = {
    id: uid('a'),
    projectId: input.projectId,
    kind: input.kind,
    name: input.name,
    mime: input.blob.type || 'application/octet-stream',
    size: input.blob.size,
    createdAt: Date.now(),
    width: input.width,
    height: input.height,
    duration: input.duration,
    prompt: input.prompt,
    providerId: input.providerId,
    source: input.source,
    license: input.license,
  };
  try {
    const tx = db.transaction(['assets', 'blobs'], 'readwrite');
    await Promise.all([tx.objectStore('assets').put(meta), tx.objectStore('blobs').put(input.blob, meta.id), tx.done]);
  } catch (err) {
    throw wrapQuota(err);
  }
  emitDBChange('assets', meta.id);
  return meta;
}

export async function getAssetMeta(id: string): Promise<AssetMeta | undefined> {
  return (await getDB()).get('assets', id);
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
  return (await getDB()).get('blobs', id);
}

export async function updateAssetMeta(id: string, patch: Partial<AssetMeta>) {
  const db = await getDB();
  const meta = await db.get('assets', id);
  if (!meta) return;
  await db.put('assets', { ...meta, ...patch, id });
  emitDBChange('assets', id);
}

export async function listAssets(filter?: { projectId?: string; kind?: AssetKind }): Promise<AssetMeta[]> {
  const db = await getDB();
  let items: AssetMeta[];
  if (filter?.projectId) items = await db.getAllFromIndex('assets', 'projectId', filter.projectId);
  else if (filter?.kind) items = await db.getAllFromIndex('assets', 'kind', filter.kind);
  else items = await db.getAll('assets');
  if (filter?.kind) items = items.filter((a) => a.kind === filter.kind);
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

/** Deletes an asset. Only called from explicit user actions; never to free space silently. */
export async function deleteAsset(id: string) {
  const db = await getDB();
  const tx = db.transaction(['assets', 'blobs'], 'readwrite');
  await Promise.all([tx.objectStore('assets').delete(id), tx.objectStore('blobs').delete(id), tx.done]);
  revokeAssetUrl(id);
  emitDBChange('assets', id);
}

const urlCache = new Map<string, string>();

export async function assetUrl(id: string): Promise<string | undefined> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await getAssetBlob(id);
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function revokeAssetUrl(id: string) {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}
