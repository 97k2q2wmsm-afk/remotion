// Single source of truth for every status, mode and enumerated option a person can see.
// Types are derived from these arrays; label tables are Record<State, string> so a new
// value fails the typecheck until every screen has words for it.

export const ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export const ASPECT_LABELS: Record<AspectRatio, string> = {
  '16:9': '16:9 Landscape',
  '9:16': '9:16 Vertical',
  '1:1': '1:1 Square',
};

export const VIDEO_FORMATS = ['shorts', 'standard', 'reels', 'custom'] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];
export const FORMAT_LABELS: Record<VideoFormat, string> = {
  shorts: 'YouTube Shorts',
  standard: 'Standard YouTube video',
  reels: 'Instagram Reels',
  custom: 'Custom duration',
};
export const FORMAT_DEFAULTS: Record<VideoFormat, { aspect: AspectRatio; duration: number; scenes: number }> = {
  shorts: { aspect: '9:16', duration: 55, scenes: 8 },
  standard: { aspect: '16:9', duration: 480, scenes: 24 },
  reels: { aspect: '9:16', duration: 45, scenes: 7 },
  custom: { aspect: '16:9', duration: 120, scenes: 10 },
};

export const VISUAL_STYLES = ['cartoon2d', 'digitalPainting', 'cinematic', 'historical', 'documentary', 'mixed'] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number];
export const VISUAL_STYLE_LABELS: Record<VisualStyle, string> = {
  cartoon2d: 'Premium 2D cartoon illustration',
  digitalPainting: 'Digital painting',
  cinematic: 'Cinematic photorealism',
  historical: 'Historical illustration',
  documentary: 'Documentary imagery',
  mixed: 'Mixed visual styles',
};
export const VISUAL_STYLE_PROMPTS: Record<VisualStyle, { positive: string; negative: string }> = {
  cartoon2d: {
    positive: 'premium 2D cartoon illustration, clean bold linework, flat cel shading, expressive characters, vibrant harmonious palette, high detail',
    negative: 'photorealistic, 3d render, blurry, low quality, distorted anatomy, extra fingers, text, watermark, logo',
  },
  digitalPainting: {
    positive: 'detailed digital painting, painterly brush strokes, dramatic lighting, rich color, concept art quality',
    negative: 'photo, low quality, blurry, deformed, extra limbs, text, watermark, logo',
  },
  cinematic: {
    positive: 'cinematic photorealistic film still, 35mm lens, shallow depth of field, volumetric lighting, color graded, highly detailed',
    negative: 'cartoon, illustration, painting, lowres, blurry, deformed face, extra fingers, text, watermark, logo',
  },
  historical: {
    positive: 'historical illustration, period-accurate costumes and architecture, aged parchment tones, engraving-inspired detail, museum quality',
    negative: 'modern objects, anachronism, cartoon, lowres, blurry, text, watermark, logo',
  },
  documentary: {
    positive: 'documentary photograph, natural light, realistic, authentic environment, editorial photojournalism',
    negative: 'cartoon, fantasy, oversaturated, lowres, blurry, text, watermark, logo',
  },
  mixed: {
    positive: 'striking editorial visual, high detail, strong composition, dramatic lighting',
    negative: 'lowres, blurry, deformed, text, watermark, logo',
  },
};

export const STAGE_IDS = [
  'research',
  'titles',
  'structure',
  'hook',
  'script',
  'scenes',
  'storyboard',
  'characters',
  'prompts',
  'images',
  'thumbConcepts',
  'thumbnails',
  'voice',
  'subtitles',
  'sfx',
  'music',
  'edit',
  'render',
  'seo',
  'package',
] as const;
export type StageId = (typeof STAGE_IDS)[number];
export const STAGE_LABELS: Record<StageId, string> = {
  research: 'Topic research & concept',
  titles: 'Video title ideas',
  structure: 'Story structure',
  hook: 'Hook',
  script: 'Narration script',
  scenes: 'Scene breakdown',
  storyboard: 'Storyboard',
  characters: 'Character references',
  prompts: 'Image prompts',
  images: 'Scene images',
  thumbConcepts: 'Thumbnail concepts',
  thumbnails: 'Thumbnail design',
  voice: 'Voice-over',
  subtitles: 'Subtitles',
  sfx: 'Sound effects',
  music: 'Background music',
  edit: 'Automatic edit',
  render: 'Final render',
  seo: 'SEO package',
  package: 'Download package',
};

export const STAGE_STATUSES = ['pending', 'running', 'done', 'error', 'skipped'] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];
export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  pending: 'Not started',
  running: 'Working…',
  done: 'Done',
  error: 'Failed',
  skipped: 'Skipped',
};

export const IMAGE_JOB_STATUSES = ['none', 'queued', 'generating', 'done', 'failed', 'interrupted'] as const;
export type ImageJobStatus = (typeof IMAGE_JOB_STATUSES)[number];
export const IMAGE_JOB_LABELS: Record<ImageJobStatus, string> = {
  none: 'No image',
  queued: 'Queued',
  generating: 'Generating…',
  done: 'Ready',
  failed: 'Failed',
  interrupted: 'Interrupted',
};

export const MOTION_TYPES = [
  'zoomIn',
  'zoomOut',
  'panLeft',
  'panRight',
  'panUp',
  'panDown',
  'pushIn',
  'pullOut',
  'kenBurns',
  'static',
] as const;
export type MotionType = (typeof MOTION_TYPES)[number];
export const MOTION_LABELS: Record<MotionType, string> = {
  zoomIn: 'Slow zoom in',
  zoomOut: 'Slow zoom out',
  panLeft: 'Pan left',
  panRight: 'Pan right',
  panUp: 'Pan up',
  panDown: 'Pan down',
  pushIn: 'Cinematic push in',
  pullOut: 'Cinematic pull out',
  kenBurns: 'Ken Burns',
  static: 'No movement',
};

export const TRANSITION_TYPES = ['cut', 'dissolve', 'fadeBlack', 'fadeWhite', 'blur', 'zoom', 'slideLeft', 'slideUp', 'film'] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];
export const TRANSITION_LABELS: Record<TransitionType, string> = {
  cut: 'Cut',
  dissolve: 'Cross dissolve',
  fadeBlack: 'Fade through black',
  fadeWhite: 'Flash (fade through white)',
  blur: 'Blur transition',
  zoom: 'Zoom transition',
  slideLeft: 'Slide left',
  slideUp: 'Slide up',
  film: 'Film burn (grayscale fade)',
};

export const EDIT_MODES = ['auto', 'cinematic', 'manual'] as const;
export type EditMode = (typeof EDIT_MODES)[number];
export const EDIT_MODE_LABELS: Record<EditMode, { title: string; description: string }> = {
  auto: { title: 'Full Auto Edit', description: 'Balanced pacing, gentle motion, clean transitions, music and subtitles.' },
  cinematic: {
    title: 'Cinematic Edit',
    description: 'Stronger camera moves, dramatic transitions, scene sound effects, cinematic opening and bold captions.',
  },
  manual: { title: 'Manual Edit', description: 'You control every clip, track and setting. Starts from your current edit.' },
};

export const RENDER_ENGINES = ['auto', 'webcodecs', 'ffmpeg-wasm', 'cloud'] as const;
export type RenderEngine = (typeof RENDER_ENGINES)[number];
export const RENDER_ENGINE_LABELS: Record<RenderEngine, { title: string; description: string }> = {
  auto: { title: 'Automatic', description: 'Fast on-device encoder when available, otherwise FFmpeg in the browser.' },
  webcodecs: { title: 'On-device (WebCodecs)', description: 'Hardware H.264 encoder in Safari/Chrome. Fastest for Shorts.' },
  'ffmpeg-wasm': { title: 'FFmpeg in browser', description: 'FFmpeg.wasm. Slow and memory hungry; short projects only.' },
  cloud: { title: 'Cloud render worker', description: 'Native FFmpeg on your render worker. Best for long videos.' },
};

export const RENDER_RESOLUTIONS = ['720p', '1080p', '2160p'] as const;
export type RenderResolution = (typeof RENDER_RESOLUTIONS)[number];
export const RESOLUTION_LABELS: Record<RenderResolution, string> = {
  '720p': '720p HD',
  '1080p': '1080p Full HD',
  '2160p': '4K UHD',
};

export const RENDER_STATUSES = ['waiting', 'preparing', 'processing', 'rendering', 'finalizing', 'completed', 'failed', 'cancelled'] as const;
export type RenderStatus = (typeof RENDER_STATUSES)[number];
export const RENDER_STATUS_LABELS: Record<RenderStatus, string> = {
  waiting: 'Waiting',
  preparing: 'Preparing',
  processing: 'Processing',
  rendering: 'Rendering',
  finalizing: 'Finalizing',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const CAPTION_POSITIONS = ['bottom', 'center', 'top'] as const;
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];
export const CAPTION_POSITION_LABELS: Record<CaptionPosition, string> = { bottom: 'Bottom', center: 'Center', top: 'Top' };

export const CAPTION_ANIMATIONS = ['none', 'pop', 'fade'] as const;
export type CaptionAnimation = (typeof CAPTION_ANIMATIONS)[number];
export const CAPTION_ANIMATION_LABELS: Record<CaptionAnimation, string> = { none: 'None', pop: 'Pop in', fade: 'Fade in' };

export const PROVIDER_KINDS = ['text', 'image', 'voice'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];
export const PROVIDER_KIND_LABELS: Record<ProviderKind, string> = { text: 'Text / script AI', image: 'Image generation', voice: 'Voice (TTS)' };

export const PROVIDER_BILLINGS = ['free', 'free-tier', 'self-hosted', 'paid'] as const;
export type ProviderBilling = (typeof PROVIDER_BILLINGS)[number];
export const PROVIDER_BILLING_LABELS: Record<ProviderBilling, string> = {
  free: 'Free (no key, rate limited)',
  'free-tier': 'Free tier with quota',
  'self-hosted': 'Self-hosted',
  paid: 'Paid per use',
};

export const FACT_STATUSES = ['fact', 'fiction', 'mixed', 'na'] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];
export const FACT_STATUS_LABELS: Record<FactStatus, string> = {
  fact: 'Verified fact (check sources)',
  fiction: 'Dramatized / fictional',
  mixed: 'Fact with dramatization',
  na: 'Not applicable',
};

export const MUSIC_MOODS = ['calm', 'mystery', 'epic', 'dark', 'uplifting', 'tension'] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];
export const MUSIC_MOOD_LABELS: Record<MusicMood, string> = {
  calm: 'Calm ambient',
  mystery: 'Mystery',
  epic: 'Epic',
  dark: 'Dark',
  uplifting: 'Uplifting',
  tension: 'Tension',
};

export const SFX_KINDS = ['whoosh', 'impact', 'riser', 'swell', 'click', 'rumble', 'chime'] as const;
export type SfxKind = (typeof SFX_KINDS)[number];
export const SFX_LABELS: Record<SfxKind, string> = {
  whoosh: 'Whoosh',
  impact: 'Deep impact',
  riser: 'Riser',
  swell: 'Swell',
  click: 'Click / tick',
  rumble: 'Rumble',
  chime: 'Chime',
};
