# Installing Cinematic AI Studio

Everything below is free. Only Node.js and FFmpeg are required; every AI provider,
Blender and TTS engine is optional and detected at runtime.

## 1. Requirements

| Need | Version | Notes |
| --- | --- | --- |
| Node.js | **22.18+** (or 24) | the studio server runs TypeScript files directly (type stripping) |
| FFmpeg + ffprobe | 6+ | on `PATH`; used for joins, mixing, loudness and encoding |
| Chrome/Chromium | — | Remotion downloads its own headless shell on first render if none is found |
| Disk | ~2 GB | dependencies + renders |

macOS: `brew install node ffmpeg` · Ubuntu/Debian: `sudo apt install ffmpeg` and Node from
nodejs.org or nvm · Windows: install Node and FFmpeg, add FFmpeg to `PATH` (WSL2 recommended).

## 2. Install

```bash
cd my-video
npm ci                      # installs Remotion, Three.js, R3F, drei, postprocessing (pinned)
cp .env.example .env        # optional — every value has a sensible default
npm run studio              # → http://127.0.0.1:4555
```

Open the URL, then **Dashboard → Create sample project** (a 4-scene “Eternal Rome”
production with characters and a procedural score) or **New Project**.

Remotion Studio (the existing compositions + the new `Cinematic-Studio` folder) still
works as before: `npm run dev`.

## 3. Use it from an iPhone

```bash
STUDIO_HOST=0.0.0.0 STUDIO_TOKEN=pick-a-secret npm run studio
```

On the phone (same Wi-Fi) open `http://<computer-ip>:4555/?token=pick-a-secret`, then
Share → *Add to Home Screen*. The token is remembered by the browser. Rendering happens on
the computer; the phone is the control surface (videos stream with HTTP Range support,
which iOS Safari requires).

## 4. Optional providers

All optional — see [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md) for details and VRAM guidance.

* **ComfyUI** (AI images, Wan 2.2, LTX-Video): install from
  <https://github.com/comfyanonymous/ComfyUI>, put the model files in its `models/`
  folders yourself, start it (`python main.py --listen` if it runs on another computer),
  then enter the URL and exact filenames in **AI Model Manager** and press *Test connection*.
* **Blender** 4.x: install from blender.org (or your package manager). Detected automatically;
  set the path in AI Model Manager if it is not on `PATH`. Cycles on CPU works headless.
* **Local speech**: Piper (<https://github.com/rhasspy/piper>, natural voices — set the binary and
  `.onnx` voice in Settings) or eSpeak NG (`apt install espeak-ng`, `brew install espeak-ng`).
* **Local script writer**: Ollama (<https://ollama.com>), `ollama pull llama3.1`, then choose
  *Local LLM via Ollama* in Settings.
* **Google Cloud TTS (paid)**: set `GOOGLE_TTS_API_KEY` in `.env`, then enable the adapter
  *and* tick the consent box in Settings. Off by default.

## 5. Verify

```bash
npm run studio:test     # 19 unit tests: schema, router, storyboard, timing, ComfyUI graphs, queue
npm run lint            # existing ESLint + TypeScript check (now includes src/cinematic)
```

End-to-end check through the app: create the sample project → Render Manager → *Export
preview* → the MP4 appears in the Export Library with a loudness/stream report.

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Renders are slow | Without a GPU, WebGL runs on the CPU (~1–2 s per frame). Use previews while editing; keep render concurrency at 1. |
| `Could not render` / WebGL errors | Settings → Rendering → try the `swangle` backend. |
| Scene render fails “has no generated or imported asset” | That scene is set to an AI/Blender/import method that has not produced anything yet. Generate it, import a file, or switch it to procedural 3D. This is deliberate — nothing is faked. |
| ComfyUI “model file(s) not installed” | The named files are missing from ComfyUI's `models/` folders or the filename in AI Model Manager is different. |
| Phone gets “Studio token required” | Open the link with `?token=…`, or enter the token in Settings. |
| Node warns about `MODULE_TYPELESS_PACKAGE_JSON` | Harmless; the npm scripts silence it. |
