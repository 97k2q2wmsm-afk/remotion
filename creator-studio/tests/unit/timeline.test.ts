import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Timeline, VideoClip, AudioClip } from '@/types';
import { DEFAULT_CAPTION_STYLE, DEFAULT_MIX } from '@/config/defaults';
import { applyMainTrack, fitToNarration, moveClip, patchClip, removeClip } from '@/features/editor/ops';
import { timelineDuration, clipStarts, transitionLength } from '@/services/timeline/math';
import { cuesForSpan, captionAt } from '@/services/timeline/captions';
import { extractJson, normalizeScene, normalizeTransition } from '@/services/ai/parse';
import { toSrt, toVtt, parseSrtOrVtt, toAss } from '@/services/export/subtitles';
import { motionKeys, sourceRect } from '@/services/compositor/motion';

const clip = (id: string, d: number, sceneId?: string): VideoClip => ({ id, kind: 'image', sceneId, assetId: `a${id}`, duration: d, motion: 'zoomIn', motionIntensity: 1, transition: 'dissolve', transitionDuration: 0.5 });
const nar = (id: string, start: number, d: number, sceneId: string): AudioClip => ({ id, assetId: `n${id}`, label: id, start, offset: 0, duration: d, volume: 1, fadeIn: 0, fadeOut: 0, sceneId });

function tl(): Timeline {
  const narration = [nar('n1', 0.1, 2.5, 's1'), nar('n2', 3.1, 3.5, 's2'), nar('n3', 7.1, 1.5, 's3')];
  return {
    version: 1,
    aspect: '9:16',
    fps: 30,
    clips: [clip('c1', 3, 's1'), clip('c2', 4, 's2'), clip('c3', 2, 's3')],
    narration,
    music: [{ id: 'm', assetId: 'm', label: 'music', start: 0, offset: 0, duration: 9, volume: 1, fadeIn: 1, fadeOut: 1, loop: true }],
    sfx: [],
    captions: narration.flatMap((n) => cuesForSpan('bir iki üç dört beş altı yedi', n.start, n.duration, 3)),
    overlays: [],
    captionStyle: DEFAULT_CAPTION_STYLE,
    mix: DEFAULT_MIX,
    updatedAt: 0,
  };
}

test('changing a clip duration moves later narration, captions and stretches music', () => {
  const t = tl();
  const n = patchClip(t, 'c1', { duration: 3.5 });
  assert.equal(timelineDuration(n), 9.5);
  assert.equal(n.narration[0].start, 0.1);
  assert.equal(n.narration[1].start, 3.6);
  assert.equal(n.narration[2].start, 7.6);
  assert.equal(n.music[0].duration, 9.5);
  const cue = n.captions.find((c) => c.start >= 3.6 && c.start < 7)!;
  assert.ok(cue && captionAt(n.captions, cue.start + 0.01)?.id === cue.id);
});

test('reordering keeps narration attached to its scene clip', () => {
  const n = moveClip(tl(), 1, 0);
  assert.deepEqual(n.clips.map((c) => c.id), ['c2', 'c1', 'c3']);
  const s = clipStarts(n);
  assert.equal(n.narration.find((x) => x.sceneId === 's2')!.start, s[0] + 0.1);
  assert.equal(n.narration.find((x) => x.sceneId === 's1')!.start, s[1] + 0.1);
  assert.equal(timelineDuration(n), 9);
});

test('removing a clip removes its narration and captions', () => {
  const t = tl();
  const perScene = t.captions.filter((c) => c.start >= 3.1 && c.start < 6.6).length;
  const n = removeClip(t, 'c2');
  assert.equal(n.narration.length, 2);
  assert.equal(n.captions.length, t.captions.length - perScene);
  assert.equal(n.narration[1].start, 3.1);
  // every remaining cue sits inside a remaining narration clip
  for (const c of n.captions) assert.ok(n.narration.some((a) => c.start >= a.start - 0.01 && c.end <= a.start + a.duration + 0.01));
});

test('fit to narration sizes clips to voice + padding', () => {
  const n = fitToNarration(tl());
  assert.deepEqual(n.clips.map((c) => c.duration), [2.9, 3.9, 1.9]);
  assert.equal(n.narration[1].start, 3.0);
});

test('transition length is clamped by neighbours', () => {
  const t = tl();
  t.clips[2].transitionDuration = 5;
  assert.equal(transitionLength(t, 2), 1);
  assert.equal(transitionLength(t, 0), 0);
});

test('captions split by max words and stay inside the span', () => {
  const cues = cuesForSpan('Bir anda ayakların yerden kesiliyor. Şehir havaya yükseliyor!', 2, 4, 3);
  assert.ok(cues.length >= 3);
  assert.ok(cues[0].start >= 2 && cues.at(-1)!.end <= 6.001);
  for (const c of cues) assert.ok(c.text.split(' ').length <= 3);
  const back = parseSrtOrVtt(toSrt(cues));
  assert.equal(back.length, cues.length);
  assert.equal(back[0].text, cues[0].text);
  assert.ok(toVtt(cues).startsWith('WEBVTT'));
  assert.ok(toAss(cues, DEFAULT_CAPTION_STYLE, 720, 1280).split('Dialogue:').length - 1 >= cues.reduce((a, c) => a + (c.words?.length ?? 1), 0));
});

test('AI JSON extraction tolerates fences and trailing commas', () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"a": [1,2,],}\n```'), { a: [1, 2] });
  assert.throws(() => extractJson('no json here'));
  const s = normalizeScene({ narration: 'x', camera: 'Slow Zoom In', transition: 'whip pan' }, 3);
  assert.equal(s.camera, 'zoomIn');
  assert.equal(s.transition, 'slideLeft');
  assert.equal(normalizeTransition('fade to black'), 'fadeBlack');
});

test('camera motion never shows outside the image', () => {
  for (const m of ['zoomIn', 'panLeft', 'panUp', 'kenBurns', 'pullOut'] as const) {
    const k = motionKeys(m, 1.5);
    for (const p of [0, 0.5, 1]) {
      const r = sourceRect(1344, 768, 720, 1280, k, p);
      assert.ok(r.sx >= -1e-6 && r.sy >= -1e-6 && r.sx + r.sw <= 1344 + 1e-6 && r.sy + r.sh <= 768 + 1e-6, `${m} @${p}`);
    }
  }
});

void applyMainTrack;
