// Unit tests for the studio core. Run: npm run studio:test
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

process.env.STUDIO_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'cs-test-'));
process.env.COMFYUI_URL = 'http://127.0.0.1:59999'; // closed port → deterministic "unreachable"

const schema = await import('../../src/cinematic/schema.ts');
const {SAMPLE_PROJECT_SCENES, SAMPLE_CHARACTERS, SAMPLE_ROME_SCENE} = await import('../../src/cinematic/samples.ts');
const {routeScene} = await import('../lib/router.mjs');
const {templateScript, buildStoryboard, inferEnvironment, buildPrompt} = await import('../lib/storyboard.mjs');
const media = await import('../lib/media.mjs');
const store = await import('../lib/store.mjs');
const {detectComfy, wan22Workflow, ltxWorkflow, imageWorkflow} = await import('../lib/providers/comfyui.mjs');
const {DEFAULT_CONFIG} = await import('../lib/config.mjs');

const caps = (over = {}) => ({video: {available: false, provider: null}, image: {available: false, provider: null}, blender: {available: false}, tts: {available: false}, llm: {available: false}, ...over});

test('the example scene from the brief validates', () => {
	assert.deepEqual(schema.validateScene(SAMPLE_ROME_SCENE), []);
	assert.equal(SAMPLE_ROME_SCENE.environment, 'ancient_roman_city');
	assert.equal(SAMPLE_ROME_SCENE.camera.movement, 'slow_forward_dolly');
});

test('validation reports precise, human-readable errors', () => {
	const bad = {...SAMPLE_ROME_SCENE, environment: 'atlantis', duration: -1, atmosphere: ['volumetric_fog', 'lasers'], camera: {...SAMPLE_ROME_SCENE.camera, lens: 2}, asset: {path: '../../etc/passwd', kind: 'video'}};
	const e = schema.validateScene(bad).join('\n');
	assert.match(e, /environment must be one of/);
	assert.match(e, /duration must be/);
	assert.match(e, /atmosphere\[1\] "lasers"/);
	assert.match(e, /lens must be/);
	assert.match(e, /asset.path must be relative/);
});

test('projects validate cross-references (unknown character, duplicate scene ids)', () => {
	const p = {...store.newProject({title: 'T', topic: 'x'}), characters: SAMPLE_CHARACTERS, scenes: [SAMPLE_PROJECT_SCENES[1], {...SAMPLE_PROJECT_SCENES[1], characters: ['ghost']}]};
	const e = schema.validateProject(p).join('\n');
	assert.match(e, /duplicated/);
	assert.match(e, /unknown character "ghost"/);
});

test('router follows the priority order and explains itself', () => {
	const s = {...SAMPLE_ROME_SCENE, duration: 5};
	assert.equal(routeScene(s, caps()).visual_type, 'procedural_3d');
	assert.equal(routeScene(s, caps({image: {available: true, provider: 'a1111'}})).visual_type, 'ai_image_animated');
	const v = routeScene(s, caps({video: {available: true, provider: 'comfyui-wan22', t2v: true, i2v: true, max_seconds: 5}}));
	assert.equal(v.visual_type, 'ai_video');
	assert.match(v.reason, /comfyui-wan22/);
});

test('router never picks AI video for shots the model cannot produce', () => {
	const long = {...SAMPLE_ROME_SCENE, duration: 8};
	const r = routeScene(long, caps({video: {available: true, provider: 'comfyui-ltx', t2v: true, i2v: true, max_seconds: 5}}));
	assert.equal(r.visual_type, 'procedural_3d');
	assert.match(r.reason, /≤5s clips/);
});

test('a user-locked method is kept and reported as blocked — never silently swapped', () => {
	const s = {...SAMPLE_ROME_SCENE, visual_type: 'ai_video', visual_type_locked: true};
	const r = routeScene(s, caps());
	assert.equal(r.visual_type, 'ai_video');
	assert.match(r.blocked, /no AI video provider/);
});

test('template script + storyboard produce valid scenes near the target duration', () => {
	const p = store.newProject({title: 'Rome', topic: 'What if Rome never fell?', language: 'tr', target_duration: 60, style: 'epic_historical'});
	p.characters = SAMPLE_CHARACTERS;
	p.script = templateScript(p);
	assert.match(p.script.source, /template draft/);
	assert.ok(p.script.beats[0].narration.includes('What if Rome never fell'));
	const scenes = buildStoryboard(p);
	for (const s of scenes) assert.deepEqual(schema.validateScene(s), [], s.scene_id);
	const total = scenes.reduce((a, s) => a + s.duration, 0);
	assert.ok(Math.abs(total - 60) < 8, `total ${total}`);
	assert.equal(scenes[0].environment, 'ancient_roman_city');
	assert.equal(scenes[0].camera.shot, 'aerial_establishing');
	assert.ok(scenes.some((s) => s.characters.includes('marcus')), 'main character is cast in close shots');
	assert.ok(scenes.every((s) => s.subtitles.length > 0));
});

test('environment inference understands en/tr/es keywords', () => {
	assert.equal(inferEnvironment('Osmanlı ordusu kuşatma savaşı', 'documentary'), 'battlefield');
	assert.equal(inferEnvironment('La vida en el océano profundo', 'documentary'), 'ocean_coast');
	assert.equal(inferEnvironment('A robot city in 2100', 'documentary'), 'futuristic_city');
});

test('AI prompts carry the character sheet so recurring characters stay consistent', () => {
	const p = {...store.newProject({title: 'x', topic: 'x'}), characters: SAMPLE_CHARACTERS};
	const {prompt, negative} = buildPrompt(p, SAMPLE_PROJECT_SCENES[1]);
	assert.match(prompt, /Marcus: Roman legionary/);
	assert.match(prompt, /Livia: young Roman scholar/);
	assert.match(negative, /watermark/);
});

test('timeline maths: transition overlaps shorten the total', () => {
	const scenes = [{duration: 8, transition: 'cut'}, {duration: 6, transition: 'fade'}, {duration: 6, transition: 'dip_to_black'}];
	const {starts, total} = media.sceneStarts(scenes, 24);
	assert.deepEqual(starts.map((s) => +s.toFixed(3)), [0, 7.2, 12.2]);
	assert.equal(+total.toFixed(3), 18.2);
});

test('auto subtitles cover the narration in order, within the duration', () => {
	const cues = media.autoSubtitles('Imagine a world where Rome never fell. Its legions still march across three continents, unopposed.', 7);
	assert.ok(cues.length >= 2);
	for (let i = 1; i < cues.length; i++) assert.ok(cues[i].start >= cues[i - 1].end - 1e-6);
	assert.ok(cues.at(-1).end <= 7);
	assert.equal(cues.map((c) => c.text).join(' '), 'Imagine a world where Rome never fell. Its legions still march across three continents, unopposed.');
	const srt = media.buildSrt([{subtitles: cues, duration: 7}], [10]);
	assert.match(srt, /^1\n00:00:10,/);
});

test('procedural SFX: explosions land on the same frames as the visuals', async () => {
	const {explosionTimes} = await import('../../src/cinematic/timing.ts');
	const scene = {...SAMPLE_PROJECT_SCENES[2], sound_effects: ['explosion']};
	const {L, used} = media.synthSfx({scenes: [scene], starts: [0], total: scene.duration});
	assert.equal(used.length, 1);
	const t = explosionTimes(scene.duration, 3)[0];
	const at = Math.floor(t * media.SR);
	const energy = (a, b) => L.slice(a, b).reduce((s, v) => s + v * v, 0);
	assert.ok(energy(at, at + 4800) > 50 * energy(at - 4800, at), 'boom starts at the scheduled time');
});

test('ComfyUI detection fails with an actionable message when unreachable', async () => {
	const r = await detectComfy({...DEFAULT_CONFIG().comfyui, url: 'http://127.0.0.1:59999'});
	assert.equal(r.reachable, false);
	assert.match(r.errors[0], /Not reachable at http:\/\/127\.0\.0\.1:59999 \(ECONNREFUSED\)/);
	assert.match(r.errors[0], /Start ComfyUI/);
});

test('ComfyUI workflows only reference real core node types and wire valid outputs', () => {
	const cfg = DEFAULT_CONFIG().comfyui;
	cfg.image.checkpoint = 'x.safetensors';
	const graphs = [
		imageWorkflow(cfg, {prompt: 'p', negative: 'n', seed: 1, width: 1024, height: 576, reference: null}),
		imageWorkflow(cfg, {prompt: 'p', negative: 'n', seed: 1, width: 1024, height: 576, reference: 'ref.png'}),
		wan22Workflow(cfg, {prompt: 'p', negative: 'n', seed: 1, seconds: 5, startImage: null}).workflow,
		wan22Workflow({...cfg, wan22: {...cfg.wan22, variant: 'a14b'}}, {prompt: 'p', negative: 'n', seed: 1, seconds: 5, startImage: 'a.png'}).workflow,
		ltxWorkflow(cfg, {prompt: 'p', negative: 'n', seed: 1, seconds: 4, startImage: 'a.png'}).workflow,
	];
	const known = new Set(['CheckpointLoaderSimple', 'CLIPTextEncode', 'EmptyLatentImage', 'LoadImage', 'ImageScale', 'VAEEncode', 'KSampler', 'VAEDecode', 'SaveImage', 'CLIPLoader', 'VAELoader', 'UNETLoader', 'ModelSamplingSD3', 'Wan22ImageToVideoLatent', 'WanImageToVideo', 'EmptyHunyuanLatentVideo', 'KSamplerAdvanced', 'LTXVImgToVideo', 'EmptyLTXVLatentVideo', 'LTXVConditioning', 'LTXVScheduler', 'RandomNoise', 'CFGGuider', 'KSamplerSelect', 'SamplerCustomAdvanced']);
	for (const g of graphs) {
		for (const [id, n] of Object.entries(g)) {
			assert.ok(known.has(n.class_type), `unknown node ${n.class_type}`);
			for (const v of Object.values(n.inputs)) if (Array.isArray(v)) assert.ok(g[v[0]], `node ${id} links to missing node ${v[0]}`);
		}
		assert.ok(Object.values(g).some((n) => n.class_type === 'SaveImage'));
	}
	// Wan 2.2 lengths must satisfy the node's step=4 (+1) constraint; LTX step=8 (+1).
	const w = wan22Workflow(cfg, {prompt: 'p', negative: 'n', seed: 1, seconds: 5, startImage: null}).workflow;
	assert.equal(Object.values(w).find((n) => n.class_type === 'Wan22ImageToVideoLatent').inputs.length % 4, 1);
	const l = ltxWorkflow(cfg, {prompt: 'p', negative: 'n', seed: 1, seconds: 4, startImage: null}).workflow;
	assert.equal(Object.values(l).find((n) => n.class_type === 'EmptyLTXVLatentVideo').inputs.length % 8, 1);
});

test('store: atomic save/load round-trip, invalid projects are rejected, paths cannot escape', () => {
	const p = store.newProject({title: 'Round trip', topic: 'y'});
	p.scenes = [SAMPLE_ROME_SCENE];
	store.saveProject(p);
	assert.equal(store.loadProject(p.id).scenes[0].scene_id, 'scene_001');
	assert.throws(() => store.saveProject({...p, format: '4:3'}), /format must be one of/);
	assert.throws(() => store.projectPath(p.id, '../../outside'), /escapes project/);
});
