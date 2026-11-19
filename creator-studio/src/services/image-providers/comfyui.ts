import type { ProviderConfig } from '@/types';
import { sleep } from '@/utils';

// Direct adapter for a user-hosted ComfyUI server, built only from core ComfyUI nodes.

interface ComfyReq {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  referenceImage?: Blob;
  referenceStrength?: number;
  signal?: AbortSignal;
}

async function comfyFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new Error('ComfyUI is not reachable from this device. Check the URL, HTTPS and --enable-cors-header.');
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`ComfyUI HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  return res;
}

export async function generateComfyImage(p: ProviderConfig, base: string, req: ComfyReq): Promise<Blob> {
  if (!p.model) throw new Error('Set the ComfyUI checkpoint file name in the provider settings.');
  const steps = Number(p.extra?.steps) || 25;
  const cfg = Number(p.extra?.cfg) || 6.5;
  const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31);
  const w = Math.round(req.width / 8) * 8;
  const h = Math.round(req.height / 8) * 8;
  const graph: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: p.model } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: req.prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: req.negativePrompt ?? '', clip: ['4', 1] } },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: 'euler_ancestral',
        scheduler: 'normal',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'creator_studio', images: ['8', 0] } },
  };
  if (req.referenceImage) {
    const form = new FormData();
    form.append('image', req.referenceImage, `cs_ref_${Date.now()}.png`);
    form.append('overwrite', 'true');
    const up = await (await comfyFetch(`${base}/upload/image`, { method: 'POST', body: form, signal: req.signal })).json();
    graph['10'] = { class_type: 'LoadImage', inputs: { image: up.name } };
    graph['11'] = { class_type: 'ImageScale', inputs: { upscale_method: 'lanczos', width: w, height: h, crop: 'center', image: ['10', 0] } };
    graph['12'] = { class_type: 'VAEEncode', inputs: { pixels: ['11', 0], vae: ['4', 2] } };
    graph['3'].inputs.latent_image = ['12', 0];
    graph['3'].inputs.denoise = req.referenceStrength !== undefined ? 1 - req.referenceStrength * 0.6 : Number(p.extra?.denoise) || 0.65;
  }
  const clientId = `creator-studio-${Math.random().toString(36).slice(2)}`;
  const queued = await (
    await comfyFetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: graph, client_id: clientId }),
      signal: req.signal,
    })
  ).json();
  if (queued.error) throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(queued.error).slice(0, 300)}`);
  const id: string = queued.prompt_id;
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    await sleep(1500, req.signal);
    const hist = await (await comfyFetch(`${base}/history/${id}`, { signal: req.signal })).json();
    const entry = hist[id];
    if (!entry) continue;
    if (entry.status?.status_str === 'error') throw new Error('ComfyUI reported an execution error. Check the ComfyUI console.');
    const img = entry.outputs?.['9']?.images?.[0];
    if (img) {
      const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'output' });
      return (await comfyFetch(`${base}/view?${q}`, { signal: req.signal })).blob();
    }
  }
  throw new Error('ComfyUI did not finish within 15 minutes.');
}

export async function testComfy(base: string, model?: string) {
  const stats = await (await comfyFetch(`${base}/system_stats`)).json();
  const info = await (await comfyFetch(`${base}/object_info/CheckpointLoaderSimple`)).json();
  const ckpts: string[] = info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
  const gpu = stats?.devices?.[0]?.name ?? 'unknown device';
  const found = model ? ckpts.includes(model) : false;
  return {
    ok: !model || found,
    message: `ComfyUI ${stats?.system?.comfyui_version ?? ''} on ${gpu}. ${ckpts.length} checkpoints. ${
      model ? (found ? `"${model}" found.` : `"${model}" NOT found. Available: ${ckpts.slice(0, 6).join(', ')}`) : `Available: ${ckpts.slice(0, 6).join(', ')}`
    }`,
  };
}
