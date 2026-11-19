import type { Character, Concept, FactStatus, MotionType, Scene, SeoPackage, ThumbConcept, ThumbLayout, TransitionType } from '@/types';
import { FACT_STATUSES, MOTION_TYPES, TRANSITION_TYPES } from '@/config/states';
import { uid } from '@/utils';

/** Extracts the first JSON object from model output (handles code fences, prose, trailing commas). */
export function extractJson<T = unknown>(raw: string): T {
  let text = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) text = fence[1].trim();
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error('The AI response did not contain JSON. Try again or switch the text provider.');
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  const end = text.lastIndexOf(close);
  if (end <= start) throw new Error('The AI response was cut off before the JSON finished. Try fewer scenes or a model with longer output.');
  let candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    candidate = candidate
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[“”]/g, '"')
      .replace(/\t/g, ' ');
    try {
      return JSON.parse(candidate) as T;
    } catch (err) {
      throw new Error(`Could not parse the AI JSON response (${(err as Error).message}). Try again.`);
    }
  }
}

const s = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : fallback);
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : typeof v === 'string' ? v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) : [];

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const v = s(value).replace(/[\s_-]/g, '').toLowerCase();
  return allowed.find((a) => a.toLowerCase() === v) ?? fallback;
}

const MOTION_ALIASES: Record<string, MotionType> = {
  zoomin: 'zoomIn',
  slowzoomin: 'zoomIn',
  zoomout: 'zoomOut',
  slowzoomout: 'zoomOut',
  panleft: 'panLeft',
  panright: 'panRight',
  panup: 'panUp',
  tiltup: 'panUp',
  pandown: 'panDown',
  tiltdown: 'panDown',
  pushin: 'pushIn',
  dollyin: 'pushIn',
  pullout: 'pullOut',
  dollyout: 'pullOut',
  kenburns: 'kenBurns',
  static: 'static',
  none: 'static',
};

export function normalizeMotion(v: unknown, index: number): MotionType {
  const key = s(v).replace(/[\s_-]/g, '').toLowerCase();
  if (MOTION_ALIASES[key]) return MOTION_ALIASES[key];
  const found = MOTION_TYPES.find((m) => key.includes(m.toLowerCase()));
  if (found) return found;
  const rotation: MotionType[] = ['zoomIn', 'panRight', 'kenBurns', 'zoomOut', 'panLeft', 'pushIn', 'panUp', 'pullOut'];
  return rotation[index % rotation.length];
}

const TRANSITION_ALIASES: Record<string, TransitionType> = {
  cut: 'cut',
  hardcut: 'cut',
  crossdissolve: 'dissolve',
  dissolve: 'dissolve',
  crossfade: 'dissolve',
  fade: 'fadeBlack',
  fadetoblack: 'fadeBlack',
  fadeblack: 'fadeBlack',
  fadein: 'fadeBlack',
  fadeout: 'fadeBlack',
  flash: 'fadeWhite',
  whiteflash: 'fadeWhite',
  fadewhite: 'fadeWhite',
  blur: 'blur',
  zoom: 'zoom',
  zoomtransition: 'zoom',
  whip: 'slideLeft',
  whippan: 'slideLeft',
  slide: 'slideLeft',
  slideleft: 'slideLeft',
  slideup: 'slideUp',
  film: 'film',
  filmburn: 'film',
};

export function normalizeTransition(v: unknown): TransitionType {
  const key = s(v).replace(/[\s_-]/g, '').toLowerCase();
  return TRANSITION_ALIASES[key] ?? pickEnum(v, TRANSITION_TYPES, 'dissolve');
}

export function normalizeConcept(j: Record<string, unknown>): Concept {
  return {
    research: s(j.research),
    concept: s(j.concept),
    factsNote: s(j.factsNote ?? j.facts_note),
    verifiedFacts: arr(j.verifiedFacts ?? j.verified_facts),
    fictionalElements: arr(j.fictionalElements ?? j.fictional_elements),
    titleIdeas: arr(j.titleIdeas ?? j.titles).slice(0, 15),
    structure: Array.isArray(j.structure)
      ? (j.structure as unknown[]).map((x, i) => {
          if (typeof x === 'string') return { part: `Part ${i + 1}`, summary: x };
          const o = (x ?? {}) as Record<string, unknown>;
          return { part: s(o.part ?? o.title ?? o.name, `Part ${i + 1}`), summary: s(o.summary ?? o.description) };
        })
      : [],
    hook: s(j.hook),
  };
}

export function normalizeScene(o: Record<string, unknown>, index: number): Scene {
  const narration = s(o.narration ?? o.narrator ?? o.text ?? o.voiceover);
  return {
    id: uid('s'),
    number: index + 1,
    start: 0,
    end: 0,
    duration: 0,
    narration,
    visual: s(o.visual ?? o.visualDescription ?? o.visual_description),
    imagePrompt: s(o.imagePrompt ?? o.image_prompt ?? o.prompt),
    negativePrompt: s(o.negativePrompt ?? o.negative_prompt),
    camera: normalizeMotion(o.camera ?? o.cameraMovement ?? o.camera_movement, index),
    characters: arr(o.characters),
    environment: s(o.environment),
    transition: index === 0 ? 'fadeBlack' : normalizeTransition(o.transition),
    sfx: arr(o.sfx ?? o.soundEffects ?? o.sound_effects),
    factStatus: pickEnum(o.factStatus ?? o.fact_status, FACT_STATUSES, 'na') as FactStatus,
    imageHistory: [],
    imageStatus: 'none',
  };
}

export function normalizeCharacters(j: Record<string, unknown>): Character[] {
  const list = Array.isArray(j.characters) ? j.characters : Array.isArray(j) ? j : [];
  return (list as Record<string, unknown>[]).map((c) => ({
    id: uid('chr'),
    name: s(c.name, 'Character'),
    face: s(c.face),
    hair: s(c.hair),
    clothing: s(c.clothing ?? c.clothes),
    age: s(c.age),
    body: s(c.body ?? c.bodyProportions),
    features: s(c.features ?? c.distinguishingFeatures),
    style: s(c.style ?? c.visualStyle),
  }));
}

const LAYOUTS: ThumbLayout[] = ['text-left', 'text-right', 'bottom-bar', 'center-impact'];

export function normalizeThumbConcepts(j: Record<string, unknown>): ThumbConcept[] {
  const list = Array.isArray(j.concepts) ? (j.concepts as Record<string, unknown>[]) : [];
  return list.map((c, i) => ({
    id: uid('tc'),
    title: s(c.title, `Concept ${i + 1}`),
    text: s(c.text ?? c.overlayText, ''),
    composition: s(c.composition),
    emotion: s(c.emotion),
    colors: arr(c.colors).filter((x) => /^#[0-9a-f]{3,8}$/i.test(x)),
    imagePrompt: s(c.imagePrompt ?? c.image_prompt),
    layout: (LAYOUTS.includes(c.layout as ThumbLayout) ? c.layout : LAYOUTS[i % LAYOUTS.length]) as ThumbLayout,
  }));
}

export function normalizeSeo(j: Record<string, unknown>): SeoPackage {
  const tags = arr(j.tags);
  return {
    titles: arr(j.titles).slice(0, 10),
    recommended: arr(j.recommended ?? j.recommendedTitles).slice(0, 3),
    description: s(j.description),
    keywords: arr(j.keywords),
    tags,
    hashtags: arr(j.hashtags).map((h) => (h.startsWith('#') ? h : `#${h.replace(/\s+/g, '')}`)),
    pinnedComment: s(j.pinnedComment ?? j.pinned_comment),
    cta: s(j.cta),
    promo: s(j.promo ?? j.promotionalText ?? j.shortPromo),
    chapters: s(j.chapters),
  };
}
