import type { Character, Project, Scene } from '@/types';
import { VISUAL_STYLE_PROMPTS } from '@/config/states';
import { characterLine } from './prompts';

const COMPOSITION: Record<string, string> = {
  '16:9': 'wide 16:9 cinematic composition',
  '9:16': 'vertical 9:16 composition, main subject in the center third with headroom for captions',
  '1:1': 'square composition, centered subject',
};

export function charactersInScene(project: Project, scene: Scene): Character[] {
  const text = `${scene.imagePrompt} ${scene.visual} ${scene.characters.join(' ')}`.toLowerCase();
  return project.characters.filter((c) => c.name && text.includes(c.name.toLowerCase()));
}

export function buildScenePrompt(project: Project, scene: Scene) {
  const style = VISUAL_STYLE_PROMPTS[project.brief.visualStyle];
  const chars = charactersInScene(project, scene);
  const positive = [
    scene.imagePrompt || scene.visual,
    chars.length ? `Characters: ${chars.map(characterLine).join('; ')}` : '',
    scene.environment ? `Setting: ${scene.environment}` : '',
    style.positive,
    COMPOSITION[project.brief.aspect],
    'no text, no captions, no watermark',
  ]
    .filter(Boolean)
    .join('. ');
  const negative = [scene.negativePrompt, style.negative].filter(Boolean).join(', ');
  const seed = project.imageSettings.seedMode === 'fixed' ? (project.imageSettings.baseSeed + scene.number * 7919) % 2147483647 : undefined;
  const reference = project.imageSettings.useCharacterReference ? chars.find((c) => c.referenceAssetId)?.referenceAssetId : undefined;
  return { positive, negative, seed, reference };
}
