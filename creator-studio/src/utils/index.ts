export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefix ? `${prefix}_${rnd}` : rnd;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function formatTime(seconds: number, withMs = false): string {
  if (!Number.isFinite(seconds)) return '--:--';
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  const core = `${h > 0 ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`;
  return withMs ? `${core}.${ms}` : core;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function slugify(text: string, max = 48): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', ñ: 'n', á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' };
  const s = text
    .toLowerCase()
    .replace(/[çğıİöşüñáéíóú]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max);
  return s || 'project';
}

export function pad(n: number, width = 3): string {
  return String(n).padStart(width, '0');
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args: A) => {
    if (t) clearTimeout(t);
    fn(...args);
  };
  return wrapped;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Words-per-second narration rates; conservative values for natural documentary pacing. */
const WPS: Record<string, number> = { tr: 2.1, en: 2.5, es: 2.6, de: 2.2, fr: 2.6, pt: 2.5, it: 2.6, ar: 2.1, ru: 2.2 };

export function langCode(language: string): string {
  const l = language.trim().toLowerCase();
  if (l.startsWith('tr') || l.includes('türk') || l.includes('turk')) return 'tr';
  if (l.startsWith('es') || l.includes('spa') || l.includes('españ')) return 'es';
  if (l.startsWith('en') || l.includes('engl')) return 'en';
  if (l.startsWith('de') || l.includes('germ') || l.includes('deut')) return 'de';
  if (l.startsWith('fr')) return 'fr';
  if (l.startsWith('pt') || l.includes('portu')) return 'pt';
  if (l.startsWith('it')) return 'it';
  if (l.startsWith('ar')) return 'ar';
  if (l.startsWith('ru')) return 'ru';
  return l.slice(0, 2) || 'en';
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function estimateNarrationSeconds(text: string, language: string, speed = 1): number {
  const wps = (WPS[langCode(language)] ?? 2.4) * speed;
  const words = wordCount(text);
  const pauses = (text.match(/[.!?…]/g) ?? []).length * 0.25;
  return words === 0 ? 0 : round(words / wps + pauses, 2);
}

export function aspectSize(aspect: '16:9' | '9:16' | '1:1', resolution: '720p' | '1080p' | '2160p') {
  const short = resolution === '720p' ? 720 : resolution === '1080p' ? 1080 : 2160;
  const long = Math.round((short * 16) / 9);
  if (aspect === '16:9') return { width: long, height: short };
  if (aspect === '9:16') return { width: short, height: long };
  return { width: short, height: short };
}
