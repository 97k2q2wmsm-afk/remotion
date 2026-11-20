#!/usr/bin/env node
// Cinematic AI Studio — local web server (no framework; Node ≥ 22.18).
//   npm run studio            → http://127.0.0.1:4555
//   STUDIO_HOST=0.0.0.0 STUDIO_TOKEN=secret npm run studio   → reachable from a phone on your LAN
import {createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, createWriteStream} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {pipeline as streamPipeline} from 'node:stream/promises';
import * as SCHEMA from '../src/cinematic/schema.ts';
import {SAMPLE_CHARACTERS, SAMPLE_PROJECT_SCENES} from '../src/cinematic/samples.ts';
import {loadConfig, saveConfig} from './lib/config.mjs';
import {detectHardware} from './lib/hardware.mjs';
import {cancelJob, enqueue, getJob, listJobs, pauseJob, resumeJob, retryJob, startQueue} from './lib/jobs.mjs';
import {autoSubtitles, defaultSoundEffects, peaks, probe, sceneStarts} from './lib/media.mjs';
import {bundleInfo, fitToNarration, generateProceduralMusic, renderStillPreview, runtime, sceneCacheKey, sceneRenderPath} from './lib/pipeline.mjs';
import {detectComfy} from './lib/providers/comfyui.mjs';
import {detectProviders} from './lib/providers/index.mjs';
import {routeScene} from './lib/router.mjs';
import {buildStoryboard, llmScript, templateScript} from './lib/storyboard.mjs';
import {deleteProject, httpError, listProjects, loadProject, newProject, projectDir, projectPath, ROOT, saveProject, updateProject} from './lib/store.mjs';

const PORT = Number(process.env.STUDIO_PORT || 4555);
const HOST = process.env.STUDIO_HOST || '127.0.0.1';
const TOKEN = process.env.STUDIO_TOKEN || '';
const UI = path.join(import.meta.dirname, 'ui');
runtime.origin = `http://127.0.0.1:${PORT}`;

const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.srt': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.webmanifest': 'application/manifest+json'};

const send = (res, status, body, headers = {}) => {
	const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
	res.writeHead(status, {'content-type': isObj ? 'application/json' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers});
	res.end(isObj ? JSON.stringify(body) : body);
};

/** Static file with HTTP Range support (iOS Safari will not play video without it). */
const sendFile = (req, res, file) => {
	if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, {error: 'Not found'});
	const size = statSync(file).size;
	const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
	const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
	if (range) {
		const start = range[1] ? Number(range[1]) : size - Number(range[2]);
		const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
		if (start >= size || start < 0) return send(res, 416, '', {'content-range': `bytes */${size}`});
		res.writeHead(206, {'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'cache-control': 'no-cache'});
		return createReadStream(file, {start, end}).pipe(res);
	}
	res.writeHead(200, {'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache'});
	createReadStream(file).pipe(res);
};

const readBody = async (req, limit = 5e6) => {
	const chunks = [];
	let n = 0;
	for await (const c of req) {
		n += c.length;
		if (n > limit) throw httpError(413, 'Request body too large');
		chunks.push(c);
	}
	const text = Buffer.concat(chunks).toString('utf8');
	if (!text) return {};
	try {
		return JSON.parse(text);
	} catch {
		throw httpError(400, 'Body must be JSON');
	}
};

const UPLOAD_KINDS = {
	scene_asset: {exts: ['.mp4', '.mov', '.webm', '.png', '.jpg', '.jpeg', '.webp'], dir: 'assets'},
	character_reference: {exts: ['.png', '.jpg', '.jpeg', '.webp'], dir: 'assets/characters'},
	character_model: {exts: ['.glb', '.gltf'], dir: 'assets/characters'},
	narration: {exts: ['.wav', '.mp3', '.m4a', '.ogg', '.aac', '.flac'], dir: 'audio'},
	music: {exts: ['.wav', '.mp3', '.m4a', '.ogg', '.aac', '.flac'], dir: 'audio'},
};

const sceneOf = (p, sid) => {
	const s = p.scenes.find((x) => x.scene_id === sid);
	if (!s) throw httpError(404, `Scene ${sid} not found`);
	return s;
};

/** Per-scene render-cache status for the UI. */
const renderStatus = (p) =>
	Object.fromEntries(
		p.scenes.map((s) => {
			const out = {};
			for (const q of Object.keys(SCHEMA.RENDER_QUALITY)) {
				try {
					const f = sceneRenderPath(p, s, q);
					out[q] = existsSync(f) ? path.relative(projectDir(p.id), f) : null;
				} catch {
					out[q] = null;
				}
			}
			return [s.scene_id, out];
		}),
	);

const listExports = (id) => {
	const dir = path.join(projectDir(id), 'exports');
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith('.mp4'))
		.map((f) => {
			const json = path.join(dir, f.replace(/\.mp4$/, '.json'));
			return {file: `exports/${f}`, srt: existsSync(path.join(dir, f.replace(/\.mp4$/, '.srt'))) ? `exports/${f.replace(/\.mp4$/, '.srt')}` : null, report: existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')) : null, mtime: statSync(path.join(dir, f)).mtimeMs};
		})
		.sort((a, b) => b.mtime - a.mtime);
};

// ─── Routes ─────────────────────────────────────────────────────────────────
const routes = [];
const on = (method, pattern, fn) => routes.push({method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn});

on('GET', '/api/status', async () => ({app: 'Cinematic AI Studio', version: 1, hardware: await detectHardware(loadConfig().hardware.gpu_vram_gb_override), bundle: bundleInfo(), lan: HOST !== '127.0.0.1', token_required: Boolean(TOKEN)}));
on('GET', '/api/schema', () => {
	const pick = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.label]));
	return {
		formats: SCHEMA.FORMATS,
		fps: SCHEMA.FPS_OPTIONS,
		visual_types: SCHEMA.VISUAL_TYPES,
		environments: pick(SCHEMA.ENVIRONMENTS),
		shots: pick(SCHEMA.CAMERA_SHOTS),
		moves: pick(SCHEMA.CAMERA_MOVES),
		focus: pick(SCHEMA.FOCUS_TARGETS),
		lighting: pick(SCHEMA.LIGHTING),
		atmosphere: pick(SCHEMA.ATMOSPHERE),
		animations: pick(SCHEMA.ANIMATIONS),
		sound_effects: pick(SCHEMA.SOUND_EFFECTS),
		transitions: SCHEMA.TRANSITIONS,
		styles: SCHEMA.STYLES,
		languages: pick(SCHEMA.LANGUAGES),
		generation_status: pick(SCHEMA.GENERATION_STATUS),
		job_status: pick(SCHEMA.JOB_STATUS),
		render_quality: SCHEMA.RENDER_QUALITY,
		hair_styles: pick(SCHEMA.HAIR_STYLES),
		builds: pick(SCHEMA.BUILDS),
	};
});
on('GET', '/api/hardware', async () => detectHardware(loadConfig().hardware.gpu_vram_gb_override));
on('GET', '/api/providers', async ({url}) => detectProviders({refresh: url.searchParams.has('refresh')}));
on('GET', '/api/config', () => ({config: loadConfig(), google_key_present: Boolean(process.env.GOOGLE_TTS_API_KEY)}));
on('PUT', '/api/config', async ({req}) => {
	const next = saveConfig(await readBody(req));
	await detectProviders({refresh: true});
	return {config: next};
});
on('POST', '/api/providers/comfyui/test', async ({req}) => {
	const body = await readBody(req);
	const cfg = {...loadConfig().comfyui, ...(body.url ? {url: body.url} : {})};
	const t0 = Date.now();
	const r = await detectComfy(cfg);
	return {ok: r.reachable, latency_ms: Date.now() - t0, ...r};
});
on('POST', '/api/providers/test', async () => detectProviders({refresh: true}));

on('GET', '/api/projects', () => listProjects());
on('POST', '/api/projects', async ({req}) => {
	const b = await readBody(req);
	if (!b.topic?.trim() && !b.title?.trim()) throw httpError(400, 'Enter a topic');
	return saveProject(newProject(b));
});
on('POST', '/api/sample-project', async () => {
	const p = newProject({title: 'Eternal Rome (sample)', topic: 'What if Rome never fell?', language: 'en', format: '16:9', fps: 24, target_duration: 26, style: 'epic_historical'});
	p.characters = structuredClone(SAMPLE_CHARACTERS);
	p.scenes = structuredClone(SAMPLE_PROJECT_SCENES).map((s) => ({...s, sound_effects: defaultSoundEffects(s), subtitles: autoSubtitles(s.narration, s.duration)}));
	p.script = {title: p.title, beats: p.scenes.map((s) => ({kind: 'develop', heading: s.scene_id, narration: s.narration})), source: 'sample'};
	p.audio.music = {...generateProceduralMusic(p), volume: 0.35, source: 'procedural (studio synth)'};
	delete p.audio.music.duration;
	return saveProject(p);
});
on('GET', '/api/projects/:id', ({params}) => {
	const p = loadProject(params.id);
	return {project: p, renders: renderStatus(p), timeline: sceneStarts(p.scenes, p.fps), validation: SCHEMA.validateProject(p)};
});
on('PUT', '/api/projects/:id', async ({req, params}) => {
	const body = await readBody(req, 20e6);
	if (body.id !== params.id) throw httpError(400, 'Project id mismatch');
	const prev = loadProject(params.id);
	return saveProject({...body, created_at: prev.created_at, schema_version: SCHEMA.SCHEMA_VERSION});
});
on('DELETE', '/api/projects/:id', ({params}) => {
	deleteProject(params.id);
	return {deleted: params.id};
});

on('POST', '/api/projects/:id/script', async ({req, params}) => {
	const {use_llm} = await readBody(req);
	const cfg = loadConfig();
	const p = loadProject(params.id);
	let script;
	if (use_llm || cfg.llm.provider === 'ollama') {
		const {capabilities} = await detectProviders({refresh: true});
		if (!capabilities.llm.available) throw httpError(409, 'Local LLM (Ollama) is not available — see the AI Model Manager. Use the template writer instead.');
		script = await llmScript(p, cfg.llm, AbortSignal.timeout(180000));
	} else script = templateScript(p);
	return updateProject(params.id, (x) => {
		x.script = script;
		if (script.title && x.title === x.topic) x.title = script.title;
	});
});
on('POST', '/api/projects/:id/storyboard', async ({params}) => {
	const {capabilities} = await detectProviders();
	return updateProject(params.id, (p) => {
		p.scenes = buildStoryboard(p).map((s) => {
			const r = routeScene(s, capabilities, p.characters);
			return {...s, visual_type: r.visual_type, route_reason: r.reason};
		});
	});
});
on('POST', '/api/projects/:id/route', async ({params}) => {
	const {capabilities} = await detectProviders({refresh: true});
	const blocked = [];
	const p = await updateProject(params.id, (x) => {
		for (const s of x.scenes) {
			const r = routeScene(s, capabilities, x.characters);
			s.visual_type = r.visual_type;
			s.route_reason = r.blocked ? `${r.reason} ⚠ ${r.blocked}` : r.reason;
			if (r.blocked) blocked.push({scene_id: s.scene_id, reason: r.blocked});
			if (s.visual_type === 'procedural_3d' && s.generation.status === 'not_started') s.generation = {...s.generation, status: 'not_required', method: 'procedural_3d', provider: 'procedural'};
		}
	});
	return {project: p, blocked, capabilities};
});

on('POST', '/api/projects/:id/scenes/:sid/generate', async ({req, params}) => {
	const {new_seed} = await readBody(req);
	if (new_seed) await updateProject(params.id, (p) => void (sceneOf(p, params.sid).seed = Math.floor(Math.random() * 1e9)));
	const p = loadProject(params.id);
	sceneOf(p, params.sid);
	await updateProject(params.id, (x) => void (sceneOf(x, params.sid).generation.status = 'queued'));
	return enqueue('generate_scene', {projectId: params.id, sceneId: params.sid, label: `Generate ${params.sid}`, attempt: new_seed ? Date.now() : undefined});
});
on('POST', '/api/projects/:id/generate-all', async ({params}) => {
	const p = loadProject(params.id);
	return p.scenes.map((s) => enqueue('generate_scene', {projectId: params.id, sceneId: s.scene_id, label: `Generate ${s.scene_id}`}));
});
on('POST', '/api/projects/:id/scenes/:sid/still', async ({req, params}) => {
	const {frame, scene} = await readBody(req);
	const p = loadProject(params.id);
	// "_lookdev" = scratch scene from the 3D Environment Studio (not part of the storyboard).
	const base = params.sid === '_lookdev' ? SCHEMA.makeScene({scene_id: 'lookdev'}) : sceneOf(p, params.sid);
	const s = scene ? {...base, ...scene, scene_id: base.scene_id} : base;
	const errors = SCHEMA.validateScene(s);
	if (errors.length) throw httpError(422, errors.join('; '));
	const rel = `renders/stills/${params.sid}-${Date.now()}.jpg`;
	await renderStillPreview(p, s, Number(frame ?? Math.round((s.duration * p.fps) / 2)), projectPath(params.id, rel));
	return {file: rel};
});

on('POST', '/api/projects/:id/upload', async ({req, params, url}) => {
	const kind = url.searchParams.get('kind');
	const name = path.basename(url.searchParams.get('name') || 'upload');
	const spec = UPLOAD_KINDS[kind];
	if (!spec) throw httpError(400, `kind must be one of ${Object.keys(UPLOAD_KINDS).join(', ')}`);
	const ext = path.extname(name).toLowerCase();
	if (!spec.exts.includes(ext)) throw httpError(415, `${kind} accepts ${spec.exts.join(', ')}`);
	loadProject(params.id);
	const rel = path.join(spec.dir, `${Date.now()}_${name.replace(/[^\w.-]+/g, '_')}`);
	const full = projectPath(params.id, rel);
	mkdirSync(path.dirname(full), {recursive: true});
	await streamPipeline(req, createWriteStream(full));
	let info;
	try {
		info = await probe(full);
	} catch (e) {
		rmSync(full, {force: true});
		throw httpError(422, `Not a readable media file: ${e.message.slice(0, 200)}`);
	}
	const sid = url.searchParams.get('scene');
	const cid = url.searchParams.get('character');
	const p = await updateProject(params.id, (p) => {
		if (kind === 'scene_asset') {
			const s = sceneOf(p, sid);
			s.asset = {path: rel, kind: info.hasVideo ? 'video' : 'image', duration: info.hasVideo ? info.duration : null, width: info.width, height: info.height, source: 'upload'};
			if (url.searchParams.get('set_method') !== 'false') {
				s.visual_type = 'user_asset';
				s.visual_type_locked = true;
				s.route_reason = 'Imported asset (chosen by you).';
			}
			s.generation = {...s.generation, status: 'succeeded', method: s.visual_type, provider: 'upload', error: null, updated_at: new Date().toISOString(), log: [`Imported ${name}`]};
		} else if (kind === 'character_reference' || kind === 'character_model') {
			const c = p.characters.find((x) => x.id === cid);
			if (!c) throw httpError(404, `Character ${cid} not found`);
			if (kind === 'character_reference') c.reference_images.push(rel);
			else c.model_reference = rel;
		} else if (kind === 'narration') {
			if (!info.hasAudio) throw httpError(422, 'File has no audio stream');
			const s = sceneOf(p, sid);
			s.narration_audio = {path: rel, duration: info.duration, source: 'upload'};
		} else if (kind === 'music') {
			if (!info.hasAudio) throw httpError(422, 'File has no audio stream');
			p.audio.music = {...p.audio.music, path: rel, source: 'upload'};
		}
	});
	return {path: rel, info, project: p};
});

on('POST', '/api/projects/:id/narration/generate', async ({req, params}) => {
	const {scene_ids} = await readBody(req);
	return enqueue('narration', {projectId: params.id, sceneIds: scene_ids ?? null, label: 'Generate narration (TTS)'});
});
on('POST', '/api/projects/:id/narration/fit', async ({params}) => updateProject(params.id, (p) => fitToNarration(p)));
on('POST', '/api/projects/:id/subtitles/auto', async ({params}) =>
	updateProject(params.id, (p) => {
		for (const s of p.scenes) s.subtitles = autoSubtitles(s.narration, s.narration_audio ? s.narration_audio.duration + 0.3 : s.duration, 0.3);
	}),
);
on('POST', '/api/projects/:id/music/procedural', async ({params}) =>
	updateProject(params.id, (p) => {
		const m = generateProceduralMusic(p);
		p.audio.music = {...p.audio.music, path: m.path, source: 'procedural (studio synth)'};
	}),
);
on('GET', '/api/projects/:id/waveform', async ({params, url}) => peaks(projectPath(params.id, url.searchParams.get('path') ?? ''), Number(url.searchParams.get('buckets') ?? 400)));

on('POST', '/api/projects/:id/render', async ({req, params}) => {
	const {scene_id, quality = 'preview'} = await readBody(req);
	if (!Object.hasOwn(SCHEMA.RENDER_QUALITY, quality)) throw httpError(400, 'quality must be preview or final');
	const p = loadProject(params.id);
	const scenes = scene_id ? [sceneOf(p, scene_id)] : p.scenes;
	return scenes.map((s) => enqueue('render_scene', {projectId: params.id, sceneId: s.scene_id, quality, key: sceneCacheKey(p, s, quality), label: `Render ${s.scene_id} (${quality})`}));
});
on('POST', '/api/projects/:id/export', async ({req, params}) => {
	const {quality = 'final'} = await readBody(req);
	return enqueue('export', {projectId: params.id, quality, label: `Export ${quality}`, requested_at: Date.now()});
});
on('GET', '/api/projects/:id/exports', ({params}) => listExports(params.id));

on('GET', '/api/jobs', ({url}) => listJobs(url.searchParams.get('project')).slice(0, 100).map(({log, ...j}) => ({...j, log_tail: log.slice(-6)})));
on('GET', '/api/jobs/:jid', ({params}) => getJob(params.jid) ?? Promise.reject(httpError(404, 'No such job')));
on('POST', '/api/jobs/:jid/pause', ({params}) => pauseJob(params.jid));
on('POST', '/api/jobs/:jid/resume', ({params}) => resumeJob(params.jid));
on('POST', '/api/jobs/:jid/cancel', ({params}) => cancelJob(params.jid));
on('POST', '/api/jobs/:jid/retry', ({params}) => retryJob(params.jid));

// ─── Server ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
	try {
		if (TOKEN && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/'))) {
			const given = req.headers['x-studio-token'] || url.searchParams.get('token') || (req.headers.cookie ?? '').match(/studio_token=([^;]+)/)?.[1];
			const local = req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1' || req.socket.remoteAddress === '::ffff:127.0.0.1';
			if (!local && given !== TOKEN) return send(res, 401, {error: 'Studio token required'});
		}
		if (url.pathname.startsWith('/files/')) {
			const [, , id, ...rest] = url.pathname.split('/');
			return sendFile(req, res, projectPath(id, decodeURIComponent(rest.join('/'))));
		}
		if (url.pathname.startsWith('/api/')) {
			for (const r of routes) {
				const m = req.method === r.method && url.pathname.match(r.re);
				if (m) {
					const out = await r.fn({req, res, url, params: m.groups ?? {}});
					return send(res, 200, out ?? {ok: true});
				}
			}
			return send(res, 404, {error: `No route ${req.method} ${url.pathname}`});
		}
		const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
		const file = path.resolve(UI, rel);
		if (!file.startsWith(UI)) return send(res, 400, 'Bad path');
		return sendFile(req, res, existsSync(file) ? file : path.join(UI, 'index.html'));
	} catch (e) {
		const status = e.status ?? 500;
		if (status >= 500) console.error(e);
		return send(res, status, {error: e.message});
	}
});

server.listen(PORT, HOST, () => {
	startQueue();
	console.log(`Cinematic AI Studio → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}${TOKEN ? '  (token required off-device)' : ''}`);
	if (HOST === '0.0.0.0' && !TOKEN) console.warn('WARNING: listening on all interfaces without STUDIO_TOKEN — anyone on your network can use the studio.');
	console.log(`Data: ${path.relative(ROOT, projectDir('x-x-x').replace(/x-x-x$/, '')) || '.'}`);
});
