// Production pipeline job handlers: scene generation, scene rendering (cached),
// narration (TTS), and the final export. Every stage writes real status into the
// project; nothing reports success without a file on disk to show for it.
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {GENERATION_STATUS, RENDER_QUALITY} from '../../src/cinematic/schema.ts';
import {loadConfig} from './config.mjs';
import {detectHardware} from './hardware.mjs';
import {registerJobKind} from './jobs.mjs';
import {autoSubtitles, buildSrt, concatScenes, decodeMono, ffmpeg, masterExport, probe, qcReport, sceneStarts, SR, synthScore, synthSfx, writeWav} from './media.mjs';
import {imageWorkflow, ltxWorkflow, runWorkflow, uploadImage, wan22Workflow} from './providers/comfyui.mjs';
import {detectProviders} from './providers/index.mjs';
import {a1111Generate, cliVideoGenerate, spawnLogged, synthesizeSpeech} from './providers/others.mjs';
import {buildPrompt} from './storyboard.mjs';
import {loadProject, projectDir, projectPath, ROOT, updateProject} from './store.mjs';

export const runtime = {origin: 'http://127.0.0.1:4555'};

const now = () => new Date().toISOString();
const setGeneration = (projectId, sceneId, patch) =>
	updateProject(projectId, (p) => {
		const s = p.scenes.find((x) => x.scene_id === sceneId);
		if (!s) throw new Error(`Scene ${sceneId} no longer exists`);
		if (patch.status && !Object.hasOwn(GENERATION_STATUS, patch.status)) throw new Error(`Bad generation status ${patch.status}`);
		s.generation = {...s.generation, ...patch, updated_at: now()};
		if (patch.asset !== undefined) {
			s.asset = patch.asset;
			delete s.generation.asset;
		}
	});

const formatSize = (format, provider) => {
	const landscape = {w: provider.w, h: provider.h};
	if (format === '9:16') return {w: landscape.h, h: landscape.w};
	if (format === '1:1') return {w: landscape.h, h: landscape.h};
	return landscape;
};

// ═══ Scene generation ═══════════════════════════════════════════════════════

const generateImage = async ({project, scene, caps, cfg, prompt, negative, outFile, ctx, referencePath}) => {
	const size = formatSize(project.format, {w: cfg.comfyui.image.width, h: cfg.comfyui.image.height});
	if (caps.image.provider === 'comfyui-image') {
		const reference = referencePath ? await uploadImage(cfg.comfyui, referencePath) : null;
		const wf = imageWorkflow(cfg.comfyui, {prompt, negative, seed: scene.seed, width: size.w - (size.w % 8), height: size.h - (size.h % 8), reference});
		const files = await runWorkflow(cfg.comfyui, wf, {outDir: path.join(path.dirname(outFile), 'comfy_img'), signal: ctx.signal, log: ctx.log});
		copyFileSync(files[0], outFile);
		return {provider: 'comfyui-image', settings: {checkpoint: cfg.comfyui.image.checkpoint, ...size, steps: cfg.comfyui.image.steps, cfg: cfg.comfyui.image.cfg, reference: Boolean(reference)}, workflow: wf};
	}
	const ref = referencePath ? (await import('node:fs')).readFileSync(referencePath).toString('base64') : null;
	await a1111Generate(cfg.a1111, {prompt, negative, seed: scene.seed, width: size.w, height: size.h, referenceB64: ref, outFile, signal: ctx.signal});
	return {provider: 'a1111', settings: {...size, steps: cfg.a1111.steps, cfg: cfg.a1111.cfg, reference: Boolean(ref)}};
};

const characterReference = (project, scene) => {
	for (const id of scene.characters) {
		const c = project.characters.find((x) => x.id === id);
		if (c?.reference_images?.length) return projectPath(project.id, c.reference_images[0]);
	}
	return null;
};

const framesToMp4 = async (frames, fps, out, signal) => {
	const dir = path.dirname(frames[0]);
	await ffmpeg(['-framerate', String(fps), '-i', path.join(dir, 'frame_%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-movflags', '+faststart', out], {signal});
};

const runBlender = async ({project, scene, cfg, caps, outFile, ctx}) => {
	const work = path.join(path.dirname(outFile), `blender_${scene.scene_id}`);
	rmSync(work, {recursive: true, force: true});
	mkdirSync(work, {recursive: true});
	const fmt = {'16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080]}[project.format];
	const spec = {scene, fps: project.fps, width: fmt[0], height: fmt[1], engine: cfg.blender.engine, samples: cfg.blender.samples, out_dir: work, characters: project.characters.filter((c) => scene.characters.includes(c.id))};
	writeFileSync(path.join(work, 'spec.json'), JSON.stringify(spec, null, 2));
	const frames = Math.round(scene.duration * project.fps);
	ctx.log(`Blender: ${frames} frames at ${fmt.join('×')} (${cfg.blender.engine})`);
	let done = 0;
	await spawnLogged(caps.blender.binary, ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(ROOT, 'studio', 'blender', 'render_scene.py'), '--', path.join(work, 'spec.json')], {
		signal: ctx.signal,
		timeoutMs: cfg.blender.timeout_minutes * 60000,
		log: (l) => {
			if (/^Saved: /.test(l) || /Fra:\d+.*Saved/.test(l)) ctx.progress(0.1 + 0.85 * (++done / frames), `Blender frame ${done}/${frames}`);
			else if (/error|Traceback|Exception/i.test(l)) ctx.log(l);
		},
	});
	const pngs = readdirSync(work).filter((f) => /^frame_\d{5}\.png$/.test(f));
	if (!pngs.length) throw new Error('Blender finished without writing frames.');
	await framesToMp4(pngs.map((f) => path.join(work, f)), project.fps, outFile, ctx.signal);
	return {provider: 'blender', settings: {engine: cfg.blender.engine, samples: cfg.blender.samples, frames: pngs.length}};
};

registerJobKind('generate_scene', 'remote', async ({projectId, sceneId}, ctx) => {
	const project = loadProject(projectId);
	const scene = project.scenes.find((s) => s.scene_id === sceneId);
	if (!scene) throw new Error(`Scene ${sceneId} not found`);
	const cfg = loadConfig();
	const {capabilities: caps} = await detectProviders({refresh: true});
	const method = scene.visual_type;
	const {prompt, negative} = buildPrompt(project, scene);
	const dir = projectDir(projectId);
	const assetsDir = path.join(dir, 'assets');
	const genDir = path.join(dir, 'generation', sceneId);
	mkdirSync(genDir, {recursive: true});
	const log = [];
	const L = (m) => {
		log.push(m);
		ctx.log(m);
	};
	const fail = async (msg, status = 'failed') => {
		await setGeneration(projectId, sceneId, {status, method, error: msg, log, prompt, negative_prompt: negative});
		throw new Error(msg);
	};

	if (method === 'procedural_3d') {
		await setGeneration(projectId, sceneId, {status: 'not_required', method, provider: 'procedural', error: null, log: ['Procedural 3D scenes are rendered from code — nothing to generate.'], prompt: null, negative_prompt: null, settings: {environment: scene.environment}});
		return {status: 'not_required'};
	}
	if (method === 'user_asset') {
		if (!scene.asset || !existsSync(projectPath(projectId, scene.asset.path))) await fail('No imported asset for this scene — upload an image or video first.');
		await setGeneration(projectId, sceneId, {status: 'succeeded', method, provider: 'upload', error: null, log: ['Using the imported asset.']});
		return {asset: scene.asset};
	}
	const stamp = Date.now();
	await setGeneration(projectId, sceneId, {status: 'running', method, error: null, log: [], prompt, negative_prompt: negative});
	try {
		let asset;
		let meta;
		if (method === 'ai_image_animated') {
			if (!caps.image.available) await fail('No AI image provider is available. Configure ComfyUI or A1111 in the AI Model Manager, or switch this scene to procedural 3D.', 'blocked');
			const out = path.join(assetsDir, `${sceneId}_${stamp}.png`);
			const ref = characterReference(project, scene);
			if (ref) L(`Conditioning on character reference ${path.basename(ref)}`);
			ctx.progress(0.1, 'Generating image');
			meta = await generateImage({project, scene, caps, cfg, prompt, negative, outFile: out, ctx: {...ctx, log: L}, referencePath: ref});
			const pr = await probe(out);
			asset = {path: path.relative(dir, out), kind: 'image', duration: null, width: pr.width, height: pr.height, source: meta.provider};
		} else if (method === 'ai_video') {
			if (!caps.video.available) await fail('No AI video provider is available. Configure Wan 2.2 or LTX-Video (ComfyUI or official repo) in the AI Model Manager, or switch this scene.', 'blocked');
			// Start frame: continue from the previous AI clip, or a reference-conditioned still.
			let start = null;
			const prev = scene.continuity_from && project.scenes.find((s) => s.scene_id === scene.continuity_from);
			if (prev?.asset?.kind === 'video' && existsSync(projectPath(projectId, prev.asset.path))) {
				start = path.join(genDir, `continuity_${stamp}.png`);
				await ffmpeg(['-sseof', '-0.1', '-i', projectPath(projectId, prev.asset.path), '-frames:v', '1', start], {signal: ctx.signal});
				L(`Continuity: starting from the last frame of ${prev.scene_id}`);
			} else if ((characterReference(project, scene) || !caps.video.t2v) && caps.image.available) {
				start = path.join(genDir, `start_${stamp}.png`);
				ctx.progress(0.05, 'Generating consistent start frame');
				await generateImage({project, scene, caps, cfg, prompt, negative, outFile: start, ctx: {...ctx, log: L}, referencePath: characterReference(project, scene)});
				L('Start frame generated for image-to-video');
			} else if (!caps.video.t2v) await fail('The video provider only supports image-to-video and no start image is available.');
			const out = path.join(assetsDir, `${sceneId}_${stamp}.mp4`);
			const seconds = Math.min(scene.duration, caps.video.max_seconds);
			ctx.progress(0.15, `Generating ${seconds}s of video with ${caps.video.provider}`);
			if (caps.video.provider.startsWith('comfyui')) {
				const startName = start ? await uploadImage(cfg.comfyui, start) : null;
				const build = caps.video.provider === 'comfyui-wan22' ? wan22Workflow : ltxWorkflow;
				const {workflow, fps} = build(cfg.comfyui, {prompt, negative, seed: scene.seed, seconds, startImage: startName});
				writeFileSync(path.join(genDir, `workflow_${stamp}.json`), JSON.stringify(workflow, null, 2));
				const frames = await runWorkflow(cfg.comfyui, workflow, {outDir: path.join(genDir, `frames_${stamp}`), signal: ctx.signal, log: L});
				await framesToMp4(frames, fps, out, ctx.signal);
				meta = {provider: caps.video.provider, settings: {seconds, fps, frames: frames.length, start_image: Boolean(start), variant: cfg.comfyui.wan22.variant}};
			} else {
				const kind = caps.video.provider === 'wan-cli' ? 'wan' : 'ltx';
				const f = await cliVideoGenerate(kind === 'wan' ? cfg.wan_cli : cfg.ltx_cli, kind, {prompt, seed: scene.seed, seconds, startImage: start, outFile: out, signal: ctx.signal, log: L});
				if (f !== out) copyFileSync(f, out);
				meta = {provider: caps.video.provider, settings: {seconds, start_image: Boolean(start)}};
			}
			const pr = await probe(out);
			if (!pr.hasVideo || !pr.duration) await fail('The provider returned a file that is not a playable video.');
			asset = {path: path.relative(dir, out), kind: 'video', duration: pr.duration, width: pr.width, height: pr.height, source: meta.provider};
			if (pr.duration + 0.05 < scene.duration) L(`Clip is ${pr.duration.toFixed(2)}s for a ${scene.duration}s scene — the last frame is held for the remainder.`);
		} else if (method === 'blender_3d') {
			if (!caps.blender.available) await fail('Blender is not installed or not found. Install Blender or set its path in Settings.', 'blocked');
			const out = path.join(assetsDir, `${sceneId}_${stamp}_blender.mp4`);
			meta = await runBlender({project, scene, cfg, caps, outFile: out, ctx: {...ctx, log: L}});
			const pr = await probe(out);
			asset = {path: path.relative(dir, out), kind: 'video', duration: pr.duration, width: pr.width, height: pr.height, source: 'blender'};
		}
		writeFileSync(path.join(genDir, `generation_${stamp}.json`), JSON.stringify({scene_id: sceneId, method, prompt, negative, seed: scene.seed, ...meta, asset, at: now()}, null, 2));
		await setGeneration(projectId, sceneId, {status: 'succeeded', provider: meta.provider, settings: meta.settings, error: null, log, asset});
		return {asset};
	} catch (e) {
		if (ctx.signal.aborted) await setGeneration(projectId, sceneId, {status: 'failed', error: 'Stopped by user', log});
		else {
			const cur = loadProject(projectId).scenes.find((s) => s.scene_id === sceneId);
			if (cur?.generation.status === 'running') await setGeneration(projectId, sceneId, {status: 'failed', error: e.message, log});
		}
		throw e;
	}
});

// ═══ Scene rendering (Remotion, cached per scene) ═══════════════════════════

let bundleState = {serveUrl: null, srcStamp: 0, building: null};
const srcStamp = () => {
	let max = 0;
	const walk = (d) => {
		for (const f of readdirSync(d, {withFileTypes: true})) {
			const p = path.join(d, f.name);
			if (f.isDirectory()) walk(p);
			else max = Math.max(max, statSync(p).mtimeMs);
		}
	};
	walk(path.join(ROOT, 'src'));
	return Math.floor(max);
};

export const ensureBundle = async (log = () => {}) => {
	const stamp = srcStamp();
	if (bundleState.serveUrl && bundleState.srcStamp === stamp) return bundleState.serveUrl;
	if (bundleState.building) return bundleState.building;
	bundleState.building = (async () => {
		const {bundle} = await import('@remotion/bundler');
		log('Bundling the Remotion project (first render, or source changed)…');
		const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src', 'index.ts'), publicDir: path.join(ROOT, 'public'), enableCaching: true});
		bundleState = {serveUrl, srcStamp: stamp, building: null};
		return serveUrl;
	})();
	try {
		return await bundleState.building;
	} finally {
		bundleState.building = null;
	}
};
export const bundleInfo = () => ({ready: Boolean(bundleState.serveUrl), engine_stamp: bundleState.srcStamp});

const BROWSER = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';

export const sceneProps = (project, scene, quality) => ({
	scene,
	characters: project.characters.filter((c) => scene.characters.includes(c.id)),
	format: project.format,
	fps: project.fps,
	style: project.style,
	quality,
	assetBaseUrl: `${runtime.origin}/files/${project.id}`,
	burnSubtitles: project.export_settings.burn_subtitles,
});

/** Cache key: everything that changes pixels, nothing that doesn't. */
export const sceneCacheKey = (project, scene, quality) => {
	const {generation, route_reason, narration_audio, sound_effects, narration, visual_description, ...visual} = scene;
	const assetStamp = scene.asset ? statSync(projectPath(project.id, scene.asset.path), {throwIfNoEntry: false})?.mtimeMs ?? 0 : 0;
	const props = sceneProps(project, {...visual, narration: '', visual_description: '', sound_effects: [], narration_audio: null, route_reason: null, generation: null}, quality);
	delete props.assetBaseUrl;
	return createHash('sha1').update(JSON.stringify({props, assetStamp, engine: srcStamp()})).digest('hex').slice(0, 12);
};

export const sceneRenderPath = (project, scene, quality) => path.join(projectDir(project.id), 'renders', scene.scene_id, `${quality}-${sceneCacheKey(project, scene, quality)}.mp4`);

export const renderScene = async (project, scene, quality, ctx, weight = [0, 1]) => {
	const out = sceneRenderPath(project, scene, quality);
	if (existsSync(out)) {
		ctx.log(`${scene.scene_id}: cached ${quality} render reused`);
		return {file: out, cached: true};
	}
	const needsAsset = scene.visual_type !== 'procedural_3d';
	if (needsAsset && !scene.asset) throw new Error(`${scene.scene_id} uses "${scene.visual_type}" but has no generated/imported asset yet — generate or import it first (no placeholder is substituted).`);
	const {renderMedia, selectComposition, makeCancelSignal} = await import('@remotion/renderer');
	const serveUrl = await ensureBundle(ctx.log);
	const inputProps = sceneProps(project, scene, quality);
	const chromiumOptions = {gl: loadConfig().render.gl};
	const browserExecutable = existsSync(BROWSER) ? BROWSER : null;
	const composition = await selectComposition({serveUrl, id: 'CinematicScene', inputProps, chromiumOptions, browserExecutable, logLevel: 'error'});
	const {cancelSignal, cancel} = makeCancelSignal();
	const onAbort = () => cancel();
	ctx.signal.addEventListener('abort', onAbort);
	mkdirSync(path.dirname(out), {recursive: true});
	const tmp = `${out}.part.mp4`;
	const hw = await detectHardware();
	const t0 = Date.now();
	try {
		await renderMedia({
			serveUrl,
			composition,
			inputProps,
			codec: 'h264',
			outputLocation: tmp,
			scale: RENDER_QUALITY[quality].scale,
			crf: quality === 'final' ? 16 : 26,
			jpegQuality: quality === 'final' ? 92 : 75,
			muted: true,
			concurrency: loadConfig().render.concurrency ?? hw.render_concurrency,
			chromiumOptions,
			browserExecutable,
			cancelSignal,
			logLevel: 'error',
			onProgress: ({progress, renderedFrames}) => ctx.progress(weight[0] + (weight[1] - weight[0]) * progress, `Rendering ${scene.scene_id} (${quality}) — frame ${renderedFrames}/${composition.durationInFrames}`),
		});
	} finally {
		ctx.signal.removeEventListener('abort', onAbort);
	}
	const {renameSync} = await import('node:fs');
	renameSync(tmp, out);
	ctx.log(`${scene.scene_id}: rendered ${composition.durationInFrames} frames (${quality}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
	// Keep only the newest render per quality.
	for (const f of readdirSync(path.dirname(out))) if (f.startsWith(`${quality}-`) && path.join(path.dirname(out), f) !== out) rmSync(path.join(path.dirname(out), f), {force: true});
	return {file: out, cached: false};
};

registerJobKind('render_scene', 'local', async ({projectId, sceneId, quality}, ctx) => {
	const project = loadProject(projectId);
	const scene = project.scenes.find((s) => s.scene_id === sceneId);
	if (!scene) throw new Error(`Scene ${sceneId} not found`);
	const r = await renderScene(project, scene, quality, ctx);
	return {file: path.relative(projectDir(projectId), r.file), cached: r.cached};
});

/** Render a single still for the 3D Environment Studio (fast look-dev). */
export const renderStillPreview = async (project, scene, frame, outFile) => {
	const {renderStill, selectComposition} = await import('@remotion/renderer');
	const serveUrl = await ensureBundle();
	const inputProps = sceneProps(project, scene, 'preview');
	const chromiumOptions = {gl: loadConfig().render.gl};
	const browserExecutable = existsSync(BROWSER) ? BROWSER : null;
	const composition = await selectComposition({serveUrl, id: 'CinematicScene', inputProps, chromiumOptions, browserExecutable, logLevel: 'error'});
	mkdirSync(path.dirname(outFile), {recursive: true});
	await renderStill({serveUrl, composition, inputProps, frame: Math.min(frame, composition.durationInFrames - 1), output: outFile, scale: 0.5, chromiumOptions, browserExecutable, logLevel: 'error', imageFormat: 'jpeg', jpegQuality: 85});
	return outFile;
};

// ═══ Narration ══════════════════════════════════════════════════════════════

registerJobKind('narration', 'remote', async ({projectId, sceneIds}, ctx) => {
	const cfg = loadConfig();
	const {tts} = await detectProviders({refresh: true});
	if (!tts.active) throw new Error(`No text-to-speech provider is available: ${tts.reason}. Import narration audio instead.`);
	const project = loadProject(projectId);
	const targets = project.scenes.filter((s) => (!sceneIds || sceneIds.includes(s.scene_id)) && s.narration.trim());
	if (!targets.length) throw new Error('No scene has narration text.');
	const made = [];
	for (const [i, s] of targets.entries()) {
		if (ctx.signal.aborted) throw new Error('Stopped');
		ctx.progress(i / targets.length, `Speaking ${s.scene_id} with ${tts.active}`);
		const out = path.join(projectDir(projectId), 'audio', `narration_${s.scene_id}_${Date.now()}.wav`);
		await synthesizeSpeech(cfg.tts, tts.active, {text: s.narration, language: project.language, outFile: out, signal: ctx.signal, log: ctx.log});
		const pr = await probe(out);
		if (!pr.duration) throw new Error(`${tts.active} wrote an empty file for ${s.scene_id}`);
		made.push({scene_id: s.scene_id, path: path.relative(projectDir(projectId), out), duration: pr.duration, source: `tts:${tts.active}`});
		ctx.log(`${s.scene_id}: ${pr.duration.toFixed(2)}s of narration (${tts.active})`);
	}
	await updateProject(projectId, (p) => {
		for (const m of made) {
			const s = p.scenes.find((x) => x.scene_id === m.scene_id);
			if (s) s.narration_audio = {path: m.path, duration: m.duration, source: m.source};
		}
	});
	return {scenes: made};
});

/** Scene duration from its narration (+ lead/tail), and fresh subtitle timing. */
export const fitToNarration = (project) => {
	for (const s of project.scenes) {
		if (!s.narration_audio) continue;
		s.duration = +Math.min(120, Math.max(2, s.narration_audio.duration + 0.3 + 0.7)).toFixed(2);
		s.subtitles = autoSubtitles(s.narration, s.narration_audio.duration + 0.3, 0.3);
		for (const o of s.overlays) o.end = Math.min(o.end, s.duration);
	}
	return project;
};

// ═══ Export ═════════════════════════════════════════════════════════════════

const buildNarrationTrack = async (project, starts, total, file, log) => {
	const buf = new Float32Array(Math.ceil(total * SR));
	let placed = 0;
	for (const [i, s] of project.scenes.entries()) {
		if (!s.narration_audio) continue;
		const src = projectPath(project.id, s.narration_audio.path);
		if (!existsSync(src)) {
			log(`WARNING ${s.scene_id}: narration file missing (${s.narration_audio.path}) — skipped`);
			continue;
		}
		const pcm = await decodeMono(src);
		const at = Math.floor((starts[i] + 0.3) * SR);
		const maxLen = Math.floor((starts[i] + s.duration) * SR) - at;
		if (pcm.length > maxLen) log(`WARNING ${s.scene_id}: narration (${(pcm.length / SR).toFixed(1)}s) is longer than the scene — use "Fit durations to narration"`);
		for (let k = 0; k < Math.min(pcm.length, buf.length - at); k++) buf[at + k] += pcm[k];
		placed++;
	}
	if (!placed) return null;
	writeWav(file, buf);
	return file;
};

registerJobKind('export', 'local', async ({projectId, quality}, ctx) => {
	const project = loadProject(projectId);
	if (!project.scenes.length) throw new Error('The project has no scenes.');
	const missing = project.scenes.filter((s) => s.visual_type !== 'procedural_3d' && !s.asset).map((s) => `${s.scene_id} (${s.visual_type})`);
	if (missing.length) throw new Error(`These scenes have no generated or imported asset yet: ${missing.join(', ')}. Generate them or switch them to procedural 3D.`);
	const dir = projectDir(projectId);
	const work = path.join(dir, 'exports', '.work');
	mkdirSync(work, {recursive: true});
	const clips = [];
	for (const [i, s] of project.scenes.entries()) {
		if (ctx.signal.aborted) throw new Error('Stopped');
		const w0 = (i / project.scenes.length) * 0.8;
		const w1 = ((i + 1) / project.scenes.length) * 0.8;
		clips.push((await renderScene(project, s, quality, ctx, [w0, w1])).file);
	}
	ctx.progress(0.82, 'Joining scenes with transitions (FFmpeg)');
	const silent = path.join(work, 'picture.mp4');
	await concatScenes({clips, scenes: project.scenes, fps: project.fps, out: silent, signal: ctx.signal});
	const {starts, total} = sceneStarts(project.scenes, project.fps);

	ctx.progress(0.88, 'Building audio: narration, music, sound design');
	const narration = await buildNarrationTrack(project, starts, total, path.join(work, 'narration.wav'), ctx.log);
	if (!narration) ctx.log('No narration audio in this project — exporting without voice-over.');
	let music = null;
	if (project.audio.music.path) {
		music = projectPath(projectId, project.audio.music.path);
		if (!existsSync(music)) throw new Error(`Music file missing: ${project.audio.music.path}`);
	}
	const sfx = synthSfx({scenes: project.scenes, starts, total});
	const sfxFile = sfx.used.length ? path.join(work, 'sfx.wav') : null;
	if (sfxFile) writeWav(sfxFile, sfx.L, sfx.R);
	ctx.log(`Sound design: ${sfx.used.length} procedural effect layer(s)`);
	const srtText = buildSrt(project.scenes, starts);
	const srt = srtText.trim() ? path.join(work, 'subtitles.srt') : null;
	if (srt) writeFileSync(srt, srtText);

	ctx.progress(0.92, 'Mixing, loudness normalisation and H.264 encode');
	const safe = project.title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40) || 'export';
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const out = path.join(dir, 'exports', `${safe}_${quality}_${stamp}.mp4`);
	const filter = await masterExport({video: silent, narration, music, sfx: sfxFile, srt, out, fps: project.fps, audio: project.audio, exportSettings: project.export_settings, total, language: project.language, title: project.title, signal: ctx.signal});
	if (srt) copyFileSync(srt, out.replace(/\.mp4$/, '.srt'));
	const qc = await qcReport(out);
	const report = {file: path.basename(out), quality, created_at: now(), qc, scenes: project.scenes.map((s, i) => ({scene_id: s.scene_id, start: +starts[i].toFixed(3), duration: s.duration, method: s.visual_type, transition: s.transition, narration: s.narration_audio?.source ?? null})), audio: {narration: Boolean(narration), music: project.audio.music.path ? project.audio.music.source : null, sfx: sfx.used, ducking: project.audio.duck_music, target_lufs: project.audio.target_lufs, filter}};
	writeFileSync(out.replace(/\.mp4$/, '.json'), JSON.stringify(report, null, 2));
	ctx.log(`Export written: ${path.basename(out)} — ${qc.duration_s?.toFixed(2)}s, ${qc.width}×${qc.height}, ${qc.loudness_lufs ?? 'n/a'} LUFS`);
	return {file: path.relative(dir, out), qc};
});

/** Procedural score for the project (labelled as such), written to audio/score.wav. */
export const generateProceduralMusic = (project) => {
	const {starts, total} = sceneStarts(project.scenes, project.fps);
	const {L, R} = synthScore({total, starts, style: project.style});
	const rel = path.join('audio', `score_procedural_${Date.now()}.wav`);
	writeWav(projectPath(project.id, rel), L, R);
	return {path: rel, duration: total};
};
