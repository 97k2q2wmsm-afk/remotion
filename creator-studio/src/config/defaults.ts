import type { AppSettings, CaptionStyle, Channel, Project, StageState, Brief, AudioMix } from '@/types';
import { STAGE_IDS, type StageId } from './states';
import { uid } from '@/utils';

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  enabled: true,
  font: 'Montserrat',
  size: 5.2,
  color: '#FFFFFF',
  highlightColor: '#FFD23F',
  wordHighlight: true,
  outlineColor: '#000000',
  outlineWidth: 6,
  background: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.55,
  position: 'bottom',
  offset: 14,
  uppercase: false,
  animation: 'pop',
  maxWords: 6,
};

export const DEFAULT_MIX: AudioMix = {
  narration: 1,
  music: 0.35,
  sfx: 0.7,
  ducking: true,
  duckLevel: 0.35,
  normalize: true,
  musicFadeIn: 1.5,
  musicFadeOut: 2.5,
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  uiLanguage: 'en',
  defaultFormat: 'shorts',
  defaultVisualStyle: 'cartoon2d',
  defaultLanguage: 'English',
  imageConcurrency: 1,
  defaultRender: { resolution: '720p', engine: 'auto', fps: 30, videoBitrate: 0 },
};

function emptyIntro() {
  return { enabled: false, text: '', subtitle: '', duration: 2.5 };
}

export function newChannel(partial: Partial<Channel> = {}): Channel {
  const now = Date.now();
  return {
    id: uid('ch'),
    name: 'New channel',
    description: '',
    language: 'English',
    targetAudience: '',
    category: '',
    visualIdentity: '',
    brandColors: ['#7C5CFF', '#3EA6FF', '#0B0D17'],
    thumbnailRules: '',
    narrationStyle: '',
    preferredDuration: 60,
    preferredAspect: '9:16',
    defaultFormat: 'shorts',
    defaultVisualStyle: 'cartoon2d',
    characters: [],
    exampleVideos: [],
    intro: emptyIntro(),
    outro: emptyIntro(),
    titleFont: 'Anton',
    voice: { speed: 1 },
    musicMood: 'mystery',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Editable starter profiles. Each channel keeps its own identity; nothing is shared implicitly. */
export function seedChannels(): Channel[] {
  return [
    newChannel({
      name: 'Başına Gelseydi',
      description:
        '"Ya bu gerçekten benim başıma gelseydi?" — what-if science and survival stories told from the viewer\'s point of view. Series: Ya Böyle Olsaydı?',
      language: 'Turkish',
      targetAudience: 'Turkish-speaking viewers 14-35 who love curiosity, science and "what if" scenarios',
      category: 'Science & what-if storytelling',
      visualIdentity:
        'Premium 2D cartoon illustration, bold outlines, warm Istanbul streets and everyday Turkish life, expressive faces, playful but cinematic lighting',
      brandColors: ['#FFD23F', '#FF7A2F', '#3EC5FF', '#FF4F7B', '#15121C'],
      thumbnailRules:
        'One huge expressive character face reacting, yellow Anton text max 3 words with black outline, high contrast, one clear object of danger, no clutter',
      narrationStyle: 'Second person ("sen"), energetic, suspenseful, short punchy sentences, scientific facts explained simply',
      preferredDuration: 55,
      preferredAspect: '9:16',
      defaultFormat: 'shorts',
      defaultVisualStyle: 'cartoon2d',
      characters: [
        {
          id: uid('chr'),
          name: 'Kaan',
          face: 'friendly oval face, big expressive brown eyes, thick dark eyebrows, light stubble',
          hair: 'short wavy dark brown hair',
          clothing: 'mustard yellow hoodie, dark jeans, white sneakers',
          age: 'about 25 years old',
          body: 'average height, slim build',
          features: 'small scar on left eyebrow, always carries a red backpack',
          style: 'premium 2D cartoon, bold outlines',
        },
      ],
      intro: { enabled: false, text: 'BAŞINA GELSEYDİ', subtitle: 'Ya böyle olsaydı?', duration: 2 },
      outro: { enabled: true, text: 'Abone ol!', subtitle: '@basinagelseydi', duration: 2.5 },
      titleFont: 'Anton',
      musicMood: 'tension',
    }),
    newChannel({
      name: 'La Voz del Legado',
      description: 'Historias reales de la historia contadas con emoción: imperios, catástrofes y personajes olvidados.',
      language: 'Spanish',
      targetAudience: 'Spanish-speaking history lovers 18-55 in Spain and Latin America',
      category: 'History & documentary storytelling',
      visualIdentity:
        'Historical illustration and digital painting, warm candle and fire light, parchment and bronze tones, epic wide shots, period-accurate details',
      brandColors: ['#C9A227', '#7A1F1F', '#1B1612', '#E8DCC2'],
      thumbnailRules:
        'Dramatic historical scene, one human face in danger or awe, gold Cinzel text max 4 words, dark vignette, warm vs. cold contrast',
      narrationStyle: 'Solemn documentary narrator, vivid sensory details, clear separation of documented facts and dramatization',
      preferredDuration: 60,
      preferredAspect: '9:16',
      defaultFormat: 'shorts',
      defaultVisualStyle: 'historical',
      intro: { enabled: false, text: 'LA VOZ DEL LEGADO', subtitle: '', duration: 2 },
      outro: { enabled: true, text: 'Suscríbete', subtitle: 'La historia no se olvida', duration: 2.5 },
      titleFont: 'Cinzel',
      musicMood: 'epic',
    }),
    newChannel({
      name: 'About the World',
      description: 'Fascinating places, cultures and phenomena from around the world, explained clearly.',
      language: 'English',
      targetAudience: 'Curious English-speaking viewers worldwide, 16-45',
      category: 'Geography, culture & explainers',
      visualIdentity: 'Cinematic photorealism and documentary imagery, golden hour, aerial establishing shots, clean modern graphics',
      brandColors: ['#3EA6FF', '#22D3A6', '#0B1220', '#FFFFFF'],
      thumbnailRules: 'Striking location photo, bold white Montserrat 800 text with blue highlight box, max 4 words, arrow or circle on focal point',
      narrationStyle: 'Warm, curious, conversational explainer; numbers and comparisons that make scale tangible',
      preferredDuration: 480,
      preferredAspect: '16:9',
      defaultFormat: 'standard',
      defaultVisualStyle: 'cinematic',
      intro: { enabled: true, text: 'ABOUT THE WORLD', subtitle: '', duration: 2.5 },
      outro: { enabled: true, text: 'Thanks for watching', subtitle: 'Subscribe for more', duration: 3 },
      titleFont: 'Montserrat',
      musicMood: 'uplifting',
    }),
  ];
}

export function initialStages(): Record<StageId, StageState> {
  return Object.fromEntries(STAGE_IDS.map((s) => [s, { status: 'pending' } satisfies StageState])) as Record<StageId, StageState>;
}

export function newProject(brief: Brief, channel?: Channel): Project {
  const now = Date.now();
  return {
    id: uid('p'),
    title: brief.topic.slice(0, 80) || 'Untitled video',
    channelId: channel?.id,
    createdAt: now,
    updatedAt: now,
    brief,
    stages: initialStages(),
    scenes: [],
    characters: channel ? structuredClone(channel.characters) : [],
    thumbConcepts: [],
    thumbDesigns: [],
    thumbExports: [],
    seoVersions: [],
    voice: { providerId: channel?.voice.providerId, voiceId: channel?.voice.voiceId, speed: channel?.voice.speed ?? 1, pitch: 0 },
    imageSettings: { seedMode: 'fixed', baseSeed: Math.floor(Math.random() * 1_000_000), useCharacterReference: true, referenceStrength: 0.5, quality: 'standard' },
    music: { source: 'synth', mood: channel?.musicMood ?? 'mystery' },
    captionStyle: {
      ...DEFAULT_CAPTION_STYLE,
      highlightColor: channel?.brandColors[0] ?? DEFAULT_CAPTION_STYLE.highlightColor,
      font: brief.aspect === '9:16' ? 'Montserrat' : DEFAULT_CAPTION_STYLE.font,
    },
    editMode: 'auto',
    timelines: {},
    render: { resolution: '720p', engine: 'auto', fps: 30, videoBitrate: 0 },
    renders: [],
  };
}
