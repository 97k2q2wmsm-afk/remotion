import type { ProviderBilling, ProviderKind } from './states';

export interface ProviderField {
  key: 'apiKey' | 'endpoint' | 'model' | 'accountId' | `extra.${string}`;
  label: string;
  placeholder?: string;
  required?: boolean;
  secret?: boolean;
  help?: string;
}

export interface ProviderAdapterInfo {
  type: string;
  kind: ProviderKind;
  name: string;
  billing: ProviderBilling;
  /** 'proxy' = called through this app's server (keys stay off third-party JS); 'direct' = browser calls a user-hosted endpoint. */
  transport: 'proxy' | 'direct';
  /** Server environment variable that can hold the key instead of the device. */
  envKey?: string;
  envAccount?: string;
  defaultModel?: string;
  defaultEndpoint?: string;
  fields: ProviderField[];
  notes: string;
  quotaNote: string;
  signupUrl?: string;
  supports?: { negativePrompt?: boolean; seed?: boolean; referenceImage?: boolean; voices?: boolean; speed?: boolean; pitch?: boolean };
}

const KEY_FIELD = (label: string, required = true): ProviderField => ({ key: 'apiKey', label, secret: true, required });
const MODEL_FIELD = (placeholder: string): ProviderField => ({ key: 'model', label: 'Model', placeholder });

export const PROVIDER_CATALOG: ProviderAdapterInfo[] = [
  // ---------- TEXT ----------
  {
    type: 'gemini-text',
    kind: 'text',
    name: 'Google Gemini',
    billing: 'free-tier',
    transport: 'proxy',
    envKey: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
    fields: [KEY_FIELD('Gemini API key', false), MODEL_FIELD('gemini-2.5-flash')],
    notes: 'Strong multilingual scripts (Turkish, Spanish, English). Create a key in Google AI Studio.',
    quotaNote: 'Free tier with per-minute and per-day request limits set by Google; limits change and are not reported by the API.',
    signupUrl: 'https://aistudio.google.com/apikey',
  },
  {
    type: 'hf-text',
    kind: 'text',
    name: 'Hugging Face Inference Providers',
    billing: 'free-tier',
    transport: 'proxy',
    envKey: 'HF_TOKEN',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    fields: [KEY_FIELD('Hugging Face token', false), MODEL_FIELD('meta-llama/Llama-3.3-70B-Instruct')],
    notes: 'OpenAI-compatible router over many open models. Use a fine-grained token with "Make calls to Inference Providers".',
    quotaNote: 'Free accounts receive small monthly inference credits; when they run out requests fail (no automatic billing unless you add a payment method on Hugging Face).',
    signupUrl: 'https://huggingface.co/settings/tokens',
  },
  {
    type: 'groq-text',
    kind: 'text',
    name: 'Groq',
    billing: 'free-tier',
    transport: 'proxy',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    fields: [KEY_FIELD('Groq API key', false), MODEL_FIELD('llama-3.3-70b-versatile')],
    notes: 'Very fast open models. Good for quick drafts and SEO.',
    quotaNote: 'Free plan with per-minute and per-day token limits.',
    signupUrl: 'https://console.groq.com/keys',
  },
  {
    type: 'openrouter-text',
    kind: 'text',
    name: 'OpenRouter (free models)',
    billing: 'free-tier',
    transport: 'proxy',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    fields: [KEY_FIELD('OpenRouter API key', false), MODEL_FIELD('meta-llama/llama-3.3-70b-instruct:free')],
    notes: 'Keep a ":free" model id to stay on free models. Models without ":free" are billed to your OpenRouter credits.',
    quotaNote: 'Free models have daily request caps. The connection test shows the key\'s reported credit usage and limit.',
    signupUrl: 'https://openrouter.ai/keys',
  },
  {
    type: 'pollinations-text',
    kind: 'text',
    name: 'Pollinations (no key)',
    billing: 'free',
    transport: 'proxy',
    envKey: 'POLLINATIONS_TOKEN',
    defaultModel: 'openai',
    fields: [KEY_FIELD('Pollinations token (optional)', false), MODEL_FIELD('openai')],
    notes: 'Community-run free endpoint. Quality and availability vary; terms may change at any time.',
    quotaNote: 'Anonymous use is rate limited. No quota information is reported.',
    signupUrl: 'https://pollinations.ai',
  },
  {
    type: 'anthropic-text',
    kind: 'text',
    name: 'Anthropic Claude',
    billing: 'paid',
    transport: 'proxy',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-5-5',
    fields: [KEY_FIELD('Anthropic API key', false), MODEL_FIELD('claude-sonnet-5-5')],
    notes: 'Highest-quality storytelling. Billed per token — every request asks for your approval first.',
    quotaNote: 'Paid usage billed by Anthropic. No free quota.',
    signupUrl: 'https://console.anthropic.com',
  },
  {
    type: 'openai-compatible-text',
    kind: 'text',
    name: 'Self-hosted (Ollama / LM Studio / OpenAI-compatible)',
    billing: 'self-hosted',
    transport: 'direct',
    defaultEndpoint: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    fields: [
      { key: 'endpoint', label: 'Base URL (…/v1)', placeholder: 'http://192.168.1.20:11434/v1', required: true, help: 'Must be reachable from this device and allow CORS (Ollama: OLLAMA_ORIGINS=*).' },
      MODEL_FIELD('llama3.1'),
      KEY_FIELD('API key (if your server needs one)', false),
    ],
    notes: 'Runs on your own computer or server. Free and private; the phone must reach it over the network (HTTPS required when the app is served over HTTPS).',
    quotaNote: 'Limited only by your hardware.',
  },

  // ---------- IMAGE ----------
  {
    type: 'pollinations-image',
    kind: 'image',
    name: 'Pollinations Image (no key)',
    billing: 'free',
    transport: 'proxy',
    envKey: 'POLLINATIONS_TOKEN',
    defaultModel: 'flux',
    fields: [KEY_FIELD('Pollinations token (optional)', false), MODEL_FIELD('flux')],
    notes: 'Free FLUX/turbo images without an account. Supports seed. No negative prompt or reference images.',
    quotaNote: 'Anonymous requests are queued and rate limited (roughly one at a time). Not unlimited; terms may change.',
    signupUrl: 'https://pollinations.ai',
    supports: { seed: true },
  },
  {
    type: 'hf-image',
    kind: 'image',
    name: 'Hugging Face (FLUX.1-schnell / SDXL)',
    billing: 'free-tier',
    transport: 'proxy',
    envKey: 'HF_TOKEN',
    defaultModel: 'black-forest-labs/FLUX.1-schnell',
    fields: [KEY_FIELD('Hugging Face token', false), MODEL_FIELD('black-forest-labs/FLUX.1-schnell')],
    notes: 'Uses the hf-inference provider. Negative prompt and seed are passed when the model supports them.',
    quotaNote: 'Consumes your monthly free inference credits; when exhausted, requests fail with 402 until the next month.',
    signupUrl: 'https://huggingface.co/settings/tokens',
    supports: { negativePrompt: true, seed: true },
  },
  {
    type: 'cloudflare-image',
    kind: 'image',
    name: 'Cloudflare Workers AI',
    billing: 'free-tier',
    transport: 'proxy',
    envKey: 'CLOUDFLARE_API_TOKEN',
    envAccount: 'CLOUDFLARE_ACCOUNT_ID',
    defaultModel: '@cf/black-forest-labs/flux-1-schnell',
    fields: [
      KEY_FIELD('API token (Workers AI permission)', false),
      { key: 'accountId', label: 'Account ID', placeholder: '32-character account id' },
      MODEL_FIELD('@cf/black-forest-labs/flux-1-schnell'),
    ],
    notes:
      'FLUX schnell (fast) or @cf/stabilityai/stable-diffusion-xl-base-1.0 / @cf/runwayml/stable-diffusion-v1-5-img2img (negative prompt, seed, reference image).',
    quotaNote: 'Daily free allocation (neurons) on the Workers Free plan; requests fail once it is used up. Paid plans bill overage — check your Cloudflare plan.',
    signupUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    supports: { negativePrompt: true, seed: true, referenceImage: true },
  },
  {
    type: 'together-image',
    kind: 'image',
    name: 'Together AI',
    billing: 'paid',
    transport: 'proxy',
    envKey: 'TOGETHER_API_KEY',
    defaultModel: 'black-forest-labs/FLUX.1-schnell',
    fields: [KEY_FIELD('Together API key', false), MODEL_FIELD('black-forest-labs/FLUX.1-schnell')],
    notes: 'Fast FLUX models. Billed per image — approval required before each batch.',
    quotaNote: 'Paid credits. Some promotional free models come and go; treat as paid.',
    signupUrl: 'https://api.together.ai',
    supports: { seed: true },
  },
  {
    type: 'comfyui',
    kind: 'image',
    name: 'ComfyUI (self-hosted)',
    billing: 'self-hosted',
    transport: 'direct',
    defaultEndpoint: 'http://localhost:8188',
    fields: [
      { key: 'endpoint', label: 'ComfyUI URL', placeholder: 'https://my-gpu-box:8188', required: true, help: 'Start ComfyUI with --listen --enable-cors-header "*". Use HTTPS when the app is served over HTTPS.' },
      { key: 'model', label: 'Checkpoint file', placeholder: 'sd_xl_base_1.0.safetensors', required: true },
      { key: 'extra.steps', label: 'Steps', placeholder: '25' },
      { key: 'extra.cfg', label: 'CFG', placeholder: '6.5' },
      { key: 'extra.denoise', label: 'Reference image strength (img2img denoise)', placeholder: '0.65' },
    ],
    notes: 'Unlimited local generation with your own GPU. Supports negative prompt, seed and reference image (img2img).',
    quotaNote: 'Limited only by your hardware.',
    supports: { negativePrompt: true, seed: true, referenceImage: true },
  },

  // ---------- VOICE ----------
  {
    type: 'gemini-tts',
    kind: 'voice',
    name: 'Google Gemini TTS',
    billing: 'free-tier',
    transport: 'proxy',
    envKey: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash-preview-tts',
    fields: [KEY_FIELD('Gemini API key', false), MODEL_FIELD('gemini-2.5-flash-preview-tts')],
    notes: 'Natural multilingual voices (Kore, Puck, Charon, Fenrir, Aoede…). Style is steered with the narration tone.',
    quotaNote: 'Free tier with low daily request limits for TTS models; limits are set by Google and change over time.',
    signupUrl: 'https://aistudio.google.com/apikey',
    supports: { voices: true },
  },
  {
    type: 'elevenlabs',
    kind: 'voice',
    name: 'ElevenLabs',
    billing: 'free-tier',
    transport: 'proxy',
    envKey: 'ELEVENLABS_API_KEY',
    defaultModel: 'eleven_multilingual_v2',
    fields: [KEY_FIELD('ElevenLabs API key', false), MODEL_FIELD('eleven_multilingual_v2')],
    notes: 'Premium narration voices in 29+ languages. Speed control supported.',
    quotaNote: 'Free plan includes a monthly character quota; the connection test shows characters used / limit when the key may read it.',
    signupUrl: 'https://elevenlabs.io/app/settings/api-keys',
    supports: { voices: true, speed: true },
  },
  {
    type: 'hf-tts',
    kind: 'voice',
    name: 'Hugging Face MMS-TTS',
    billing: 'free-tier',
    transport: 'proxy',
    envKey: 'HF_TOKEN',
    defaultModel: 'facebook/mms-tts-eng',
    fields: [KEY_FIELD('Hugging Face token', false), MODEL_FIELD('facebook/mms-tts-eng (tur / spa variants)')],
    notes: 'Open-source Meta MMS voices: facebook/mms-tts-tur, facebook/mms-tts-spa, facebook/mms-tts-eng. Basic but free.',
    quotaNote: 'Uses monthly free inference credits; model availability on hf-inference can change.',
    signupUrl: 'https://huggingface.co/settings/tokens',
  },
  {
    type: 'openai-compatible-tts',
    kind: 'voice',
    name: 'Self-hosted TTS (Kokoro / OpenAI-compatible)',
    billing: 'self-hosted',
    transport: 'direct',
    defaultEndpoint: 'http://localhost:8880/v1',
    defaultModel: 'kokoro',
    fields: [
      { key: 'endpoint', label: 'Base URL (…/v1)', placeholder: 'http://192.168.1.20:8880/v1', required: true },
      MODEL_FIELD('kokoro'),
      KEY_FIELD('API key (if required)', false),
    ],
    notes: 'Any server exposing POST /v1/audio/speech (e.g. Kokoro-FastAPI). Free and private.',
    quotaNote: 'Limited only by your hardware.',
    supports: { voices: true, speed: true },
  },
];

export function adapterInfo(type: string): ProviderAdapterInfo | undefined {
  return PROVIDER_CATALOG.find((p) => p.type === type);
}

export const GEMINI_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr', 'Enceladus', 'Iapetus'];
