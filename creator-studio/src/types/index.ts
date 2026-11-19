// Core domain model for Creator Studio AI.
// Every status-like union is defined once in src/config/states.ts and imported here.
import type {
  AspectRatio,
  CaptionAnimation,
  CaptionPosition,
  EditMode,
  ImageJobStatus,
  MotionType,
  ProviderBilling,
  ProviderKind,
  RenderEngine,
  RenderResolution,
  RenderStatus,
  StageId,
  StageStatus,
  TransitionType,
  VideoFormat,
  VisualStyle,
  FactStatus,
  MusicMood,
  SfxKind,
} from '@/config/states';

export type {
  AspectRatio,
  CaptionAnimation,
  CaptionPosition,
  EditMode,
  ImageJobStatus,
  MotionType,
  ProviderBilling,
  ProviderKind,
  RenderEngine,
  RenderResolution,
  RenderStatus,
  StageId,
  StageStatus,
  TransitionType,
  VideoFormat,
  VisualStyle,
  FactStatus,
  MusicMood,
  SfxKind,
};

export interface Character {
  id: string;
  name: string;
  face: string;
  hair: string;
  clothing: string;
  age: string;
  body: string;
  features: string;
  style: string;
  referenceAssetId?: string;
  seed?: number;
}

export interface IntroOutro {
  enabled: boolean;
  text: string;
  subtitle: string;
  duration: number;
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  language: string;
  targetAudience: string;
  category: string;
  visualIdentity: string;
  brandColors: string[];
  thumbnailRules: string;
  narrationStyle: string;
  preferredDuration: number;
  preferredAspect: AspectRatio;
  defaultFormat: VideoFormat;
  defaultVisualStyle: VisualStyle;
  characters: Character[];
  exampleVideos: string[];
  intro: IntroOutro;
  outro: IntroOutro;
  titleFont: FontId;
  voice: { providerId?: string; voiceId?: string; speed: number };
  musicMood: MusicMood;
  createdAt: number;
  updatedAt: number;
}

export type FontId = 'Montserrat' | 'Anton' | 'Cinzel' | 'system-ui' | 'Georgia';

export interface StageState {
  status: StageStatus;
  error?: string;
  updatedAt?: number;
}

export interface Brief {
  topic: string;
  language: string;
  format: VideoFormat;
  aspect: AspectRatio;
  targetDuration: number; // seconds
  audience: string;
  storytelling: string;
  visualStyle: VisualStyle;
  sceneCount: number;
  tone: string;
  referenceText: string;
  referenceAssetIds: string[];
}

export interface Concept {
  research: string;
  concept: string;
  factsNote: string;
  verifiedFacts: string[];
  fictionalElements: string[];
  titleIdeas: string[];
  structure: { part: string; summary: string }[];
  hook: string;
}

export interface Scene {
  id: string;
  number: number;
  start: number;
  end: number;
  duration: number;
  narration: string;
  visual: string;
  imagePrompt: string;
  negativePrompt: string;
  camera: MotionType;
  characters: string[];
  environment: string;
  transition: TransitionType;
  sfx: string[];
  factStatus: FactStatus;
  imageAssetId?: string;
  imageHistory: string[];
  imageStatus: ImageJobStatus;
  imageError?: string;
  audioAssetId?: string;
  audioDuration?: number;
  durationLocked?: boolean; // set when the person edits the duration by hand
}

export interface ScriptInfo {
  hook: string;
  ending: string;
  cta: string;
}

export interface ThumbConcept {
  id: string;
  title: string;
  text: string;
  composition: string;
  emotion: string;
  colors: string[];
  imagePrompt: string;
  layout: ThumbLayout;
}

export type ThumbLayout = 'text-left' | 'text-right' | 'bottom-bar' | 'center-impact';

export interface ThumbLayerBase {
  id: string;
  name: string;
  visible: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
}

export interface ThumbImageLayer extends ThumbLayerBase {
  type: 'image';
  assetId: string;
  crop: { x: number; y: number; w: number; h: number }; // normalized 0..1 source crop
  flipX: boolean;
}

export interface ThumbTextLayer extends ThumbLayerBase {
  type: 'text';
  text: string;
  font: FontId;
  size: number;
  weight: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  align: 'left' | 'center' | 'right';
  uppercase: boolean;
  lineHeight: number;
  highlightColor: string; // background box, '' for none
}

export interface ThumbShapeLayer extends ThumbLayerBase {
  type: 'shape';
  shape: 'rect' | 'gradient' | 'circle';
  color: string;
  color2: string;
  angle: number;
  radius: number;
}

export type ThumbLayer = ThumbImageLayer | ThumbTextLayer | ThumbShapeLayer;

export interface ThumbDesign {
  id: string;
  name: string;
  conceptId?: string;
  background: string;
  layers: ThumbLayer[];
  updatedAt: number;
}

export interface ThumbTemplate {
  id: string;
  name: string;
  channelId?: string;
  design: ThumbDesign;
  createdAt: number;
}

export interface SeoPackage {
  titles: string[];
  recommended: string[];
  description: string;
  keywords: string[];
  tags: string[];
  hashtags: string[];
  pinnedComment: string;
  cta: string;
  promo: string;
  chapters: string;
}

export interface SeoVersion {
  id: string;
  createdAt: number;
  label: string;
  data: SeoPackage;
}

export interface CaptionCue {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: { text: string; start: number; end: number }[];
}

export interface CaptionStyle {
  enabled: boolean;
  font: FontId;
  size: number; // relative to output height, in % (e.g. 5.5)
  color: string;
  highlightColor: string;
  wordHighlight: boolean;
  outlineColor: string;
  outlineWidth: number;
  background: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  position: CaptionPosition;
  offset: number; // % of height from edge
  uppercase: boolean;
  animation: CaptionAnimation;
  maxWords: number;
}

export interface VideoClip {
  id: string;
  kind: 'image' | 'title';
  sceneId?: string;
  assetId?: string;
  title?: { text: string; subtitle: string; background: string; color: string; font: FontId };
  duration: number;
  motion: MotionType;
  motionIntensity: number; // 0.5 .. 1.5
  transition: TransitionType; // transition INTO this clip
  transitionDuration: number;
}

export interface AudioClip {
  id: string;
  assetId: string;
  label: string;
  start: number; // timeline seconds
  offset: number; // trim from source start
  duration: number; // played length
  volume: number; // 0..2
  fadeIn: number;
  fadeOut: number;
  loop?: boolean; // repeat the source to fill `duration` (used for music loops)
  sceneId?: string;
}

export interface TextOverlay {
  id: string;
  text: string;
  start: number;
  end: number;
  font: FontId;
  size: number; // % of height
  color: string;
  x: number; // 0..1 center
  y: number; // 0..1 center
  background: string; // '' none
}

export interface AudioMix {
  narration: number;
  music: number;
  sfx: number;
  ducking: boolean;
  duckLevel: number; // music gain multiplier while narration plays
  normalize: boolean;
  musicFadeIn: number;
  musicFadeOut: number;
}

export interface Timeline {
  version: 1;
  aspect: AspectRatio;
  fps: number;
  clips: VideoClip[];
  narration: AudioClip[];
  music: AudioClip[];
  sfx: AudioClip[];
  captions: CaptionCue[];
  overlays: TextOverlay[];
  captionStyle: CaptionStyle;
  mix: AudioMix;
  updatedAt: number;
}

export interface RenderRecord {
  id: string;
  engine: RenderEngine;
  resolution: RenderResolution;
  status: RenderStatus;
  startedAt: number;
  finishedAt?: number;
  outputAssetId?: string;
  error?: string;
  duration?: number;
  sizeBytes?: number;
}

export interface RenderSettings {
  resolution: RenderResolution;
  engine: RenderEngine;
  fps: number;
  videoBitrate: number; // bits per second, 0 = auto
}

export interface VoiceSettings {
  providerId?: string;
  voiceId?: string;
  model?: string;
  speed: number;
  pitch: number;
  fullAssetId?: string; // uploaded / generated full narration
}

export interface ImageSettings {
  providerId?: string;
  seedMode: 'random' | 'fixed';
  baseSeed: number;
  useCharacterReference: boolean;
  referenceStrength: number; // 0..1
  quality: 'draft' | 'standard' | 'high';
}

export interface MusicSettings {
  source: 'none' | 'synth' | 'library';
  mood: MusicMood;
  assetId?: string;
}

export interface Project {
  id: string;
  title: string;
  channelId?: string;
  createdAt: number;
  updatedAt: number;
  brief: Brief;
  stages: Record<StageId, StageState>;
  concept?: Concept;
  script?: ScriptInfo;
  scenes: Scene[];
  characters: Character[];
  thumbConcepts: ThumbConcept[];
  thumbDesigns: ThumbDesign[];
  thumbExports: string[];
  seo?: SeoPackage;
  seoVersions: SeoVersion[];
  voice: VoiceSettings;
  imageSettings: ImageSettings;
  music: MusicSettings;
  captionStyle: CaptionStyle;
  editMode: EditMode;
  timelines: Partial<Record<EditMode, Timeline>>;
  render: RenderSettings;
  renders: RenderRecord[];
  finalVideoAssetId?: string;
}

export type AssetKind =
  | 'scene-image'
  | 'reference-image'
  | 'character-image'
  | 'thumbnail'
  | 'thumb-source'
  | 'narration'
  | 'music'
  | 'sfx'
  | 'video'
  | 'other';

export interface AssetMeta {
  id: string;
  projectId?: string;
  kind: AssetKind;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
  width?: number;
  height?: number;
  duration?: number;
  favorite?: boolean;
  prompt?: string;
  providerId?: string;
  source?: string; // human-readable origin: provider name, "upload", "synth"
  license?: string;
}

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  type: string; // adapter id from the provider catalog
  name: string;
  enabled: boolean;
  apiKey?: string; // stored on this device only; sent to the app's own server proxy over HTTPS
  endpoint?: string;
  model?: string;
  accountId?: string;
  extra?: Record<string, string>;
  lastTest?: { ok: boolean; message: string; at: number };
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  uiLanguage: 'en' | 'tr' | 'es';
  defaultFormat: VideoFormat;
  defaultVisualStyle: VisualStyle;
  defaultLanguage: string;
  preferredText?: string;
  preferredImage?: string;
  preferredVoice?: string;
  imageConcurrency: number;
  appToken?: string; // matches APP_ACCESS_TOKEN on the server, when set
  cloudWorkerUrl?: string;
  cloudWorkerToken?: string;
  defaultRender: RenderSettings;
}

export interface UsageRecord {
  providerId: string;
  day: string; // YYYY-MM-DD
  requests: number;
  failures: number;
  units: number; // images / characters / tokens depending on provider kind
}
