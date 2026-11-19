import type { AssetMeta, MusicMood, SfxKind } from '@/types';
import { MUSIC_MOOD_LABELS, SFX_LABELS } from '@/config/states';
import { listAssets, saveAsset } from '@/services/storage/assets';
import { encodeWav } from './audio';
import { renderMusicLoop, renderSfx } from './synth';

const pending = new Map<string, Promise<AssetMeta>>();

async function findGlobal(name: string): Promise<AssetMeta | undefined> {
  return (await listAssets({ kind: name.startsWith('music') ? 'music' : 'sfx' })).find((a) => a.name === name && a.source === 'Creator Studio synth');
}

function once(name: string, make: () => Promise<AssetMeta>): Promise<AssetMeta> {
  const cur = pending.get(name);
  if (cur) return cur;
  const p = (async () => (await findGlobal(name)) ?? make())().finally(() => pending.delete(name));
  pending.set(name, p);
  return p;
}

/** Shared library asset (not tied to a project) holding an original synthesized music loop. */
export function ensureMusicLoop(mood: MusicMood): Promise<AssetMeta> {
  const name = `music_${mood}_loop.wav`;
  return once(name, async () => {
    const buf = await renderMusicLoop(mood);
    return saveAsset({
      kind: 'music',
      name,
      blob: encodeWav(buf),
      duration: buf.duration,
      source: 'Creator Studio synth',
      license: `Original procedural music (${MUSIC_MOOD_LABELS[mood]}) generated on this device — free to use.`,
    });
  });
}

export function ensureSfx(kind: SfxKind): Promise<AssetMeta> {
  const name = `sfx_${kind}.wav`;
  return once(name, async () => {
    const buf = await renderSfx(kind);
    return saveAsset({
      kind: 'sfx',
      name,
      blob: encodeWav(buf),
      duration: buf.duration,
      source: 'Creator Studio synth',
      license: `Original synthesized sound effect (${SFX_LABELS[kind]}) — free to use.`,
    });
  });
}
