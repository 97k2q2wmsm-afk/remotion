import type { AppSettings, ProviderConfig, ThumbTemplate, UsageRecord } from '@/types';
import { DEFAULT_SETTINGS } from '@/config/defaults';
import { emitDBChange, getDB } from './db';
import { kvGet, kvSet } from './kv';

export async function getSettings(): Promise<AppSettings> {
  const s = await kvGet<Partial<AppSettings>>('settings');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), defaultRender: { ...DEFAULT_SETTINGS.defaultRender, ...(s?.defaultRender ?? {}) } };
}

// Writes are chained so two quick edits can never overwrite each other with stale values.
let settingsChain: Promise<void> = Promise.resolve();
export function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  settingsChain = settingsChain
    .catch(() => {})
    .then(async () => {
      const cur = await getSettings();
      await kvSet('settings', { ...cur, ...patch });
    });
  return settingsChain;
}

export async function listProviders(): Promise<ProviderConfig[]> {
  return (await getDB()).getAll('providers');
}

export async function getProvider(id?: string): Promise<ProviderConfig | undefined> {
  if (!id) return undefined;
  return (await getDB()).get('providers', id);
}

export async function saveProvider(p: ProviderConfig) {
  await (await getDB()).put('providers', p);
  emitDBChange('providers', p.id);
}

export async function deleteProvider(id: string) {
  await (await getDB()).delete('providers', id);
  emitDBChange('providers', id);
}

export async function listTemplates(): Promise<ThumbTemplate[]> {
  return (await (await getDB()).getAll('templates')).sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveTemplate(t: ThumbTemplate) {
  await (await getDB()).put('templates', t);
  emitDBChange('templates', t.id);
}

export async function deleteTemplate(id: string) {
  await (await getDB()).delete('templates', id);
  emitDBChange('templates', id);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Local usage counter: what this device actually sent. Not a provider quota. */
export async function recordUsage(providerId: string, ok: boolean, units = 1) {
  const db = await getDB();
  const cur = await db.get('usage', providerId);
  const day = today();
  const base: UsageRecord = cur && cur.day === day ? cur : { providerId, day, requests: 0, failures: 0, units: 0 };
  base.requests += 1;
  if (!ok) base.failures += 1;
  else base.units += units;
  await db.put('usage', base);
  emitDBChange('usage', providerId);
}

export async function listUsage(): Promise<UsageRecord[]> {
  const day = today();
  return (await (await getDB()).getAll('usage')).filter((u) => u.day === day);
}
