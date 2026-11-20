# AI providers

The studio is **free-first**: it never needs an AI provider, never downloads model
weights, and never calls a paid API unless you enable it *and* give explicit consent.
When no provider is available, scenes are produced by the procedural 3D engine or from
your own imported footage. A scene that you lock to an AI method while no provider is
available is reported as **blocked** — it is not silently replaced, and a render of it
fails with a clear message instead of showing placeholder footage.

Open **AI Model Manager** in the app to see live detection for every provider, with the
concrete reason when something is unavailable.

## What runs where

| Provider | Kind | Runs | Cost | Typical hardware |
| --- | --- | --- | --- | --- |
| Procedural 3D (built in) | 3D scenes | this machine (WebGL) | free | any CPU; GPU makes it much faster |
| Blender (optional) | 3D scenes | this machine | free | any CPU; GPU for EEVEE |
| ComfyUI · image checkpoint | AI image | your ComfyUI server | free | 6–8 GB VRAM (SD 1.5 / SDXL) |
| ComfyUI · Wan 2.2 TI2V-5B | AI video (text or image → video) | your ComfyUI server | free | ~8–12 GB VRAM with offloading |
| ComfyUI · Wan 2.2 14B (two experts) | AI video | your ComfyUI server | free | 24 GB+ VRAM class |
| ComfyUI · LTX-Video | AI video | your ComfyUI server | free | ~8–12 GB VRAM |
| AUTOMATIC1111 / Forge | AI image | your WebUI server | free | 6–8 GB VRAM |
| Wan 2.2 / LTX-Video official repos | AI video via CLI | this machine | free | as above |
| Piper / eSpeak NG | Speech | this machine | free | CPU |
| Ollama | Script writing | your Ollama server | free | CPU or GPU |
| Google Cloud TTS | Speech | Google | **paid** | — (opt-in only) |

The ComfyUI server can run on another computer (e.g. a desktop with a GPU) — set its URL
in the AI Model Manager. Remember to start ComfyUI with `--listen` for remote access.

## ComfyUI (recommended)

Official repository: <https://github.com/comfyanonymous/ComfyUI>. The studio uses the
documented HTTP API:

| Endpoint | Use |
| --- | --- |
| `GET /system_stats` | reachability, version, devices / VRAM |
| `GET /object_info/<Node>` | verifies each node type a workflow needs |
| `GET /models/<folder>` | verifies each configured model file exists |
| `POST /upload/image` | reference and start images |
| `POST /prompt` | queues an API-format workflow |
| `GET /history/<id>`, `GET /queue` | status and queue position |
| `GET /view` | downloads output frames |
| `POST /interrupt` | cancel |

Workflows use **core nodes only** (checked against `comfy_extras/nodes_wan.py`,
`nodes_lt.py`, `nodes_hunyuan.py`, `nodes_custom_sampler.py` of the local checkout).
Outputs are saved as PNG frames and assembled into MP4 by FFmpeg.

### Image checkpoint

Put any checkpoint in `ComfyUI/models/checkpoints/` and enter its exact filename.
Graph: `CheckpointLoaderSimple → CLIPTextEncode ×2 → EmptyLatentImage | (LoadImage →
ImageScale → VAEEncode) → KSampler → VAEDecode → SaveImage`. When a scene's character
has a reference image, it is used as the img2img source (denoise configurable), which
keeps faces/costumes consistent across scenes.

### Wan 2.2

Install the files from the official Wan 2.2 ComfyUI release (Comfy-Org repackaged
weights) into the folders below and enter the filenames:

| Variant | Files |
| --- | --- |
| TI2V-5B (default) | `diffusion_models/wan2.2_ti2v_5B_fp16.safetensors`, `text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`, `vae/wan2.2_vae.safetensors` |
| 14B image→video | `diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors`, `…_i2v_low_noise_14B_fp8_scaled.safetensors`, text encoder as above, `vae/wan_2.1_vae.safetensors` |
| 14B text→video | `…_t2v_high_noise_14B_fp8_scaled.safetensors`, `…_t2v_low_noise_14B_fp8_scaled.safetensors` |

* 5B graph: `UNETLoader → ModelSamplingSD3(shift 8)`, `CLIPLoader(type wan)`,
  `Wan22ImageToVideoLatent` (optional start image), `KSampler(uni_pc/simple)`, 24 fps.
* 14B graph: two `UNETLoader`s, `WanImageToVideo` (i2v) or `EmptyHunyuanLatentVideo`
  (t2v), two chained `KSamplerAdvanced` (high-noise expert for the first half of the
  steps, low-noise expert for the rest), 16 fps.
* Frame counts respect the node constraint (4·k + 1).

### LTX-Video

`checkpoints/ltx-video-2b-v0.9.5.safetensors` (or another LTXV checkpoint) and
`text_encoders/t5xxl_fp16.safetensors`. Graph: `CheckpointLoaderSimple`,
`CLIPLoader(type ltxv)`, `EmptyLTXVLatentVideo` or `LTXVImgToVideo`,
`LTXVConditioning`, `LTXVScheduler`, `RandomNoise`, `CFGGuider`, `KSamplerSelect`,
`SamplerCustomAdvanced`, 24 fps, frame counts 8·k + 1.

### Clip length

Video models produce short clips (default limit 5 s, configurable). The router only
picks AI video for scenes that fit; when a returned clip is shorter than its scene,
the last frame is held (never looped or padded with other footage), and the log says so.

### Continuity

If a scene has `continuity_from` set and the previous scene has an AI video clip, the
last frame of that clip becomes the start image of the next generation.

## AUTOMATIC1111 / Forge

Start the WebUI with `--api`, enable it in the AI Model Manager and set the URL. Uses
`/sdapi/v1/txt2img` and `/sdapi/v1/img2img` (character reference).

## Official repositories (CLI)

For people who run the reference implementations directly:

* Wan 2.2 — <https://github.com/Wan-Video/Wan2.2> (`generate.py`)
* LTX-Video — <https://github.com/Lightricks/LTX-Video> (`inference.py`)

Set the checkout path and Python interpreter. The command is a template with
placeholders (`{python} {prompt} {image_arg} {seed} {out} {out_dir} {width} {height}
{frames} {ckpt_dir} {pipeline_config}`). Defaults follow each project's README; **check
them against the version you cloned**, since CLI flags change between releases.

## Speech

* **Piper** (<https://github.com/rhasspy/piper>) — natural local voices; set the binary
  and an `.onnx` voice model.
* **eSpeak NG** — always-available fallback, robotic but free and offline.
* **Google Cloud TTS** — paid. Requires enabling the adapter, ticking the consent box and
  setting `GOOGLE_TTS_API_KEY` in the server environment. The key is never stored in the
  project or shown to the browser.
* Or import recorded narration per scene in the Audio Studio.

The studio never reports a voice-over that does not exist: TTS jobs fail with the
provider's error, and exports without narration say so in their report.

## Script writer (optional)

Ollama (<https://ollama.com>) with any local model (`ollama pull llama3.1`). Without it,
the built-in template writer produces a clearly labelled draft for you to edit.

## Testing a provider

* AI Model Manager → **Test connection** (ComfyUI) shows latency, version and, per
  capability, exactly which node or model file is missing.
* `POST /api/providers/test` re-runs every detector.
* `npm run studio:test` includes a test that an unreachable provider yields an
  actionable message.
