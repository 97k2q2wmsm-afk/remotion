import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AssetMeta, Channel, Project, ProviderConfig, ThumbTemplate, UsageRecord } from '@/types';

interface StudioDB extends DBSchema {
  projects: { key: string; value: Project; indexes: { updatedAt: number } };
  assets: { key: string; value: AssetMeta; indexes: { projectId: string; kind: string } };
  blobs: { key: string; value: Blob };
  channels: { key: string; value: Channel };
  providers: { key: string; value: ProviderConfig };
  kv: { key: string; value: unknown };
  templates: { key: string; value: ThumbTemplate };
  usage: { key: string; value: UsageRecord };
}

export type StoreName = 'projects' | 'assets' | 'blobs' | 'channels' | 'providers' | 'kv' | 'templates' | 'usage';

let dbPromise: Promise<IDBPDatabase<StudioDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<StudioDB>> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }
  if (!dbPromise) {
    dbPromise = openDB<StudioDB>('creator-studio-ai', 1, {
      upgrade(db) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('updatedAt', 'updatedAt');
        const assets = db.createObjectStore('assets', { keyPath: 'id' });
        assets.createIndex('projectId', 'projectId');
        assets.createIndex('kind', 'kind');
        db.createObjectStore('blobs');
        db.createObjectStore('channels', { keyPath: 'id' });
        db.createObjectStore('providers', { keyPath: 'id' });
        db.createObjectStore('kv');
        db.createObjectStore('templates', { keyPath: 'id' });
        db.createObjectStore('usage', { keyPath: 'providerId' });
      },
      blocked() {
        console.warn('Database upgrade blocked by another open tab.');
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// Tiny change bus so screens refresh when another screen (or the background queue) writes.
type Listener = (store: StoreName, key?: string) => void;
const listeners = new Set<Listener>();

export function onDBChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitDBChange(store: StoreName, key?: string) {
  for (const fn of listeners) {
    try {
      fn(store, key);
    } catch (err) {
      console.error(err);
    }
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  const est = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export class StorageFullError extends Error {
  constructor() {
    super(
      'Device storage is full. Nothing was deleted. Free space by exporting and removing old projects or renders in Settings → Storage.',
    );
    this.name = 'StorageFullError';
  }
}

export function wrapQuota(err: unknown): unknown {
  if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) return new StorageFullError();
  return err;
}
