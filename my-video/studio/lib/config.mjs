// Studio configuration (studio-data/config.json), seeded from environment variables.
// Free-first: every paid/cloud integration is disabled and needs explicit consent.
import path from 'node:path';
import {DATA_DIR, readJson, writeJsonAtomic} from './store.mjs';

const FILE = path.join(DATA_DIR, 'config.json');
const env = process.env;

export const DEFAULT_CONFIG = () => ({
	comfyui: {
		enabled: env.COMFYUI_ENABLED !== 'false',
		url: env.COMFYUI_URL || 'http://127.0.0.1:8188',
		timeout_minutes: 60,
		image: {checkpoint: env.COMFYUI_IMAGE_CHECKPOINT || '', width: 1344, height: 768, steps: 28, cfg: 6, sampler: 'dpmpp_2m', scheduler: 'karras', reference_denoise: 0.62},
		wan22: {
			enabled: true,
			// ti2v_5b: one 5B model (text OR image → video, 24 fps, fits ~8 GB with offload)
			// a14b: two-stage 14B MoE (high-noise + low-noise experts, 16 fps, 24 GB+ class)
			variant: env.WAN22_VARIANT || 'ti2v_5b',
			unet: env.WAN22_UNET || 'wan2.2_ti2v_5B_fp16.safetensors',
			unet_high_noise: env.WAN22_UNET_HIGH || 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors',
			unet_low_noise: env.WAN22_UNET_LOW || 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors',
			t2v_unet_high_noise: env.WAN22_T2V_UNET_HIGH || 'wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors',
			t2v_unet_low_noise: env.WAN22_T2V_UNET_LOW || 'wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors',
			text_encoder: env.WAN22_TEXT_ENCODER || 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
			vae: env.WAN22_VAE || 'wan2.2_vae.safetensors',
			vae_14b: 'wan_2.1_vae.safetensors',
			width: 1280,
			height: 704,
			steps: 30,
			cfg: 5,
			shift: 8,
			max_seconds: 5,
		},
		ltx: {
			enabled: true,
			checkpoint: env.LTX_CHECKPOINT || 'ltx-video-2b-v0.9.5.safetensors',
			text_encoder: env.LTX_TEXT_ENCODER || 't5xxl_fp16.safetensors',
			width: 768,
			height: 512,
			fps: 24,
			steps: 30,
			cfg: 3,
			max_seconds: 5,
		},
	},
	a1111: {enabled: env.A1111_ENABLED === 'true', url: env.A1111_URL || 'http://127.0.0.1:7860', steps: 28, cfg: 6, sampler: 'DPM++ 2M', width: 1344, height: 768},
	wan_cli: {
		enabled: false,
		repo_path: env.WAN22_REPO || '',
		python: 'python',
		// Official Wan2.2 repo (github.com/Wan-Video/Wan2.2) generate.py. Verify flags against your checkout.
		command: '{python} generate.py --task ti2v-5B --size 1280*704 --ckpt_dir {ckpt_dir} --offload_model True --convert_model_dtype --t5_cpu --base_seed {seed} --prompt {prompt} {image_arg} --save_file {out}',
		ckpt_dir: env.WAN22_CKPT_DIR || './Wan2.2-TI2V-5B',
		fps: 24,
		max_seconds: 5,
	},
	ltx_cli: {
		enabled: false,
		repo_path: env.LTX_REPO || '',
		python: 'python',
		// Official LTX-Video repo (github.com/Lightricks/LTX-Video) inference.py. Verify flags against your checkout.
		command: '{python} inference.py --prompt {prompt} {image_arg} --height {height} --width {width} --num_frames {frames} --seed {seed} --pipeline_config {pipeline_config} --output_path {out_dir}',
		pipeline_config: 'configs/ltxv-2b-0.9.8-distilled.yaml',
		fps: 24,
		max_seconds: 5,
	},
	blender: {enabled: true, path: env.BLENDER_PATH || '', engine: env.BLENDER_ENGINE || 'CYCLES', samples: 24, timeout_minutes: 60},
	tts: {
		provider: env.TTS_PROVIDER || 'auto', // auto | piper | espeak | google | none
		piper: {binary: env.PIPER_BINARY || 'piper', model: env.PIPER_MODEL || ''},
		espeak: {binary: 'espeak-ng', speed: 155},
		// Paid cloud API: used only when enabled AND consent is given AND GOOGLE_TTS_API_KEY is set.
		google: {enabled: false, consent_paid_api: false, voice: ''},
	},
	llm: {provider: env.LLM_PROVIDER || 'template', ollama_url: env.OLLAMA_URL || 'http://127.0.0.1:11434', model: env.OLLAMA_MODEL || 'llama3.1'},
	render: {concurrency: Number(env.RENDER_CONCURRENCY) || null, gl: env.RENDER_GL || 'angle'},
	hardware: {gpu_vram_gb_override: null},
});

const merge = (base, over) => {
	if (!over || typeof over !== 'object' || Array.isArray(over)) return base;
	const out = {...base};
	for (const k of Object.keys(base)) {
		if (!(k in over)) continue;
		const b = base[k];
		const o = over[k];
		out[k] = b && typeof b === 'object' && !Array.isArray(b) ? merge(b, o) : typeof o === typeof b || b === null || o === null ? o : b;
	}
	return out;
};

export const loadConfig = () => merge(DEFAULT_CONFIG(), readJson(FILE, {}));
/** Only known keys with the right types are kept — unknown input is dropped. */
export const saveConfig = (patch) => {
	const next = merge(loadConfig(), patch);
	writeJsonAtomic(FILE, next);
	return next;
};
