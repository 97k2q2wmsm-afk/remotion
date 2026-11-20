// Provider registry: runs every detector and condenses the results into the
// capability map the scene router uses. Results are cached briefly.
import {loadConfig} from '../config.mjs';
import {detectComfy} from './comfyui.mjs';
import {detectA1111, detectBlender, detectCliVideo, detectOllama, detectTts} from './others.mjs';

let cache = null;
let cacheAt = 0;

export const detectProviders = async ({refresh = false} = {}) => {
	if (cache && !refresh && Date.now() - cacheAt < 30000) return cache;
	const cfg = loadConfig();
	const [comfy, a1111, wanCli, ltxCli, blender, tts, llm] = await Promise.all([
		detectComfy(cfg.comfyui),
		detectA1111(cfg.a1111),
		detectCliVideo(cfg.wan_cli, 'wan'),
		detectCliVideo(cfg.ltx_cli, 'ltx'),
		detectBlender(cfg.blender),
		detectTts(cfg.tts),
		detectOllama(cfg.llm),
	]);
	const providers = [
		{id: 'comfyui-image', group: 'image', name: 'ComfyUI · image checkpoint', ...comfy.capabilities.image, available: Boolean(comfy.capabilities.image?.available), reason: comfy.reachable ? comfy.capabilities.image?.reason : comfy.errors[0]},
		{id: 'a1111', group: 'image', name: 'AUTOMATIC1111 / Forge', ...a1111},
		{id: 'comfyui-wan22', group: 'video', name: 'Wan 2.2 (ComfyUI)', ...comfy.capabilities.wan22, available: Boolean(comfy.capabilities.wan22?.available), reason: comfy.reachable ? comfy.capabilities.wan22?.reason : comfy.errors[0]},
		{id: 'comfyui-ltx', group: 'video', name: 'LTX-Video (ComfyUI)', ...comfy.capabilities.ltx, available: Boolean(comfy.capabilities.ltx?.available), reason: comfy.reachable ? comfy.capabilities.ltx?.reason : comfy.errors[0]},
		{id: 'wan-cli', group: 'video', name: 'Wan 2.2 (official repo CLI)', ...wanCli},
		{id: 'ltx-cli', group: 'video', name: 'LTX-Video (official repo CLI)', ...ltxCli},
		{id: 'procedural', group: '3d', name: 'Procedural 3D engine (Three.js)', available: true, reason: 'Built in — renders on CPU or GPU'},
		{id: 'blender', group: '3d', name: 'Blender (headless)', ...blender},
		{id: 'tts-piper', group: 'tts', name: 'Piper TTS (local)', ...tts.piper},
		{id: 'tts-espeak', group: 'tts', name: 'eSpeak NG (local)', ...tts.espeak},
		{id: 'tts-google', group: 'tts', name: 'Google Cloud TTS (paid, opt-in)', ...tts.google},
		{id: 'llm-ollama', group: 'llm', name: 'Ollama (local LLM script writer)', ...llm},
	];
	const pick = (ids) => providers.find((p) => ids.includes(p.id) && p.available) ?? null;
	const video = pick(['comfyui-wan22', 'comfyui-ltx', 'wan-cli', 'ltx-cli']);
	const image = pick(['comfyui-image', 'a1111']);
	cache = {
		comfy,
		providers,
		tts,
		capabilities: {
			video: video ? {available: true, provider: video.id, t2v: Boolean(video.t2v), i2v: Boolean(video.i2v), max_seconds: video.max_seconds ?? 5, fps: video.fps ?? 24} : {available: false, provider: null},
			image: image ? {available: true, provider: image.id} : {available: false, provider: null},
			blender: {available: Boolean(blender.available), binary: blender.binary ?? null},
			tts: {available: Boolean(tts.active), provider: tts.active},
			llm: {available: Boolean(llm.available)},
		},
		checked_at: new Date().toISOString(),
	};
	cacheAt = Date.now();
	return cache;
};
