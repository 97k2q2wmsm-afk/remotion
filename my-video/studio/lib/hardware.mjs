// Hardware detection. Honest about what this machine can do: a CPU-only box can
// render procedural 3D (software WebGL) but cannot run local video diffusion models.
import {execFile} from 'node:child_process';
import os from 'node:os';
import {promisify} from 'node:util';

const run = promisify(execFile);
const tryRun = async (cmd, args) => {
	try {
		const {stdout} = await run(cmd, args, {timeout: 5000});
		return stdout.trim();
	} catch {
		return null;
	}
};

let cache = null;
export const detectHardware = async (override = null) => {
	if (cache && !override) return cache;
	const gpus = [];
	const nv = await tryRun('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits']);
	if (nv) for (const line of nv.split('\n')) {
		const [name, mem, driver] = line.split(',').map((x) => x.trim());
		gpus.push({vendor: 'nvidia', name, vram_gb: Math.round(Number(mem) / 1024), driver});
	}
	const rocm = await tryRun('rocm-smi', ['--showproductname']);
	if (rocm && !gpus.length) gpus.push({vendor: 'amd', name: rocm.split('\n').find((l) => /Card series/i.test(l))?.split(':').pop()?.trim() || 'AMD GPU', vram_gb: null});
	if (process.platform === 'darwin') {
		const chip = await tryRun('sysctl', ['-n', 'machdep.cpu.brand_string']);
		if (chip && /Apple/.test(chip)) gpus.push({vendor: 'apple', name: chip, vram_gb: Math.round(os.totalmem() / 1073741824), unified_memory: true});
	}
	const vram = override ?? Math.max(0, ...gpus.map((g) => g.vram_gb ?? 0));
	const ramGb = Math.round(os.totalmem() / 1073741824);
	const tier = vram >= 24 ? 'high' : vram >= 12 ? 'mid' : vram >= 8 ? 'entry' : 'none';
	const recommendations = {
		high: 'Local AI video is realistic: Wan 2.2 14B (fp8) or LTX-Video via ComfyUI. Expect minutes per 5-second clip.',
		mid: 'Wan 2.2 TI2V-5B or LTX-Video 2B via ComfyUI should run (with offloading). AI images are fast.',
		entry: 'AI images (SD 1.5 / SDXL) are practical; video models need aggressive offloading and will be slow.',
		none: 'No usable GPU detected. Use the procedural 3D engine (runs on CPU) and imported assets, or connect ComfyUI on another machine.',
	};
	cache = {
		platform: `${os.type()} ${os.release()} (${process.arch})`,
		cpu: os.cpus()[0]?.model ?? 'unknown',
		cpu_cores: os.cpus().length,
		ram_gb: ramGb,
		gpus,
		vram_gb: vram,
		tier,
		recommendation: recommendations[tier],
		// Remotion renders WebGL via Chromium. Without a GPU that is SwiftShader on the CPU,
		// which already uses every core — parallel tabs only contend (measured: 1 tab ≈ 2× faster
		// than 3 on a 4-core box). With a GPU, a few tabs keep it busy.
		render_concurrency: tier === 'none' ? 1 : Math.max(1, Math.min(4, os.cpus().length - 1, Math.floor(ramGb / 4))),
	};
	return cache;
};
