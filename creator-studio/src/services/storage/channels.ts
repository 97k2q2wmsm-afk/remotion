import type { Channel } from '@/types';
import { seedChannels } from '@/config/defaults';
import { uid } from '@/utils';
import { emitDBChange, getDB } from './db';
import { kvGet, kvSet } from './kv';

export async function listChannels(): Promise<Channel[]> {
  const db = await getDB();
  if (!(await kvGet<boolean>('channelsSeeded'))) {
    const tx = db.transaction('channels', 'readwrite');
    for (const c of seedChannels()) await tx.store.put(c);
    await tx.done;
    await kvSet('channelsSeeded', true);
  }
  return (await db.getAll('channels')).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getChannel(id?: string): Promise<Channel | undefined> {
  if (!id) return undefined;
  return (await getDB()).get('channels', id);
}

export async function saveChannel(c: Channel) {
  await (await getDB()).put('channels', { ...c, updatedAt: Date.now() });
  emitDBChange('channels', c.id);
}

export async function duplicateChannel(c: Channel) {
  const now = Date.now();
  const copy: Channel = { ...structuredClone(c), id: uid('ch'), name: `${c.name} (copy)`, createdAt: now, updatedAt: now };
  await saveChannel(copy);
  return copy;
}

export async function deleteChannel(id: string) {
  await (await getDB()).delete('channels', id);
  emitDBChange('channels', id);
}
