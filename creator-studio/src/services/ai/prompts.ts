import type { Channel, Character, Project, Scene } from '@/types';
import { FORMAT_LABELS, MOTION_TYPES, TRANSITION_TYPES, VISUAL_STYLE_LABELS, VISUAL_STYLE_PROMPTS } from '@/config/states';
import { estimateNarrationSeconds, langCode } from '@/utils';
import type { ChatMessage } from './client';

const WPS: Record<string, number> = { tr: 2.1, en: 2.5, es: 2.6 };

export function wordBudget(project: Project): number {
  const wps = WPS[langCode(project.brief.language)] ?? 2.4;
  return Math.max(20, Math.round(project.brief.targetDuration * wps * 0.95));
}

function channelBlock(channel?: Channel): string {
  if (!channel) return 'No channel profile selected.';
  return [
    `Channel: ${channel.name}`,
    channel.description && `About: ${channel.description}`,
    channel.targetAudience && `Audience: ${channel.targetAudience}`,
    channel.category && `Category: ${channel.category}`,
    channel.narrationStyle && `Narration style: ${channel.narrationStyle}`,
    channel.visualIdentity && `Visual identity: ${channel.visualIdentity}`,
    channel.thumbnailRules && `Thumbnail rules: ${channel.thumbnailRules}`,
    channel.brandColors.length ? `Brand colors: ${channel.brandColors.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function briefBlock(p: Project): string {
  const b = p.brief;
  return [
    `Topic: ${b.topic}`,
    `Language for ALL viewer-facing text: ${b.language}`,
    `Format: ${FORMAT_LABELS[b.format]} (${b.aspect}), target duration ${Math.round(b.targetDuration)} seconds`,
    b.audience && `Target audience: ${b.audience}`,
    b.storytelling && `Storytelling style: ${b.storytelling}`,
    `Visual style: ${VISUAL_STYLE_LABELS[b.visualStyle]}`,
    b.tone && `Narration tone: ${b.tone}`,
    `Number of scenes: ${b.sceneCount}`,
    b.referenceText && `Reference material from the creator (treat as source notes):\n"""${b.referenceText.slice(0, 12000)}"""`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function characterLine(c: Character): string {
  return [c.name, c.age, c.face, c.hair, c.clothing, c.body, c.features].filter(Boolean).join(', ');
}

const SYSTEM = `You are the head writer of a top YouTube documentary-storytelling studio.
You write retention-optimized narration: a scroll-stopping hook in the first 3 seconds, open loops, escalating stakes, concrete sensory details, no filler, no repetition, a satisfying ending and a natural call to action.
Events must be in logical chronological order with no contradictions.
For historical or factual topics you clearly separate documented facts from dramatization and never invent statistics, quotes or sources.
You always answer with ONE valid JSON object and nothing else.`;

export function conceptMessages(p: Project, channel?: Channel): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `${channelBlock(channel)}

${briefBlock(p)}

Develop the video concept. Return JSON:
{
  "research": "key background knowledge about the topic (bullet-style sentences, in ${p.brief.language})",
  "verifiedFacts": ["widely documented facts the script may rely on (state uncertainty when relevant)"],
  "fictionalElements": ["elements that will be dramatized or imagined"],
  "factsNote": "one sentence telling the creator what must be fact-checked before publishing",
  "concept": "the angle and emotional promise of the video in 2-3 sentences",
  "titleIdeas": ["10 curiosity-driven title ideas in ${p.brief.language}, max 70 characters each"],
  "structure": [{"part": "Hook | Setup | Escalation | Climax | Resolution | CTA", "summary": "what happens"}],
  "hook": "the exact opening line (first 3 seconds), in ${p.brief.language}"
}`,
    },
  ];
}

export function scriptMessages(p: Project, channel?: Channel): ChatMessage[] {
  const words = wordBudget(p);
  const per = Math.max(6, Math.round(words / p.brief.sceneCount));
  const style = VISUAL_STYLE_PROMPTS[p.brief.visualStyle];
  const chars = p.characters.length ? `Recurring characters (reuse names exactly):\n${p.characters.map((c) => `- ${characterLine(c)}`).join('\n')}` : '';
  const concept = p.concept
    ? `Approved concept: ${p.concept.concept}\nHook: ${p.concept.hook}\nStructure:\n${p.concept.structure.map((s) => `- ${s.part}: ${s.summary}`).join('\n')}\nVerified facts:\n${p.concept.verifiedFacts.map((f) => `- ${f}`).join('\n')}`
    : '';
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `${channelBlock(channel)}

${briefBlock(p)}

${concept}
${chars}

Write the full narration and scene breakdown.
Rules:
- Exactly ${p.brief.sceneCount} scenes. Total narration about ${words} words (≈${per} words per scene) so the voice-over lasts ≈${Math.round(p.brief.targetDuration)} s.
- Scene 1 narration IS the hook. The last scene ends the story and includes a natural call to action.
- Narration in ${p.brief.language}; natural spoken rhythm, short sentences, no stage directions or emojis in narration.
- "imagePrompt" in ENGLISH, one self-contained image description: subject, action, setting, shot type (vary: wide, medium, close-up, low angle, aerial, over-the-shoulder), lighting and mood. Never repeat the same composition twice in a row. Do not put text or captions inside images. Describe recurring characters by name AND appearance.
- Visual style for every image: ${style.positive}.
- "negativePrompt" in English: what must not appear.
- "camera" one of: ${MOTION_TYPES.join(', ')} — choose by content (reveals: zoomOut/pullOut, tension: pushIn, landscapes: panLeft/panRight, tall subjects: panUp). Vary them.
- "transition" into the scene, one of: ${TRANSITION_TYPES.join(', ')} — use cut for fast energy, dissolve for time passing, fadeWhite for shocks, fadeBlack for chapter changes.
- "factStatus": fact | fiction | mixed | na.

Return JSON:
{
  "hook": "opening line",
  "scenes": [{
    "narration": "...",
    "visual": "what the viewer sees (in ${p.brief.language})",
    "imagePrompt": "...",
    "negativePrompt": "...",
    "camera": "zoomIn",
    "characters": ["names present"],
    "environment": "place, era, time of day, weather",
    "transition": "dissolve",
    "sfx": ["2-3 short sound effect ideas"],
    "factStatus": "fact"
  }],
  "ending": "closing line",
  "cta": "call to action line"
}`,
    },
  ];
}

export function sceneRegenMessages(p: Project, scene: Scene, instruction: string, channel?: Channel): ChatMessage[] {
  const idx = p.scenes.findIndex((s) => s.id === scene.id);
  const prev = p.scenes[idx - 1];
  const next = p.scenes[idx + 1];
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `${channelBlock(channel)}

${briefBlock(p)}

Rewrite scene ${scene.number} of ${p.scenes.length}. Keep continuity with neighbours.
Previous scene narration: ${prev?.narration ?? '(none — this is the opening hook)'}
Current scene: ${JSON.stringify({ narration: scene.narration, visual: scene.visual, imagePrompt: scene.imagePrompt })}
Next scene narration: ${next?.narration ?? '(none — this is the ending)'}
Instruction from the creator: ${instruction || 'Make it more gripping and visual, same length.'}

Return JSON with the same fields: {"narration","visual","imagePrompt","negativePrompt","camera","characters","environment","transition","sfx","factStatus"}. imagePrompt in English, narration in ${p.brief.language}.`,
    },
  ];
}

export function charactersMessages(p: Project, channel?: Channel): ChatMessage[] {
  const existing = p.characters.map((c) => `- ${characterLine(c)}`).join('\n');
  const narration = p.scenes.map((s) => s.narration).join(' ').slice(0, 6000);
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `${channelBlock(channel)}
Topic: ${p.brief.topic}
Visual style: ${VISUAL_STYLE_LABELS[p.brief.visualStyle]}
Script: ${narration}
${existing ? `Existing character references (keep them, refine only if empty fields):\n${existing}` : ''}

List every recurring on-screen character (people or creatures that appear in 2+ scenes; max 5) with a precise, reusable visual description in ENGLISH so an image model draws them identically in every scene.
Return JSON: {"characters":[{"name","face","hair","clothing","age","body","features","style"}]}`,
    },
  ];
}

export function thumbConceptMessages(p: Project, channel?: Channel): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `${channelBlock(channel)}
Video topic: ${p.brief.topic}
Title ideas: ${(p.seo?.recommended ?? p.concept?.titleIdeas ?? []).slice(0, 5).join(' | ')}
Hook: ${p.concept?.hook ?? p.scenes[0]?.narration ?? ''}
Visual style: ${VISUAL_STYLE_LABELS[p.brief.visualStyle]}
Characters: ${p.characters.map(characterLine).join(' / ') || 'none'}

Design 4 DISTINCT YouTube thumbnail concepts (different composition, emotion and color story each — never the same template).
Principles: strong curiosity gap, one large expressive face or subject, one clear focal point, high contrast, readable on a phone, max 4 words of text in ${p.brief.language}.
"imagePrompt" in English describes ONLY the background/character artwork (no text in image), 16:9, ${VISUAL_STYLE_PROMPTS[p.brief.visualStyle].positive}. Leave empty space where the text goes (say where).
"layout" one of: text-left, text-right, bottom-bar, center-impact.
Return JSON: {"concepts":[{"title","text","composition","emotion","colors":["#hex","#hex"],"imagePrompt","layout"}]}`,
    },
  ];
}

export function seoMessages(p: Project, channel?: Channel): ChatMessage[] {
  const narration = p.scenes.map((s) => s.narration).join(' ').slice(0, 8000);
  let t = 0;
  const chapters = p.scenes
    .map((s) => {
      const line = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} ${s.visual.slice(0, 40)}`;
      t += s.duration || estimateNarrationSeconds(s.narration, p.brief.language);
      return line;
    })
    .join('\n');
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `${channelBlock(channel)}
${briefBlock(p)}
Script: ${narration}
Scene start times (for chapters, only for videos longer than 2 minutes):
${chapters}

Create the YouTube SEO package in ${p.brief.language}. Do NOT invent search volumes, rankings or statistics.
Return JSON:
{
  "titles": ["10 title alternatives, max 70 chars, curiosity + keyword"],
  "recommended": ["the best 3 of them"],
  "description": "full description: 2-line hook, summary, chapters if long-form, sources/fact note if factual, call to action",
  "keywords": ["15 search phrases people plausibly type"],
  "tags": ["20-30 tags, total under 450 characters"],
  "hashtags": ["#3-5 hashtags"],
  "pinnedComment": "an engaging question to pin",
  "cta": "subscribe call to action line",
  "promo": "short promotional text for community post / social (max 280 chars)",
  "chapters": "chapter list or empty string for Shorts"
}`,
    },
  ];
}
