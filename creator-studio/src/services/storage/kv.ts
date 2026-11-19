import { emitDBChange, getDB } from './db';

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await getDB()).get('kv', key)) as T | undefined;
}

export async function kvSet<T>(key: string, value: T) {
  await (await getDB()).put('kv', value, key);
  emitDBChange('kv', key);
}
