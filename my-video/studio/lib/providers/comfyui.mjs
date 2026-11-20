// ComfyUI adapter (github.com/comfyanonymous/ComfyUI, documented HTTP API):
//   GET  /system_stats            → version + devices
//   GET  /object_info/{Node}      → is a node type installed?
//   GET  /models/{folder}         → model files present (we NEVER download weights)
//   POST /upload/image            → reference / start images
//   POST /prompt                  → queue an API-format workflow
//   GET  /history/{id}, /queue    → status;  GET /view → fetch outputs;  POST /interrupt
//
// Workflows use only core nodes (verified against comfy_extras/nodes_wan.py,
// nodes_lt.py, nodes_hunyuan.py, nodes_custom_sampler.py). Outputs are saved as PNG
// frames with SaveImage and assembled to MP4 by FFmpeg here.
import {randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

/** Turn undici's nested network errors into something a person can act on. */
export const netReason = (e) => (e?.name === 'TimeoutError' ? 'timeout' : e?.cause?.code ?? e?.cause?.errors?.find((x) => x.code)?.code ?? e?.cause?.message ?? e?.message ?? String(e));

const j = async (url, init = {}, timeoutMs = 8000) => {
	const res = await fetch(url, {...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs)});
	const text = await res.text();
	if (!res.ok) throw new Error(`ComfyUI ${init.method || 'GET'} ${new URL(url).pathname} → HTTP ${res.status}: ${text.slice(0, 600)}`);
	return text ? JSON.parse(text) : null;
};

const NODES = {
	image: ['CheckpointLoaderSimple', 'CLIPTextEncode', 'KSampler', 'EmptyLatentImage', 'VAEDecode', 'VAEEncode', 'SaveImage', 'LoadImage'],
	wan22_5b: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'ModelSamplingSD3', 'Wan22ImageToVideoLatent', 'KSampler'],
	wan22_14b: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'ModelSamplingSD3', 'WanImageToVideo', 'EmptyHunyuanLatentVideo', 'KSamplerAdvanced'],
	ltx: ['CheckpointLoaderSimple', 'CLIPLoader', 'LTXVConditioning', 'EmptyLTXVLatentVideo', 'LTXVImgToVideo', 'LTXVScheduler', 'SamplerCustomAdvanced', 'CFGGuider', 'RandomNoise', 'KSamplerSelect'],
};

/** Probe a ComfyUI server; returns availability per capability with concrete reasons. */
export const detectComfy = async (cfg) => {
	const base = cfg.url.replace(/\/$/, '');
	const out = {id: 'comfyui', name: 'ComfyUI', url: base, reachable: false, version: null, devices: [], capabilities: {}, models: {}, errors: []};
	if (!cfg.enabled) {
		out.errors.push('Disabled in settings.');
		return out;
	}
	try {
		const stats = await j(`${base}/system_stats`, {}, 4000);
		out.reachable = true;
		out.version = stats?.system?.comfyui_version ?? null;
		out.devices = (stats?.devices ?? []).map((d) => ({name: d.name, type: d.type, vram_gb: d.vram_total ? +(d.vram_total / 1073741824).toFixed(1) : null}));
	} catch (e) {
		out.errors.push(`Not reachable at ${base} (${netReason(e)}). Start ComfyUI (python main.py --listen) or fix the URL.`);
		return out;
	}
	const have = {};
	const allNodes = [...new Set(Object.values(NODES).flat())];
	await Promise.all(
		allNodes.map(async (n) => {
			try {
				const info = await j(`${base}/object_info/${n}`, {}, 6000);
				have[n] = Boolean(info && info[n]);
			} catch {
				have[n] = false;
			}
		}),
	);
	for (const folder of ['checkpoints', 'diffusion_models', 'text_encoders', 'vae', 'clip']) {
		try {
			out.models[folder] = await j(`${base}/models/${folder}`, {}, 6000);
		} catch {
			out.models[folder] = [];
		}
	}
	const inFolder = (file, ...folders) => folders.some((f) => (out.models[f] ?? []).includes(file));
	const missingNodes = (k) => NODES[k].filter((n) => !have[n]);
	const cap = (ok, reason, extra = {}) => ({available: ok, reason, ...extra});

	// Image
	{
		const mn = missingNodes('image');
		const ck = cfg.image.checkpoint;
		out.capabilities.image = mn.length
			? cap(false, `Missing nodes: ${mn.join(', ')}`)
			: !ck
				? cap(false, `No image checkpoint configured. Installed checkpoints: ${(out.models.checkpoints ?? []).slice(0, 8).join(', ') || 'none'}`)
				: !inFolder(ck, 'checkpoints')
					? cap(false, `Checkpoint "${ck}" not found in ComfyUI/models/checkpoints`)
					: cap(true, `Checkpoint ${ck}`, {reference: 'img2img from character reference'});
	}
	// Wan 2.2
	{
		const w = cfg.wan22;
		const is5b = w.variant === 'ti2v_5b';
		const mn = missingNodes(is5b ? 'wan22_5b' : 'wan22_14b');
		const need = is5b
			? [[w.unet, 'diffusion_models'], [w.text_encoder, 'text_encoders', 'clip'], [w.vae, 'vae']]
			: [[w.unet_high_noise, 'diffusion_models'], [w.unet_low_noise, 'diffusion_models'], [w.text_encoder, 'text_encoders', 'clip'], [w.vae_14b, 'vae']];
		const missing = need.filter(([f, ...folders]) => !inFolder(f, ...folders)).map(([f]) => f);
		const t2vMissing = !is5b && ![w.t2v_unet_high_noise, w.t2v_unet_low_noise].every((f) => inFolder(f, 'diffusion_models'));
		out.capabilities.wan22 = !w.enabled
			? cap(false, 'Disabled in settings')
			: mn.length
				? cap(false, `ComfyUI is missing nodes ${mn.join(', ')} — update ComfyUI`)
				: missing.length
					? cap(false, `Model files not installed: ${missing.join(', ')} (download manually from the official Wan 2.2 ComfyUI release; the studio never downloads weights)`)
					: cap(true, is5b ? 'Wan 2.2 TI2V-5B' : 'Wan 2.2 14B (two-expert)', {t2v: is5b || !t2vMissing, i2v: true, max_seconds: w.max_seconds, fps: is5b ? 24 : 16});
	}
	// LTX-Video
	{
		const l = cfg.ltx;
		const mn = missingNodes('ltx');
		const missing = [[l.checkpoint, 'checkpoints'], [l.text_encoder, 'text_encoders', 'clip']].filter(([f, ...folders]) => !inFolder(f, ...folders)).map(([f]) => f);
		out.capabilities.ltx = !l.enabled
			? cap(false, 'Disabled in settings')
			: mn.length
				? cap(false, `ComfyUI is missing nodes ${mn.join(', ')}`)
				: missing.length
					? cap(false, `Model files not installed: ${missing.join(', ')}`)
					: cap(true, `LTX-Video ${l.checkpoint}`, {t2v: true, i2v: true, max_seconds: l.max_seconds, fps: l.fps});
	}
	return out;
};

// ─── Workflow builders (API format) ─────────────────────────────────────────

let nid = 0;
const graph = () => {
	nid = 0;
	const g = {};
	const add = (class_type, inputs) => {
		const id = String(++nid);
		g[id] = {class_type, inputs};
		return id;
	};
	return {g, add};
};

export const imageWorkflow = (cfg, {prompt, negative, seed, width, height, reference}) => {
	const {g, add} = graph();
	const ck = add('CheckpointLoaderSimple', {ckpt_name: cfg.image.checkpoint});
	const pos = add('CLIPTextEncode', {text: prompt, clip: [ck, 1]});
	const neg = add('CLIPTextEncode', {text: negative, clip: [ck, 1]});
	let latent;
	let denoise = 1;
	if (reference) {
		const img = add('LoadImage', {image: reference});
		const scaled = add('ImageScale', {image: [img, 0], upscale_method: 'lanczos', width, height, crop: 'center'});
		latent = add('VAEEncode', {pixels: [scaled, 0], vae: [ck, 2]});
		denoise = cfg.image.reference_denoise;
	} else {
		latent = add('EmptyLatentImage', {width, height, batch_size: 1});
	}
	const ks = add('KSampler', {seed, steps: cfg.image.steps, cfg: cfg.image.cfg, sampler_name: cfg.image.sampler, scheduler: cfg.image.scheduler, denoise, model: [ck, 0], positive: [pos, 0], negative: [neg, 0], latent_image: [latent, 0]});
	const dec = add('VAEDecode', {samples: [ks, 0], vae: [ck, 2]});
	add('SaveImage', {images: [dec, 0], filename_prefix: 'cinematic_studio/img'});
	return g;
};

const frameCount = (seconds, fps, step) => Math.max(step + 1, Math.round((seconds * fps) / step) * step + 1);

export const wan22Workflow = (cfg, {prompt, negative, seed, seconds, startImage}) => {
	const w = cfg.wan22;
	const {g, add} = graph();
	const clip = add('CLIPLoader', {clip_name: w.text_encoder, type: 'wan', device: 'default'});
	const pos = add('CLIPTextEncode', {text: prompt, clip: [clip, 0]});
	const neg = add('CLIPTextEncode', {text: negative, clip: [clip, 0]});
	const start = startImage ? add('LoadImage', {image: startImage}) : null;
	let images;
	let fps;
	if (w.variant === 'ti2v_5b') {
		fps = 24;
		const vae = add('VAELoader', {vae_name: w.vae});
		const unet = add('UNETLoader', {unet_name: w.unet, weight_dtype: 'default'});
		const model = add('ModelSamplingSD3', {model: [unet, 0], shift: w.shift});
		const latent = add('Wan22ImageToVideoLatent', {vae: [vae, 0], width: w.width, height: w.height, length: frameCount(seconds, fps, 4), batch_size: 1, ...(start ? {start_image: [start, 0]} : {})});
		const ks = add('KSampler', {seed, steps: w.steps, cfg: w.cfg, sampler_name: 'uni_pc', scheduler: 'simple', denoise: 1, model: [model, 0], positive: [pos, 0], negative: [neg, 0], latent_image: [latent, 0]});
		images = add('VAEDecode', {samples: [ks, 0], vae: [vae, 0]});
	} else {
		fps = 16;
		const vae = add('VAELoader', {vae_name: w.vae_14b});
		const hi = add('UNETLoader', {unet_name: start ? w.unet_high_noise : w.t2v_unet_high_noise, weight_dtype: 'default'});
		const lo = add('UNETLoader', {unet_name: start ? w.unet_low_noise : w.t2v_unet_low_noise, weight_dtype: 'default'});
		const mhi = add('ModelSamplingSD3', {model: [hi, 0], shift: w.shift});
		const mlo = add('ModelSamplingSD3', {model: [lo, 0], shift: w.shift});
		const length = frameCount(seconds, fps, 4);
		let posC = [pos, 0];
		let negC = [neg, 0];
		let latent;
		if (start) {
			const i2v = add('WanImageToVideo', {positive: [pos, 0], negative: [neg, 0], vae: [vae, 0], width: w.width, height: w.height, length, batch_size: 1, start_image: [start, 0]});
			posC = [i2v, 0];
			negC = [i2v, 1];
			latent = [i2v, 2];
		} else {
			latent = [add('EmptyHunyuanLatentVideo', {width: w.width, height: w.height, length, batch_size: 1}), 0];
		}
		const steps = Math.max(4, w.steps);
		const half = Math.floor(steps / 2);
		const k1 = add('KSamplerAdvanced', {model: [mhi, 0], add_noise: 'enable', noise_seed: seed, steps, cfg: 3.5, sampler_name: 'euler', scheduler: 'simple', positive: posC, negative: negC, latent_image: latent, start_at_step: 0, end_at_step: half, return_with_leftover_noise: 'enable'});
		const k2 = add('KSamplerAdvanced', {model: [mlo, 0], add_noise: 'disable', noise_seed: seed, steps, cfg: 3.5, sampler_name: 'euler', scheduler: 'simple', positive: posC, negative: negC, latent_image: [k1, 0], start_at_step: half, end_at_step: 10000, return_with_leftover_noise: 'disable'});
		images = add('VAEDecode', {samples: [k2, 0], vae: [vae, 0]});
	}
	add('SaveImage', {images: [images, 0], filename_prefix: 'cinematic_studio/wan22'});
	return {workflow: g, fps};
};

export const ltxWorkflow = (cfg, {prompt, negative, seed, seconds, startImage}) => {
	const l = cfg.ltx;
	const {g, add} = graph();
	const ck = add('CheckpointLoaderSimple', {ckpt_name: l.checkpoint});
	const clip = add('CLIPLoader', {clip_name: l.text_encoder, type: 'ltxv', device: 'default'});
	const pos = add('CLIPTextEncode', {text: prompt, clip: [clip, 0]});
	const neg = add('CLIPTextEncode', {text: negative, clip: [clip, 0]});
	const length = frameCount(seconds, l.fps, 8);
	let posC = [pos, 0];
	let negC = [neg, 0];
	let latent;
	if (startImage) {
		const img = add('LoadImage', {image: startImage});
		const i2v = add('LTXVImgToVideo', {positive: [pos, 0], negative: [neg, 0], vae: [ck, 2], image: [img, 0], width: l.width, height: l.height, length, batch_size: 1, strength: 1});
		posC = [i2v, 0];
		negC = [i2v, 1];
		latent = [i2v, 2];
	} else {
		latent = [add('EmptyLTXVLatentVideo', {width: l.width, height: l.height, length, batch_size: 1}), 0];
	}
	const cond = add('LTXVConditioning', {positive: posC, negative: negC, frame_rate: l.fps});
	const sched = add('LTXVScheduler', {steps: l.steps, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent});
	const noise = add('RandomNoise', {noise_seed: seed});
	const guider = add('CFGGuider', {model: [ck, 0], positive: [cond, 0], negative: [cond, 1], cfg: l.cfg});
	const sampler = add('KSamplerSelect', {sampler_name: 'euler'});
	const sca = add('SamplerCustomAdvanced', {noise: [noise, 0], guider: [guider, 0], sampler: [sampler, 0], sigmas: [sched, 0], latent_image: latent});
	const dec = add('VAEDecode', {samples: [sca, 0], vae: [ck, 2]});
	add('SaveImage', {images: [dec, 0], filename_prefix: 'cinematic_studio/ltx'});
	return {workflow: g, fps: l.fps};
};

// ─── Execution ──────────────────────────────────────────────────────────────

export const uploadImage = async (cfg, file) => {
	const form = new FormData();
	form.append('image', new Blob([readFileSync(file)]), `cs_${Date.now()}_${path.basename(file)}`);
	form.append('overwrite', 'true');
	const r = await j(`${cfg.url.replace(/\/$/, '')}/upload/image`, {method: 'POST', body: form}, 60000);
	return r.subfolder ? `${r.subfolder}/${r.name}` : r.name;
};

/**
 * Queue a workflow and wait for its output images. Writes them to outDir and returns
 * their paths in order. Honors `signal` (interrupts ComfyUI). Reports via `log`.
 */
export const runWorkflow = async (cfg, workflow, {outDir, signal, log}) => {
	const base = cfg.url.replace(/\/$/, '');
	const clientId = randomUUID();
	const res = await fetch(`${base}/prompt`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({prompt: workflow, client_id: clientId}), signal: AbortSignal.timeout(30000)});
	const queued = await res.json().catch(() => ({}));
	const nodeErrors = Object.values(queued.node_errors ?? {}).flatMap((n) => n.errors.map((e) => `${n.class_type}: ${e.details || e.message}`));
	if (!res.ok || nodeErrors.length) {
		const missing = nodeErrors.filter((m) => /not in \[/.test(m));
		throw new Error(`ComfyUI rejected the workflow${missing.length ? ' — model file(s) not installed in ComfyUI' : ''}:\n- ${(nodeErrors.length ? nodeErrors : [queued.error?.message ?? `HTTP ${res.status}`]).join('\n- ')}`);
	}
	const id = queued.prompt_id;
	log(`Queued in ComfyUI as ${id}`);
	const deadline = Date.now() + cfg.timeout_minutes * 60000;
	let lastNote = '';
	while (true) {
		if (signal?.aborted) {
			await fetch(`${base}/interrupt`, {method: 'POST'}).catch(() => {});
			await fetch(`${base}/queue`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({delete: [id]})}).catch(() => {});
			throw new Error('Cancelled — ComfyUI job interrupted.');
		}
		if (Date.now() > deadline) throw new Error(`Timed out after ${cfg.timeout_minutes} min waiting for ComfyUI.`);
		const hist = await j(`${base}/history/${id}`, {}, 15000).catch(() => null);
		const entry = hist?.[id];
		if (entry) {
			const st = entry.status;
			if (st?.status_str === 'error') {
				const msg = st.messages?.find((m) => m[0] === 'execution_error')?.[1];
				throw new Error(`ComfyUI execution error${msg ? ` in ${msg.node_type}: ${msg.exception_message}` : ''}`);
			}
			if (st?.completed || entry.outputs) {
				const imgs = Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? []);
				if (!imgs.length) throw new Error('ComfyUI finished but produced no images.');
				mkdirSync(outDir, {recursive: true});
				const files = [];
				for (const [i, im] of imgs.entries()) {
					const q = new URLSearchParams({filename: im.filename, subfolder: im.subfolder ?? '', type: im.type ?? 'output'});
					const res = await fetch(`${base}/view?${q}`);
					if (!res.ok) throw new Error(`Could not download output ${im.filename}: HTTP ${res.status}`);
					const f = path.join(outDir, `frame_${String(i).padStart(5, '0')}.png`);
					writeFileSync(f, Buffer.from(await res.arrayBuffer()));
					files.push(f);
				}
				log(`Downloaded ${files.length} output image(s) from ComfyUI`);
				return files;
			}
		} else {
			const q = await j(`${base}/queue`, {}, 8000).catch(() => null);
			const pending = q?.queue_pending?.findIndex((x) => x[1] === id) ?? -1;
			const running = q?.queue_running?.some((x) => x[1] === id);
			const note = running ? 'running in ComfyUI' : pending >= 0 ? `waiting in ComfyUI queue (position ${pending + 1})` : 'submitted';
			if (note !== lastNote) log(note);
			lastNote = note;
		}
		await new Promise((r) => setTimeout(r, 2000));
	}
};
