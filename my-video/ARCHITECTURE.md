# Cinematic AI Studio — architecture

This document is the Phase 1 inspection report plus the design of the hybrid engine
that was built on top of the existing project.

## 1. What already existed (inspection, Nov 2026)

The workspace holds several repositories. The **user's own video project** is
`remotion/my-video` (the rest of `remotion/` is the upstream Remotion monorepo; ComfyUI,
FFmpeg and motion-canvas are upstream checkouts used as references).

| Area | Found in `my-video` before this work |
| --- | --- |
| Framework | Remotion **4.0.545** (React 19.3, TypeScript 5.9), rspack bundling via `remotion.config.ts` |
| Motion Canvas | `@motion-canvas/core` 3.17.2 used as an easing/tween library (`src/engine/modern/motion.ts`) — same version as the local motion-canvas checkout |
| FFmpeg | System FFmpeg 6.1 driven from Node scripts: `prepare.mjs` (voice clean-up, timeline), `bg-master.mjs` (side-chain ducking, loudnorm −14 LUFS, H.264 BT.709, soft subtitles, QC) |
| Engines | 2.5D SVG/CSS engines: `src/engine/*` (Camera, Character, Light, Particles, SceneShell, Captions) and `src/engine/modern/*` (City, Person, Fx) |
| Productions | Two channels/stories: *La Voz del Legado* — `Pompeya`; *Başına Gelseydi* — `Yercekimi` (+ cover) |
| Workflow | CLI only: `npm run bg:episode -- <id>` = voice → timeline → procedural score → Remotion render → FFmpeg master → cover → QC |
| UI | Remotion Studio only (no app UI) |
| 3D / AI | None. No Three.js, no AI providers; voice came from ElevenLabs by hand |

Everything above is **unchanged and still works** — the new engine registers its
compositions in an additional `Cinematic-Studio` folder in `src/Root.tsx`.

Environment constraints observed on the build machine: 4 CPU cores, 16 GB RAM,
**no GPU**, Chromium headless shell pre-installed. These shaped the defaults
(software WebGL, render concurrency 1, AI generation strictly optional).

## 2. System overview

```
                       ┌──────────────── studio/ui (vanilla JS, mobile-first) ────────────────┐
                       │ Dashboard · New · Storyboard · Characters · Scene Generator · 3D Env │
                       │ AI Models · Timeline · Audio · Render Manager · Exports · Settings   │
                       └───────────────────────────────┬──────────────────────────────────────┘
                                                       │ JSON / HTTP (+ Range-served media)
┌──────────────────────────────── studio/server.mjs (Node ≥ 22.18, no framework) ─────────────────────────────┐
│ store.mjs  projects on disk (atomic JSON)        jobs.mjs  queue: local lane + remote lane, pause/resume/…  │
│ storyboard.mjs  script (template | Ollama) → scenes      router.mjs  per-scene production method + reason   │
│ pipeline.mjs  generate_scene · render_scene · narration · export                                            │
│ providers/  comfyui (image, Wan 2.2, LTX) · a1111 · official repo CLIs · blender · tts · ollama             │
│ media.mjs   ffprobe · waveforms · procedural score/SFX · xfade concat · mix/duck/loudnorm · QC              │
└──────────────┬───────────────────────────────┬─────────────────────────────────┬───────────────────────────┘
               │ @remotion/renderer            │ HTTP                            │ child processes
   ┌───────────▼────────────┐      ┌───────────▼───────────┐          ┌──────────▼──────────┐
   │ src/cinematic (Remotion)│      │ ComfyUI / A1111 /      │          │ ffmpeg · blender ·  │
   │ Three.js engine via     │      │ Ollama (local servers) │          │ espeak-ng · piper · │
   │ @remotion/three         │      └────────────────────────┘          │ official Wan/LTX CLI│
   └─────────────────────────┘                                          └─────────────────────┘
```

### Single source of truth

`src/cinematic/schema.ts` defines every enumerable value once (formats, production
methods, environments, shots, moves, lighting, atmosphere, animations, sound effects,
transitions, styles, generation and job states) as `Record<id, {label…}>` tables, plus
the record types, defaults and a dependency-free validator. It is imported by the
Remotion bundle **and** by the Node server (Node strips TypeScript types natively), and
the UI receives the same tables from `GET /api/schema`. Adding an environment without an
implementation fails the typecheck (`ENV_DEFS: Record<EnvironmentId, EnvDef>`).

## 3. Engines

### A. Cinematic 3D engine — `src/cinematic/engine`

| File | Responsibility |
| --- | --- |
| `camera.ts` | Shot framing (aerial, wide, medium, close-up, low-angle, OTS) × movement (dolly, push-in, dolly-out, tracking, crane, flyover, orbit, handheld) × lens → pose. Handheld = layered smooth noise. Rack focus between foreground/subject/background. Motion Canvas easings. Terrain/bounds-aware. |
| `Lighting.tsx` | 7 presets + animated day→night. Sun with soft shadow map, coloured rim/back light, hemisphere bounce (GI approximation), procedural HDR environment from Lightformers (no downloads, memoised), gradient sky shader with sun disc/halo, stars, set-scaled exponential fog. |
| `environments.tsx` | 10 sets built from real geometry: forest, mountains (ridged terrain, snow line, lake), city skyline, medieval village (motte-and-bailey castle, palisade, market), ancient Rome (temple peristyle, Colosseum arcades, aqueduct, insulae), modern street, futuristic city (neon, holo rings, air traffic), battlefield (craters, armies, wrecks), interior (sunlit windows casting real window-shaped light), ocean coast (wave surface shared by floating boats, lighthouse). |
| `primitives.tsx` | Terrain, instancing, procedural textures (facades with emissive lit windows, ground detail, planks, smoke puffs), trees with wind sway, rocks, merged buildings with constant window scale, roofs, columns, crowds, cloth flags, birds, CPU Gerstner-style water. |
| `effects.tsx` | Rain, snow, dust, smoke, fire (with flickering real light), sparks, clouds, ground fog, volumetric light shafts, scheduled explosions (fireball, shock ring, debris, flash light, lingering smoke). Counts scale with quality. |
| `Character3D.tsx` | Consistent characters: rig, proportions and materials derived only from the character record; optional `.glb` reused per character. |
| `World.tsx` | Assembles a shot + post-processing: depth of field (world-space focus, rack focus), bloom, saturation/contrast grade, ACES tone mapping, vignette, grain. |

**Determinism.** Remotion renders frames out of order across tabs, so every animated
value is a pure function of `(seed, frame)` — no clocks, no `Math.random`.
`timing.ts` shares event times (explosions) between the renderer and the sound designer.

**Two render bugs found and fixed during testing:** the post-processing composer drew a
black first frame in every fresh WebGL context (now held with `delayRender` until it
settles), and terrain/IBL were being rebuilt every frame (inline props / drei
`Environment` children identity) — fixing that cut per-frame cost by ~35 %.

`CinematicScene.tsx` is the Remotion composition for one scene. It dispatches on the
production method and **throws** when an asset-based scene has no asset — the render
fails visibly instead of showing placeholder footage.

### B. Blender (optional) — `studio/blender/render_scene.py`

Headless `bpy` script fed the same scene JSON: displaced terrain, environment props,
sun + Nishita sky from the lighting preset, world volume fog, keyframed camera for the
same moves, Cycles (CPU) or EEVEE. Detects missing OpenImageDenoise. Tested with
Blender 4.0.2. The studio runs fine without Blender.

### C. AI generation — `studio/lib/providers`

See [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md). ComfyUI is the primary adapter (image
checkpoints, Wan 2.2 TI2V-5B and 14B two-expert, LTX-Video), using only core nodes
verified against the ComfyUI source. Alternatives: AUTOMATIC1111/Forge API, the official
Wan 2.2 / LTX-Video repositories via configurable CLI templates. Detection checks the
server, each required node type and each configured model file; nothing is downloaded.

### D. Composition — Remotion + Motion Canvas + FFmpeg

* **Remotion** renders each scene separately (`@remotion/renderer`, cached by a content
  hash of everything that changes pixels) and powers the Studio compositions.
* **Motion Canvas** supplies the easing curves for camera moves (shared with the
  existing 2.5D engine).
* **FFmpeg** joins scenes with `xfade` transitions, mixes narration + side-chain-ducked
  music + procedural SFX, normalises loudness (default −14 LUFS), encodes H.264 High /
  yuv420p / BT.709 with `+faststart`, adds a soft subtitle track and writes a QC report.

## 4. Storyboard, router, characters

* **Script**: built-in template writer (en/tr/es — explicitly labelled as an editable
  draft) or a local LLM through Ollama (free, optional).
* **Storyboard**: one scene per beat; environment by multilingual keyword scoring; shot
  plan with variety (establishing → coverage → climax low-angle → outro pull-back);
  lighting arc from the style; atmosphere/animation/SFX per environment; durations from
  word count at a per-language speaking rate, fitted to the target length.
* **Router** priority: AI video → AI image + 3D camera → procedural 3D → Blender →
  imported asset. AI video is chosen only when the model can make the shot (clip length,
  t2v vs i2v, reference conditioning). User choices are locked; an unavailable locked
  method is reported as *blocked*, never silently replaced.
* **Characters**: fixed ID, description, palette, scale, seed, reference images, optional
  model. Prompts embed the character sheet; reference images condition AI images
  (img2img) and AI video start frames; connected scenes continue from the previous
  clip's last frame.

## 5. Jobs and state

`jobs.mjs` runs two lanes (local renders vs. remote generation) one job at a time each.
Pause aborts the step in progress (finished scenes stay cached), resume re-queues,
cancel stops, retry re-runs failed/cancelled work. Job history persists; a job that was
running when the server stopped is marked *failed* and never auto-resumed. Generation
records keep status, provider, prompt, settings, log and error per scene, and every
generation also writes `generation/<scene>/generation_<ts>.json`.

## 6. Data layout

```
studio-data/
  config.json                     provider URLs, model filenames, TTS/LLM/render settings
  jobs.json                       job history
  projects/<id>/
    project.json                  the whole project (validated, atomic writes)
    assets/                       generated/imported images, clips, character refs/models
    generation/<scene>/           prompts, workflows and outputs per generation
    audio/                        narration clips, music (uploaded or procedural)
    renders/<scene>/<quality>-<hash>.mp4   scene cache
    exports/                      final MP4 + .srt + QC/report .json
```

## 7. Performance notes (measured on the 4-core, GPU-less build machine)

* Software WebGL (SwiftShader via ANGLE) is CPU-bound and already multi-threaded: **one**
  render tab is ~2× faster than three, so concurrency defaults to 1 without a GPU.
* Typical procedural scene: ~1.3 s per frame at 960×540 *or* 1080p (resolution barely
  matters on CPU). Expect ~30 s of rendering per second of 24 fps video without a GPU;
  a discrete GPU is one to two orders of magnitude faster.
* Previews use half resolution, ~35 % particle/vegetation density, smaller shadow maps
  and no MSAA. Scene renders are cached, so editing one scene re-renders only that scene.
