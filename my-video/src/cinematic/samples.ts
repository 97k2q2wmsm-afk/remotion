// Sample data for the Studio compositions and the end-to-end test project.
import type {Character, Scene} from './schema.ts';
import {defaultCamera, makeScene} from './schema.ts';

export const SAMPLE_CHARACTERS: Character[] = [
	{
		id: 'marcus',
		name: 'Marcus',
		appearance: 'Roman legionary in his thirties, weathered olive skin, strong jaw, short dark beard',
		clothing: 'crimson tunic under segmented steel armour, brown leather belt',
		hair: 'short cropped black hair',
		hair_style: 'short',
		build: 'broad',
		palette: {skin: '#c8956d', hair: '#1d1612', top: '#8f1d1d', bottom: '#5a3a24', accent: '#c9a227'},
		scale: 1.8,
		model_reference: null,
		reference_images: [],
		seed: 4101,
	},
	{
		id: 'livia',
		name: 'Livia',
		appearance: 'young Roman scholar, fair skin, attentive eyes',
		clothing: 'ivory stola with a deep blue palla',
		hair: 'long dark-brown hair',
		hair_style: 'long',
		build: 'slim',
		palette: {skin: '#e3bc9a', hair: '#3b2416', top: '#e9e2d0', bottom: '#2a3f6e', accent: '#2a3f6e'},
		scale: 1.66,
		model_reference: null,
		reference_images: [],
		seed: 4102,
	},
];

/** The example scene from the brief, verbatim fields + engine defaults. */
export const SAMPLE_ROME_SCENE: Scene = makeScene({
	scene_id: 'scene_001',
	duration: 8,
	visual_type: 'procedural_3d',
	environment: 'ancient_roman_city',
	visual_description: 'Aerial establishing shot over the forum of an eternal Rome at sunset.',
	camera: {...defaultCamera(), shot: 'aerial_establishing', movement: 'slow_forward_dolly', lens: 35, depth_of_field: true},
	lighting: 'cinematic_sunset',
	atmosphere: ['volumetric_fog', 'dust_particles'],
	animation: ['moving_crowds', 'flags_in_wind'],
	narration: 'Imagine a world where Rome never fell.',
	seed: 1,
});

export const SAMPLE_TEST_ENVIRONMENT: Scene = makeScene({
	scene_id: 'test_forest',
	duration: 6,
	environment: 'forest',
	visual_description: 'Test environment: orbit around a forest clearing with light shafts.',
	camera: {...defaultCamera(), shot: 'wide', movement: 'orbit', lens: 28},
	lighting: 'golden_hour',
	atmosphere: ['god_rays', 'dust_particles', 'wind'],
	animation: ['swaying_trees', 'flying_birds'],
	narration: '',
});

/** One animated camera sequence: four moves through the same mountain range. */
export const SAMPLE_CAMERA_SEQUENCE: Scene[] = [
	makeScene({scene_id: 'cam_1', duration: 4, environment: 'mountains', camera: {...defaultCamera(), shot: 'aerial_establishing', movement: 'aerial_flyover', lens: 24}, lighting: 'golden_hour', atmosphere: ['clouds', 'god_rays'], animation: ['flowing_water', 'flying_birds']}),
	makeScene({scene_id: 'cam_2', duration: 4, environment: 'mountains', camera: {...defaultCamera(), shot: 'wide', movement: 'crane_down', lens: 32}, lighting: 'golden_hour', atmosphere: ['clouds'], animation: ['swaying_trees']}),
	makeScene({scene_id: 'cam_3', duration: 4, environment: 'mountains', camera: {...defaultCamera(), shot: 'wide', movement: 'tracking_right', lens: 50}, lighting: 'golden_hour', atmosphere: ['clouds', 'dust_particles'], animation: []}),
	makeScene({scene_id: 'cam_4', duration: 4, environment: 'mountains', camera: {...defaultCamera(), shot: 'low_angle', movement: 'push_in', lens: 40, shake: 0.25}, lighting: 'golden_hour', atmosphere: ['god_rays'], animation: []}),
];

/** Multi-scene sample video (also used by the studio's end-to-end test project). */
export const SAMPLE_PROJECT_SCENES: Scene[] = [
	SAMPLE_ROME_SCENE,
	makeScene({
		scene_id: 'scene_002',
		duration: 6,
		environment: 'ancient_roman_city',
		visual_description: 'Marcus and Livia stand in the forum; the camera pushes in on them.',
		characters: ['marcus', 'livia'],
		camera: {...defaultCamera(), shot: 'medium', movement: 'push_in', lens: 50, focus_transition: {from: 'background', to: 'subject'}},
		lighting: 'golden_hour',
		atmosphere: ['dust_particles', 'god_rays'],
		animation: ['moving_crowds', 'flags_in_wind'],
		narration: 'Its legions still march. Its forum still hums with a thousand voices.',
		transition: 'fade',
		seed: 2,
	}),
	makeScene({
		scene_id: 'scene_003',
		duration: 6,
		environment: 'battlefield',
		visual_description: 'A frontier battle at dusk, smoke and fire across the field.',
		camera: {...defaultCamera(), shot: 'wide', movement: 'handheld', lens: 28, shake: 0.5},
		lighting: 'stormy',
		atmosphere: ['smoke', 'fire', 'sparks', 'explosions', 'volumetric_fog'],
		animation: ['moving_crowds', 'flags_in_wind'],
		narration: 'But every empire is tested at its borders.',
		transition: 'dip_to_black',
		seed: 3,
	}),
	makeScene({
		scene_id: 'scene_004',
		duration: 6,
		environment: 'futuristic_city',
		visual_description: 'Rome, two thousand years later — a neon capital of glass towers.',
		camera: {...defaultCamera(), shot: 'aerial_establishing', movement: 'crane_down', lens: 30},
		lighting: 'blue_hour',
		atmosphere: ['volumetric_fog', 'rain'],
		animation: ['traffic'],
		narration: 'And what if it had simply… never stopped?',
		transition: 'fade',
		seed: 4,
	}),
];
