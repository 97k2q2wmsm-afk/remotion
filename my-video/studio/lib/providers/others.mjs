// Non-ComfyUI providers. Each `detect*` returns {available, reason, ...} with a
// concrete, user-actionable reason when unavailable. Nothing here downloads models.
import {execFile, spawn} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {netReason} from './comfyui.mjs';

const run = promisify(execFile);

const which = async (bin) => {
	if (!bin) return null;
	if (bin.includes('/')) return existsSync(bin) ? bin : null;
	try {
		const {stdout} = await run('sh', ['-c', `command -v ${JSON.stringify(bin)}`]);
		return stdout.trim() || null;
	} catch {
		return null;
	}
};

/** Spawn with cancellation and a log callback; rejects with the tail of stderr. */
export const spawnLogged = (cmd, args, {cwd, signal, log, input, timeoutMs} = {}) =>
	new Promise((resolve, reject) => {
		const p = spawn(cmd, args, {cwd, signal, timeout: timeoutMs});
		let tail = '';
		const onData = (d) => {
			const s = d.toString();
			tail = (tail + s).slice(-4000);
			for (const line of s.split('\n')) if (line.trim()) log?.(line.trim().slice(0, 300));
		};
		p.stdout.on('data', onData);
		p.stderr.on('data', onData);
		p.on('error', (e) => reject(new Error(`${path.basename(cmd)} could not start: ${e.message}`)));
		p.on('close', (code, sig) => (code === 0 ? resolve(tail) : reject(new Error(sig ? `${path.basename(cmd)} was stopped (${sig})` : `${path.basename(cmd)} exited with ${code}: ${tail.slice(-800)}`))));
		if (input !== undefined) p.stdin.end(input);
	});

// ─── AUTOMATIC1111 / Forge (local Stable Diffusion WebUI API) ───────────────
export const detectA1111 = async (cfg) => {
	if (!cfg.enabled) return {available: false, reason: 'Disabled in settings.'};
	try {
		const res = await fetch(`${cfg.url.replace(/\/$/, '')}/sdapi/v1/sd-models`, {signal: AbortSignal.timeout(4000)});
		if (!res.ok) return {available: false, reason: `API returned HTTP ${res.status} — start the WebUI with --api`};
		const models = await res.json();
		return {available: models.length > 0, reason: models.length ? `${models.length} model(s): ${models.slice(0, 3).map((m) => m.model_name).join(', ')}` : 'No models installed', models: models.map((m) => m.title)};
	} catch (e) {
		return {available: false, reason: `Not reachable at ${cfg.url} (${netReason(e)})`};
	}
};

export const a1111Generate = async (cfg, {prompt, negative, seed, width, height, referenceB64, outFile, signal}) => {
	const base = cfg.url.replace(/\/$/, '');
	const body = {prompt, negative_prompt: negative, seed, steps: cfg.steps, cfg_scale: cfg.cfg, sampler_name: cfg.sampler, width, height};
	const endpoint = referenceB64 ? 'img2img' : 'txt2img';
	if (referenceB64) Object.assign(body, {init_images: [referenceB64], denoising_strength: 0.62});
	const res = await fetch(`${base}/sdapi/v1/${endpoint}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body), signal});
	if (!res.ok) throw new Error(`A1111 ${endpoint} → HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
	const r = await res.json();
	if (!r.images?.[0]) throw new Error('A1111 returned no image');
	writeFileSync(outFile, Buffer.from(r.images[0], 'base64'));
	return outFile;
};

// ─── Official Wan 2.2 / LTX-Video repositories via their CLI ────────────────
export const detectCliVideo = async (cfg, kind) => {
	if (!cfg.enabled) return {available: false, reason: 'Disabled in settings.'};
	if (!cfg.repo_path) return {available: false, reason: `Set the path to your ${kind === 'wan' ? 'Wan2.2' : 'LTX-Video'} checkout.`};
	const entry = kind === 'wan' ? 'generate.py' : 'inference.py';
	if (!existsSync(path.join(cfg.repo_path, entry))) return {available: false, reason: `${entry} not found in ${cfg.repo_path}`};
	if (!(await which(cfg.python))) return {available: false, reason: `Python interpreter "${cfg.python}" not found`};
	return {available: true, reason: `${kind === 'wan' ? 'Wan2.2' : 'LTX-Video'} repo at ${cfg.repo_path}`, t2v: true, i2v: true, max_seconds: cfg.max_seconds, fps: cfg.fps};
};

const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
export const cliVideoGenerate = async (cfg, kind, {prompt, seed, seconds, startImage, outFile, signal, log, width = 1280, height = 704}) => {
	const outDir = path.dirname(outFile);
	mkdirSync(outDir, {recursive: true});
	const frames = kind === 'wan' ? Math.round((seconds * cfg.fps) / 4) * 4 + 1 : Math.round((seconds * cfg.fps) / 8) * 8 + 1;
	const vars = {
		python: cfg.python,
		prompt: shellQuote(prompt),
		seed,
		out: shellQuote(outFile),
		out_dir: shellQuote(outDir),
		ckpt_dir: shellQuote(cfg.ckpt_dir ?? ''),
		pipeline_config: shellQuote(cfg.pipeline_config ?? ''),
		frames,
		width,
		height,
		image_arg: startImage ? (kind === 'wan' ? `--image ${shellQuote(startImage)}` : `--conditioning_media_paths ${shellQuote(startImage)} --conditioning_start_frames 0`) : '',
	};
	const cmd = cfg.command.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
	log(`$ ${cmd.slice(0, 400)}`);
	await spawnLogged('sh', ['-c', cmd], {cwd: cfg.repo_path, signal, log});
	if (existsSync(outFile)) return outFile;
	const mp4 = readdirSync(outDir).filter((f) => f.endsWith('.mp4')).map((f) => path.join(outDir, f));
	if (!mp4.length) throw new Error('The CLI finished but no MP4 was written — check the command template in settings.');
	return mp4[mp4.length - 1];
};

// ─── Blender (optional, headless) ───────────────────────────────────────────
export const detectBlender = async (cfg) => {
	if (!cfg.enabled) return {available: false, reason: 'Disabled in settings.'};
	const bin = (await which(cfg.path || 'blender')) || (process.platform === 'darwin' && existsSync('/Applications/Blender.app/Contents/MacOS/Blender') ? '/Applications/Blender.app/Contents/MacOS/Blender' : null);
	if (!bin) return {available: false, reason: 'Blender not found. Install it (blender.org) or set its path — the app works without it.'};
	try {
		const {stdout} = await run(bin, ['--version'], {timeout: 20000});
		const version = stdout.split('\n')[0].trim();
		return {available: true, reason: version, binary: bin, version};
	} catch (e) {
		return {available: false, reason: `Blender at ${bin} failed to start: ${e.message.slice(0, 200)}`};
	}
};

// ─── Text to speech ─────────────────────────────────────────────────────────
const ESPEAK_LANG = {en: 'en-us', tr: 'tr', es: 'es'};
const GOOGLE_LANG = {en: 'en-US', tr: 'tr-TR', es: 'es-ES'};

export const detectTts = async (cfg) => {
	const out = {piper: {available: false, reason: ''}, espeak: {available: false, reason: ''}, google: {available: false, reason: ''}};
	const piper = await which(cfg.piper.binary);
	out.piper = !piper ? {available: false, reason: 'piper binary not found (github.com/rhasspy/piper)'} : !cfg.piper.model || !existsSync(cfg.piper.model) ? {available: false, reason: 'Set a Piper voice model (.onnx) path'} : {available: true, reason: `piper + ${path.basename(cfg.piper.model)}`};
	const esp = await which(cfg.espeak.binary);
	out.espeak = esp ? {available: true, reason: `${esp} (robotic but free & offline)`} : {available: false, reason: 'espeak-ng not installed'};
	const key = Boolean(process.env.GOOGLE_TTS_API_KEY);
	out.google = !cfg.google.enabled ? {available: false, reason: 'Disabled (paid cloud API)'} : !cfg.google.consent_paid_api ? {available: false, reason: 'Enabled but paid-API consent not given'} : !key ? {available: false, reason: 'GOOGLE_TTS_API_KEY not set in the environment'} : {available: true, reason: 'Google Cloud TTS (billed to your account)'};
	const order = cfg.provider === 'auto' ? ['piper', 'espeak'] : [cfg.provider];
	const active = order.find((p) => out[p]?.available) ?? null;
	return {...out, active, reason: active ? `Using ${active}` : cfg.provider === 'none' ? 'TTS disabled — import narration audio instead' : 'No TTS provider available — import narration audio, or install piper/espeak-ng'};
};

/** Synthesise `text` to a WAV/MP3 file. Throws when no provider works — never fakes audio. */
export const synthesizeSpeech = async (cfg, provider, {text, language, outFile, signal, log}) => {
	mkdirSync(path.dirname(outFile), {recursive: true});
	if (provider === 'piper') {
		await spawnLogged(cfg.piper.binary, ['--model', cfg.piper.model, '--output_file', outFile], {input: text, signal, log});
	} else if (provider === 'espeak') {
		await spawnLogged(cfg.espeak.binary, ['-v', ESPEAK_LANG[language] ?? 'en', '-s', String(cfg.espeak.speed), '-w', outFile, text], {signal, log});
	} else if (provider === 'google') {
		const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(process.env.GOOGLE_TTS_API_KEY ?? '')}`, {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({input: {text}, voice: {languageCode: GOOGLE_LANG[language] ?? 'en-US', ...(cfg.google.voice ? {name: cfg.google.voice} : {})}, audioConfig: {audioEncoding: 'LINEAR16', sampleRateHertz: 48000}}),
			signal,
		});
		if (!res.ok) throw new Error(`Google TTS → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
		writeFileSync(outFile, Buffer.from((await res.json()).audioContent, 'base64'));
	} else {
		throw new Error(`Unknown TTS provider "${provider}"`);
	}
	if (!existsSync(outFile)) throw new Error(`${provider} produced no audio file`);
	return outFile;
};

// ─── Local LLM (Ollama) for script writing — optional ───────────────────────
export const detectOllama = async (cfg) => {
	if (cfg.provider !== 'ollama') return {available: false, reason: 'Script writer set to built-in templates'};
	try {
		const res = await fetch(`${cfg.ollama_url.replace(/\/$/, '')}/api/tags`, {signal: AbortSignal.timeout(3000)});
		const tags = await res.json();
		const has = (tags.models ?? []).some((m) => m.name === cfg.model || m.name.startsWith(`${cfg.model}:`));
		return has ? {available: true, reason: `Ollama model ${cfg.model}`} : {available: false, reason: `Model "${cfg.model}" not pulled in Ollama (run: ollama pull ${cfg.model})`};
	} catch (e) {
		return {available: false, reason: `Ollama not reachable at ${cfg.ollama_url} (${netReason(e)})`};
	}
};

export const ollamaJson = async (cfg, prompt, signal) => {
	const res = await fetch(`${cfg.ollama_url.replace(/\/$/, '')}/api/generate`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({model: cfg.model, prompt, format: 'json', stream: false, options: {temperature: 0.7}}), signal});
	if (!res.ok) throw new Error(`Ollama → HTTP ${res.status}`);
	return JSON.parse((await res.json()).response);
};
