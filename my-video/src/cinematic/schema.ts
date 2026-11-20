// Cinematic AI Studio — the single definition of the project / scene format.
//
// Imported by BOTH the Remotion engine (bundled) and the Node studio server
// (Node ≥ 22.18 strips the types natively), so this file must stay free of
// runtime imports and of non-erasable TypeScript (no enums, no namespaces).
//
// Every enumerable value has exactly one table below. Types, validation, the UI
// option lists and the router all read these tables; nothing re-types the values.
// Adding an environment / camera move / effect = adding one entry here plus its
// implementation in the engine (the typecheck fails until labels exist).

export const SCHEMA_VERSION = 1;

// ─── Output formats ─────────────────────────────────────────────────────────
export const FORMATS = {
	'16:9': {label: '16:9 YouTube', width: 1920, height: 1080},
	'9:16': {label: '9:16 Shorts / Reels', width: 1080, height: 1920},
	'1:1': {label: '1:1 Square', width: 1080, height: 1080},
} as const;
export type FormatId = keyof typeof FORMATS;

export const FPS_OPTIONS = [24, 30] as const;
export type Fps = (typeof FPS_OPTIONS)[number];

// ─── Production methods (scene router) ──────────────────────────────────────
// Ordered by router priority (spec §5).
export const VISUAL_TYPES = {
	ai_video: {label: 'AI video', priority: 1, needs: 'video provider (ComfyUI Wan 2.2 / LTX, or CLI)'},
	ai_image_animated: {label: 'AI image + 3D camera', priority: 2, needs: 'image provider (ComfyUI / A1111)'},
	procedural_3d: {label: 'Procedural 3D (Three.js)', priority: 3, needs: 'nothing — runs in the browser renderer'},
	blender_3d: {label: 'Blender 3D', priority: 4, needs: 'Blender installed (headless)'},
	user_asset: {label: 'Imported asset', priority: 5, needs: 'an uploaded image or video'},
} as const;
export type VisualType = keyof typeof VISUAL_TYPES;

// ─── Environments ───────────────────────────────────────────────────────────
export const ENVIRONMENTS = {
	forest: {label: 'Forest', keywords: ['forest', 'woods', 'jungle', 'tree', 'orman', 'ağaç', 'bosque', 'selva', 'árbol']},
	mountains: {label: 'Mountains', keywords: ['mountain', 'peak', 'alps', 'himalaya', 'everest', 'dağ', 'zirve', 'montaña', 'cumbre']},
	city: {label: 'City skyline', keywords: ['city', 'metropolis', 'skyline', 'urban', 'new york', 'şehir', 'kent', 'istanbul', 'ciudad']},
	medieval_village: {label: 'Medieval settlement', keywords: ['medieval', 'castle', 'knight', 'village', 'king', 'ortaçağ', 'kale', 'şövalye', 'köy', 'medieval', 'castillo', 'caballero', 'aldea']},
	ancient_roman_city: {label: 'Ancient civilization (Rome)', keywords: ['rome', 'roman', 'ancient', 'empire', 'caesar', 'greek', 'colosseum', 'roma', 'antik', 'imparator', 'sezar', 'antiguo', 'imperio', 'romano']},
	modern_street: {label: 'Modern street', keywords: ['street', 'road', 'traffic', 'car', 'today', 'sokak', 'cadde', 'trafik', 'araba', 'calle', 'tráfico', 'coche']},
	futuristic_city: {label: 'Futuristic city', keywords: ['future', 'futuristic', 'robot', 'ai ', 'cyber', 'space', 'mars', '2100', 'gelecek', 'robot', 'yapay zeka', 'uzay', 'futuro', 'espacio', 'cibern']},
	battlefield: {label: 'Battlefield', keywords: ['war', 'battle', 'army', 'soldier', 'siege', 'conquest', 'savaş', 'ordu', 'asker', 'kuşatma', 'fetih', 'guerra', 'batalla', 'ejército', 'soldado']},
	interior: {label: 'Interior', keywords: ['room', 'house', 'home', 'library', 'office', 'inside', 'oda', 'ev', 'kütüphane', 'ofis', 'habitación', 'casa', 'biblioteca']},
	ocean_coast: {label: 'Ocean & coastline', keywords: ['ocean', 'sea', 'coast', 'ship', 'island', 'beach', 'atlantis', 'titanic', 'deniz', 'okyanus', 'gemi', 'ada', 'sahil', 'océano', 'mar', 'barco', 'isla', 'costa']},
} as const;
export type EnvironmentId = keyof typeof ENVIRONMENTS;

// ─── Camera ─────────────────────────────────────────────────────────────────
export const CAMERA_SHOTS = {
	aerial_establishing: {label: 'Aerial establishing'},
	wide: {label: 'Wide'},
	medium: {label: 'Medium'},
	close_up: {label: 'Close-up'},
	low_angle: {label: 'Low angle hero'},
	over_shoulder: {label: 'Over the shoulder'},
} as const;
export type CameraShot = keyof typeof CAMERA_SHOTS;

export const CAMERA_MOVES = {
	static: {label: 'Locked-off (breathing)'},
	slow_forward_dolly: {label: 'Slow forward dolly'},
	push_in: {label: 'Cinematic push-in'},
	dolly_out: {label: 'Dolly out / reveal'},
	tracking_left: {label: 'Tracking left'},
	tracking_right: {label: 'Tracking right'},
	crane_up: {label: 'Crane up'},
	crane_down: {label: 'Crane down'},
	aerial_flyover: {label: 'Aerial flyover'},
	orbit: {label: 'Orbit'},
	handheld: {label: 'Handheld'},
} as const;
export type CameraMove = keyof typeof CAMERA_MOVES;

export const FOCUS_TARGETS = {
	subject: {label: 'Subject'},
	foreground: {label: 'Foreground'},
	background: {label: 'Background'},
} as const;
export type FocusTarget = keyof typeof FOCUS_TARGETS;

export type CameraSpec = {
	shot: CameraShot;
	movement: CameraMove;
	/** Focal length in mm (35 mm full-frame equivalent). */
	lens: number;
	depth_of_field: boolean;
	/** Rack focus: focus pulls from `from` to `to` across the shot. Null = hold on subject. */
	focus_transition: {from: FocusTarget; to: FocusTarget} | null;
	/** Extra handheld shake 0..1 layered on any move. */
	shake: number;
};

// ─── Lighting ───────────────────────────────────────────────────────────────
export const LIGHTING = {
	cinematic_sunset: {label: 'Cinematic sunset'},
	golden_hour: {label: 'Golden hour'},
	noon_sun: {label: 'Noon sun'},
	overcast_day: {label: 'Overcast day'},
	blue_hour: {label: 'Blue hour'},
	moonlit_night: {label: 'Moonlit night'},
	stormy: {label: 'Stormy'},
	day_to_night: {label: 'Day → night transition'},
} as const;
export type LightingId = keyof typeof LIGHTING;

// ─── Atmosphere / effects ───────────────────────────────────────────────────
export const ATMOSPHERE = {
	volumetric_fog: {label: 'Volumetric fog'},
	god_rays: {label: 'Light shafts (god rays)'},
	dust_particles: {label: 'Dust'},
	rain: {label: 'Rain'},
	snow: {label: 'Snow'},
	smoke: {label: 'Smoke'},
	fire: {label: 'Fire'},
	sparks: {label: 'Sparks / embers'},
	clouds: {label: 'Clouds'},
	wind: {label: 'Wind'},
	explosions: {label: 'Explosions'},
} as const;
export type AtmosphereId = keyof typeof ATMOSPHERE;

export const ANIMATIONS = {
	moving_crowds: {label: 'Moving crowds'},
	flags_in_wind: {label: 'Flags in wind'},
	swaying_trees: {label: 'Swaying vegetation'},
	flowing_water: {label: 'Flowing water / waves'},
	flying_birds: {label: 'Flying birds'},
	traffic: {label: 'Traffic'},
	character_walk: {label: 'Characters walk'},
} as const;
export type AnimationId = keyof typeof ANIMATIONS;

// Procedurally synthesised by the studio (no samples, no licences needed).
export const SOUND_EFFECTS = {
	wind: {label: 'Wind'},
	rain: {label: 'Rain'},
	thunder: {label: 'Thunder'},
	fire_crackle: {label: 'Fire crackle'},
	crowd_murmur: {label: 'Crowd murmur'},
	battle_clash: {label: 'Battle clash'},
	explosion: {label: 'Explosions (synced to visuals)'},
	ocean_waves: {label: 'Ocean waves'},
	birdsong: {label: 'Birdsong'},
	city_traffic: {label: 'City traffic'},
	footsteps: {label: 'Footsteps'},
	whoosh: {label: 'Whoosh (scene start)'},
	rumble: {label: 'Low rumble'},
	room_tone: {label: 'Room tone'},
	neon_hum: {label: 'Neon hum'},
} as const;
export type SoundEffectId = keyof typeof SOUND_EFFECTS;

export const TRANSITIONS = {
	cut: {label: 'Cut', seconds: 0},
	fade: {label: 'Crossfade', seconds: 0.8},
	dip_to_black: {label: 'Dip to black', seconds: 1},
	whip: {label: 'Whip pan', seconds: 0.4},
	slide: {label: 'Slide', seconds: 0.6},
} as const;
export type TransitionId = keyof typeof TRANSITIONS;

// ─── Visual styles (grade + camera/lighting tendencies for the storyboard) ──
export const STYLES = {
	epic_historical: {label: 'Epic historical', saturation: 0.95, contrast: 1.12, warmth: 0.12, letterbox: true, grain: 0.05, lighting: ['cinematic_sunset', 'golden_hour', 'stormy', 'day_to_night'], atmosphere: ['dust_particles', 'god_rays', 'volumetric_fog']},
	documentary: {label: 'Documentary', saturation: 1.0, contrast: 1.04, warmth: 0.03, letterbox: false, grain: 0.03, lighting: ['noon_sun', 'overcast_day', 'golden_hour'], atmosphere: ['clouds', 'dust_particles']},
	dark_mystery: {label: 'Dark mystery', saturation: 0.7, contrast: 1.18, warmth: -0.1, letterbox: true, grain: 0.08, lighting: ['moonlit_night', 'blue_hour', 'stormy'], atmosphere: ['volumetric_fog', 'rain', 'smoke']},
	sci_fi: {label: 'Sci-fi neon', saturation: 1.15, contrast: 1.1, warmth: -0.12, letterbox: true, grain: 0.04, lighting: ['blue_hour', 'moonlit_night', 'day_to_night'], atmosphere: ['volumetric_fog', 'rain', 'sparks']},
	nature: {label: 'Nature film', saturation: 1.08, contrast: 1.05, warmth: 0.06, letterbox: false, grain: 0.02, lighting: ['golden_hour', 'noon_sun', 'overcast_day', 'cinematic_sunset'], atmosphere: ['god_rays', 'clouds', 'wind']},
} as const;
export type StyleId = keyof typeof STYLES;

export const LANGUAGES = {
	en: {label: 'English'},
	tr: {label: 'Türkçe'},
	es: {label: 'Español'},
} as const;
export type LanguageId = keyof typeof LANGUAGES;

// ─── Generation & render state (one definition, worded for people) ──────────
export const GENERATION_STATUS = {
	not_started: {label: 'Not generated'},
	not_required: {label: 'Ready (rendered from code)'},
	queued: {label: 'Queued'},
	running: {label: 'Generating…'},
	succeeded: {label: 'Generated'},
	failed: {label: 'Failed'},
	blocked: {label: 'Blocked — provider unavailable'},
} as const;
export type GenerationStatus = keyof typeof GENERATION_STATUS;

export const JOB_STATUS = {
	queued: {label: 'Queued'},
	running: {label: 'Running'},
	paused: {label: 'Paused'},
	succeeded: {label: 'Done'},
	failed: {label: 'Failed'},
	cancelled: {label: 'Cancelled'},
} as const;
export type JobStatus = keyof typeof JOB_STATUS;

export const RENDER_QUALITY = {
	// Exact binary fractions only: Remotion requires integer output dimensions.
	preview: {label: 'Preview (½ res, reduced particles)', scale: 0.5},
	final: {label: 'Final (full res)', scale: 1},
} as const;
export type RenderQuality = keyof typeof RENDER_QUALITY;

// ─── Records ────────────────────────────────────────────────────────────────
export type Asset = {
	/** Path relative to the project directory, e.g. "assets/scene_001.mp4". */
	path: string;
	kind: 'video' | 'image';
	/** Seconds (videos only). */
	duration: number | null;
	width: number | null;
	height: number | null;
	/** Who produced it: "comfyui:wan22", "upload", "blender", … */
	source: string;
};

export type GenerationRecord = {
	status: GenerationStatus;
	method: VisualType | null;
	provider: string | null;
	prompt: string | null;
	negative_prompt: string | null;
	settings: Record<string, unknown>;
	error: string | null;
	log: string[];
	updated_at: string | null;
};

export type TextOverlay = {
	id: string;
	text: string;
	/** Seconds from scene start. */
	start: number;
	end: number;
	position: 'top' | 'center' | 'lower_third';
};

export type SubtitleCue = {start: number; end: number; text: string};

export type Scene = {
	scene_id: string;
	/** Seconds. */
	duration: number;
	visual_type: VisualType;
	/** True when the user picked visual_type by hand — the router will not change it. */
	visual_type_locked: boolean;
	/** Why the router chose visual_type (shown in the UI). */
	route_reason: string | null;
	environment: EnvironmentId;
	visual_description: string;
	/** Character IDs appearing in this scene. */
	characters: string[];
	camera: CameraSpec;
	lighting: LightingId;
	atmosphere: AtmosphereId[];
	animation: AnimationId[];
	narration: string;
	sound_effects: SoundEffectId[];
	transition: TransitionId;
	/** Previous scene this one continues visually from (AI i2v uses its last frame). */
	continuity_from: string | null;
	seed: number;
	asset: Asset | null;
	generation: GenerationRecord;
	overlays: TextOverlay[];
	subtitles: SubtitleCue[];
	/** Narration audio for this scene, relative to project dir. */
	narration_audio: {path: string; duration: number; source: string} | null;
};

export const HAIR_STYLES = {short: {label: 'Short'}, long: {label: 'Long'}, ponytail: {label: 'Ponytail'}, bald: {label: 'Bald'}, helmet: {label: 'Helmet / hood'}} as const;
export type HairStyle = keyof typeof HAIR_STYLES;
export const BUILDS = {slim: {label: 'Slim'}, average: {label: 'Average'}, broad: {label: 'Broad'}} as const;
export type Build = keyof typeof BUILDS;

export type Character = {
	id: string;
	name: string;
	appearance: string;
	clothing: string;
	hair: string;
	hair_style: HairStyle;
	build: Build;
	palette: {skin: string; hair: string; top: string; bottom: string; accent: string};
	/** Height in metres. */
	scale: number;
	/** Optional .glb/.gltf relative to the project dir — reused in every scene. */
	model_reference: string | null;
	reference_images: string[];
	/** Fixed seed so AI providers reproduce the same person. */
	seed: number;
};

export type AudioTrack = {path: string | null; volume: number; source: string | null};

export type Project = {
	schema_version: number;
	id: string;
	title: string;
	topic: string;
	language: LanguageId;
	format: FormatId;
	fps: Fps;
	target_duration: number;
	style: StyleId;
	script: {title: string; beats: {heading: string; narration: string}[]} | null;
	characters: Character[];
	scenes: Scene[];
	audio: {
		narration_volume: number;
		music: AudioTrack;
		sfx_volume: number;
		ambience_volume: number;
		duck_music: boolean;
		/** Integrated loudness target for the master. */
		target_lufs: number;
	};
	export_settings: {video_bitrate_kbps: number; audio_bitrate_kbps: number; burn_subtitles: boolean};
	created_at: string;
	updated_at: string;
};

// ─── Defaults ───────────────────────────────────────────────────────────────
export const emptyGeneration = (): GenerationRecord => ({
	status: 'not_started',
	method: null,
	provider: null,
	prompt: null,
	negative_prompt: null,
	settings: {},
	error: null,
	log: [],
	updated_at: null,
});

export const defaultCamera = (): CameraSpec => ({
	shot: 'wide',
	movement: 'slow_forward_dolly',
	lens: 35,
	depth_of_field: true,
	focus_transition: null,
	shake: 0,
});

export const makeScene = (partial: Partial<Scene> & {scene_id: string}): Scene => ({
	duration: 6,
	visual_type: 'procedural_3d',
	visual_type_locked: false,
	route_reason: null,
	environment: 'forest',
	visual_description: '',
	characters: [],
	camera: defaultCamera(),
	lighting: 'golden_hour',
	atmosphere: [],
	animation: [],
	narration: '',
	sound_effects: [],
	transition: 'fade',
	continuity_from: null,
	seed: 1,
	asset: null,
	generation: emptyGeneration(),
	overlays: [],
	subtitles: [],
	narration_audio: null,
	...partial,
});

// ─── Validation ─────────────────────────────────────────────────────────────
// Hand-written so it runs identically in the bundle and in Node, with zero deps.
// Returns human-readable errors; an empty array means valid.

const has = <T extends object>(table: T, v: unknown): v is keyof T => typeof v === 'string' && Object.prototype.hasOwnProperty.call(table, v);
const isNum = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export const validateScene = (s: unknown, path = 'scene'): string[] => {
	const e: string[] = [];
	if (!s || typeof s !== 'object') return [`${path} must be an object`];
	const x = s as Record<string, unknown>;
	if (typeof x.scene_id !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(x.scene_id)) e.push(`${path}.scene_id must be 1–64 chars [a-z0-9_-]`);
	if (!isNum(x.duration, 0.5, 120)) e.push(`${path}.duration must be 0.5–120 seconds`);
	if (!has(VISUAL_TYPES, x.visual_type)) e.push(`${path}.visual_type must be one of ${Object.keys(VISUAL_TYPES).join(', ')}`);
	if (!has(ENVIRONMENTS, x.environment)) e.push(`${path}.environment must be one of ${Object.keys(ENVIRONMENTS).join(', ')}`);
	if (!has(LIGHTING, x.lighting)) e.push(`${path}.lighting must be one of ${Object.keys(LIGHTING).join(', ')}`);
	if (!has(TRANSITIONS, x.transition)) e.push(`${path}.transition must be one of ${Object.keys(TRANSITIONS).join(', ')}`);
	const cam = x.camera as Record<string, unknown> | undefined;
	if (!cam || typeof cam !== 'object') e.push(`${path}.camera is required`);
	else {
		if (!has(CAMERA_SHOTS, cam.shot)) e.push(`${path}.camera.shot must be one of ${Object.keys(CAMERA_SHOTS).join(', ')}`);
		if (!has(CAMERA_MOVES, cam.movement)) e.push(`${path}.camera.movement must be one of ${Object.keys(CAMERA_MOVES).join(', ')}`);
		if (!isNum(cam.lens, 10, 300)) e.push(`${path}.camera.lens must be 10–300 mm`);
		if (typeof cam.depth_of_field !== 'boolean') e.push(`${path}.camera.depth_of_field must be boolean`);
		if (!isNum(cam.shake, 0, 1)) e.push(`${path}.camera.shake must be 0–1`);
		const ft = cam.focus_transition as Record<string, unknown> | null | undefined;
		if (ft !== null && ft !== undefined && (!has(FOCUS_TARGETS, ft.from) || !has(FOCUS_TARGETS, ft.to))) e.push(`${path}.camera.focus_transition needs from/to in ${Object.keys(FOCUS_TARGETS).join(', ')}`);
	}
	for (const [key, table] of [['atmosphere', ATMOSPHERE], ['animation', ANIMATIONS], ['sound_effects', SOUND_EFFECTS]] as const) {
		const arr = x[key];
		if (!Array.isArray(arr)) e.push(`${path}.${key} must be an array`);
		else arr.forEach((v, i) => !has(table, v) && e.push(`${path}.${key}[${i}] "${String(v)}" is not one of ${Object.keys(table).join(', ')}`));
	}
	if (!Array.isArray(x.characters) || x.characters.some((c) => typeof c !== 'string')) e.push(`${path}.characters must be an array of character IDs`);
	if (typeof x.narration !== 'string') e.push(`${path}.narration must be a string`);
	if (x.asset !== null && x.asset !== undefined) {
		const a = x.asset as Record<string, unknown>;
		if (typeof a.path !== 'string' || a.path.includes('..') || a.path.startsWith('/')) e.push(`${path}.asset.path must be relative to the project dir`);
		if (a.kind !== 'video' && a.kind !== 'image') e.push(`${path}.asset.kind must be video or image`);
	}
	if (!Array.isArray(x.overlays)) e.push(`${path}.overlays must be an array`);
	if (!Array.isArray(x.subtitles)) e.push(`${path}.subtitles must be an array`);
	return e;
};

export const validateCharacter = (c: unknown, path = 'character'): string[] => {
	const e: string[] = [];
	if (!c || typeof c !== 'object') return [`${path} must be an object`];
	const x = c as Record<string, unknown>;
	if (typeof x.id !== 'string' || !/^[a-z0-9_-]{1,40}$/i.test(x.id)) e.push(`${path}.id must be 1–40 chars [a-z0-9_-]`);
	if (typeof x.name !== 'string' || !x.name) e.push(`${path}.name is required`);
	if (!has(HAIR_STYLES, x.hair_style)) e.push(`${path}.hair_style must be one of ${Object.keys(HAIR_STYLES).join(', ')}`);
	if (!has(BUILDS, x.build)) e.push(`${path}.build must be one of ${Object.keys(BUILDS).join(', ')}`);
	if (!isNum(x.scale, 0.3, 4)) e.push(`${path}.scale must be 0.3–4 m`);
	const p = x.palette as Record<string, unknown> | undefined;
	if (!p || ['skin', 'hair', 'top', 'bottom', 'accent'].some((k) => typeof p[k] !== 'string' || !/^#[0-9a-f]{6}$/i.test(p[k] as string))) e.push(`${path}.palette needs skin/hair/top/bottom/accent as #rrggbb`);
	return e;
};

export const validateProject = (p: unknown): string[] => {
	if (!p || typeof p !== 'object') return ['project must be an object'];
	const x = p as Record<string, unknown>;
	const e: string[] = [];
	if (typeof x.id !== 'string' || !/^[a-z0-9-]{3,80}$/.test(x.id)) e.push('project.id must be 3–80 chars [a-z0-9-]');
	if (!has(FORMATS, x.format)) e.push(`project.format must be one of ${Object.keys(FORMATS).join(', ')}`);
	if (!FPS_OPTIONS.includes(x.fps as Fps)) e.push('project.fps must be 24 or 30');
	if (!has(STYLES, x.style)) e.push(`project.style must be one of ${Object.keys(STYLES).join(', ')}`);
	if (!has(LANGUAGES, x.language)) e.push(`project.language must be one of ${Object.keys(LANGUAGES).join(', ')}`);
	const chars = Array.isArray(x.characters) ? (x.characters as unknown[]) : [];
	if (!Array.isArray(x.characters)) e.push('project.characters must be an array');
	chars.forEach((c, i) => e.push(...validateCharacter(c, `characters[${i}]`)));
	const ids = new Set(chars.map((c) => (c as Character).id));
	if (!Array.isArray(x.scenes)) e.push('project.scenes must be an array');
	else {
		const seen = new Set<string>();
		(x.scenes as unknown[]).forEach((s, i) => {
			e.push(...validateScene(s, `scenes[${i}]`));
			const sc = s as Scene;
			if (seen.has(sc.scene_id)) e.push(`scenes[${i}].scene_id "${sc.scene_id}" is duplicated`);
			seen.add(sc.scene_id);
			(sc.characters ?? []).forEach((cid) => !ids.has(cid) && e.push(`scenes[${i}] references unknown character "${cid}"`));
		});
	}
	return e;
};

/** Focal length (mm, full-frame) → vertical field of view (degrees) for a frame aspect. */
export const lensToFov = (lens: number, width: number, height: number) => {
	// 36 mm on the long edge of the frame, like a full-frame stills camera.
	const longEdge = 36;
	const sensorH = width >= height ? longEdge * (height / width) : longEdge;
	return (2 * Math.atan(sensorH / 2 / lens) * 180) / Math.PI;
};
