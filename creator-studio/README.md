# Creator Studio AI

A mobile-first AI YouTube production studio that runs as an installable web app (PWA) on iPhone.
Enter a video idea → the studio writes the script and storyboard, generates scene images, a thumbnail,
the SEO package, the voice-over and subtitles, edits everything automatically (camera moves, transitions,
music, sound effects, captions) and renders a downloadable **MP4 (H.264 + AAC)**. You can open the
multi-track timeline, change anything and export again.

## What works today (verified)

Tested end to end at the iPhone 11 viewport (414×896) against a production build (`tests/e2e/full-flow.mjs`):

idea → concept/titles/hook → script + scenes → character references → SEO → 4 thumbnail concepts →
scene images (bulk queue) → thumbnail design + PNG export → per-scene voice-over → automatic edit with
music, SFX and word-highlighted subtitles → **on-device render (WebCodecs)** → MP4 download → full ZIP
package → reload persistence → manual timeline edit (reorder, trim, text overlay) → **FFmpeg.wasm render**
→ **cloud worker render (native FFmpeg, 1080×1920)**. All outputs were checked with `ffprobe`.
Offline launch of every screen is checked by `tests/e2e/pwa.mjs`.

The E2E run uses local stand-in servers that speak the self-hosted protocols (OpenAI-compatible chat and
speech, ComfyUI API). The hosted AI services (Gemini, Hugging Face, Groq, OpenRouter, Pollinations,
Cloudflare, Together, ElevenLabs, Anthropic) are implemented and unit-tested against their documented
request/response formats, but could not be called from the build environment — test each with your key
using **Settings → AI providers → Test**.

## AI providers

Nothing is generated without a connected provider, and no placeholder is ever presented as AI output.
Free services have quotas and rate limits; none is unlimited. Paid providers always ask for approval
before a request/batch, and the app never switches to a paid provider by itself.

| Kind | Provider | Cost | Needs |
| --- | --- | --- | --- |
| Text | Google Gemini | free tier | API key (`GEMINI_API_KEY`) |
| Text | Hugging Face Inference Providers | monthly free credits | token (`HF_TOKEN`) |
| Text | Groq | free tier | key |
| Text | OpenRouter (`:free` models) | free models | key |
| Text | Pollinations | free, rate limited | nothing |
| Text | Anthropic Claude | **paid** | key |
| Text | Ollama / LM Studio / any OpenAI-compatible | self-hosted | URL reachable from the phone (HTTPS) |
| Image | Pollinations (FLUX) | free, rate limited | nothing |
| Image | Hugging Face (FLUX.1-schnell, SDXL) | monthly free credits | token |
| Image | Cloudflare Workers AI | daily free allocation | API token + account ID |
| Image | Together AI | **paid** | key |
| Image | ComfyUI | self-hosted (unlimited on your GPU) | URL, checkpoint name; start with `--listen --enable-cors-header "*"` |
| Voice | Gemini TTS | free tier | Gemini key |
| Voice | ElevenLabs | free monthly characters | key (quota shown in the app) |
| Voice | Hugging Face MMS-TTS | free credits | token |
| Voice | Kokoro / OpenAI-compatible TTS | self-hosted | URL |

You can also upload or record your own narration, upload your own images and music.
Background music and sound effects can be synthesized in the app (original audio, free to use).

**Character consistency:** character descriptions are injected into every scene prompt that mentions the
character; fixed seeds are used where supported; a reference image is sent as image-to-image input to
ComfyUI and Cloudflare img2img models. No provider guarantees perfect consistency.

## Rendering

| Engine | Where | Use for |
| --- | --- | --- |
| On-device (WebCodecs + Mediabunny) | Safari/Chrome hardware H.264 encoder; AAC via WebCodecs or FFmpeg.wasm | Shorts and short videos (720p recommended on iPhone 11) |
| FFmpeg.wasm | browser | fallback when WebCodecs is missing; short projects only |
| Cloud render worker | `render-worker/` (native FFmpeg) | long videos, 1080p/4K |

Progress shown is real (frames encoded, or FFmpeg's own `time=`/`out_time`). iOS suspends web apps in
the background, so keep the app open while rendering on the phone.

### Cloud render worker

```bash
cd creator-studio
docker build -f render-worker/Dockerfile -t creator-studio-worker .
docker run -p 8787:8787 -e WORKER_TOKEN=change-me -e ALLOWED_ORIGIN=https://your-app.vercel.app creator-studio-worker
# or Fly.io: fly launch --copy-config --dockerfile render-worker/Dockerfile && fly secrets set WORKER_TOKEN=... ALLOWED_ORIGIN=...
```

Then enter the worker URL and token in **Settings → Rendering**. Jobs are deleted after download.

## Deploy (Vercel) and install on iPhone

1. Import the GitHub repository in Vercel, set **Root Directory** to `creator-studio`.
2. Add the environment variables you need from `.env.example` (at least `APP_ACCESS_TOKEN`).
3. Deploy, open the HTTPS URL in **Safari** on the iPhone, tap **Share → Add to Home Screen**.
4. Launch *Creator Studio* from the home screen (standalone mode), enter the access token in
   Settings → Security, and connect at least one text provider.

Projects and media are stored on the device (IndexedDB). The app requests persistent storage; still,
export backups (My Projects / Export / Settings → Storage) — iOS can clear website data for apps not used for weeks.

## Develop

```bash
npm install          # also copies the FFmpeg.wasm runtime to public/ffmpeg
npm run dev
npm test             # unit tests (FFmpeg filtergraph renders a real MP4 if ffmpeg is installed)
npm run build && npm start
node tests/e2e/mock-providers.mjs &                       # test stand-ins (not part of the app)
WORKER_TOKEN=t ALLOWED_ORIGIN=http://localhost:3000 npm run worker &   # optional cloud worker
node tests/e2e/full-flow.mjs http://localhost:3000 http://localhost:8799 /tmp/e2e
node tests/e2e/pwa.mjs
```

### Architecture

```
src/app/                 routes (Dashboard, Create, Images, Thumbnails, Editor, SEO, Projects, Channels, Settings) + API proxy
src/server/              server-only provider adapters (fixed upstream hosts, keys from env or per request)
src/services/ai/         prompts, JSON parsing, pipeline stages, client calls, paid-approval gate
src/services/image-providers/  bulk image queue, ComfyUI adapter
src/services/voice-providers/  TTS, uploads, recordings
src/services/timeline/   auto-edit builder, captions, QC
src/services/compositor/ canvas compositor (preview + on-device export), camera motion, audio mix
src/services/ffmpeg/     manifest → FFmpeg filtergraph compiler (shared by FFmpeg.wasm and the worker)
src/services/rendering/  WebCodecs, FFmpeg.wasm, cloud worker, render manager
src/services/export/     ZIP package, backups, SRT/VTT/ASS, storyboard sheet
src/features/            project workspace, editor, thumbnail editor
render-worker/           dependency-free Node + native FFmpeg render service
```

### Known limitations

- Interface text is English; generated content follows each project's language (Turkish, Spanish, English, …).
- Word-level subtitle timing inside a cue is estimated from word length (cue boundaries follow the real audio).
- Parallax/depth motion is not offered (no depth data); 4K needs the cloud worker unless the device encoder supports it.
- Voice pitch control: none of the connected TTS APIs expose it.

Fonts: Anton, Montserrat, Cinzel (SIL Open Font License).
