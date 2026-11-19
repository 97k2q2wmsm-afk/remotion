import type { CaptionCue, CaptionStyle } from '@/types';

function ts(t: number, sep: ',' | '.') {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`;
}

export function toSrt(cues: CaptionCue[]): string {
  return cues.map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
}

export function toVtt(cues: CaptionCue[]): string {
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n')}`;
}

export function parseSrtOrVtt(text: string): CaptionCue[] {
  const blocks = text.replace(/\r/g, '').replace(/^WEBVTT[^\n]*\n/, '').split(/\n{2,}/);
  const out: CaptionCue[] = [];
  const toSec = (s: string) => {
    const m = /(?:(\d+):)?(\d+):(\d+)[,.](\d+)/.exec(s.trim());
    if (!m) return NaN;
    return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0').slice(0, 3)) / 1000;
  };
  for (const b of blocks) {
    const lines = b.split('\n').filter(Boolean);
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx < 0) continue;
    const [a, z] = lines[timeIdx].split('-->');
    const start = toSec(a);
    const end = toSec(z);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.push({ id: `c${out.length}_${Math.round(start * 1000)}`, start, end, text: lines.slice(timeIdx + 1).join(' ') });
  }
  return out;
}

function assColor(hex: string, alpha = 0) {
  const h = hex.replace('#', '').padEnd(6, '0');
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase();
  return `&H${a}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}

function assTime(t: number) {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** ASS subtitles for FFmpeg rendering, styled like the on-device compositor (incl. karaoke word highlight). */
export function toAss(cues: CaptionCue[], style: CaptionStyle, width: number, height: number): string {
  const size = Math.round((style.size / 100) * height);
  const align = style.position === 'bottom' ? 2 : style.position === 'top' ? 8 : 5;
  const marginV = style.position === 'center' ? 0 : Math.round((style.offset / 100) * height);
  const borderStyle = style.background ? 3 : 1;
  const outline = style.background ? Math.round(size * 0.25) : Math.max(0, Math.round(style.outlineWidth * (height / 1080)));
  const back = style.background ? assColor(style.backgroundColor, 1 - style.backgroundOpacity) : assColor('#000000', 0.5);
  const outlineColor = style.background ? back : assColor(style.outlineColor);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.font === 'system-ui' ? 'DejaVu Sans' : style.font},${size},${assColor(style.wordHighlight ? style.highlightColor : style.color)},${assColor(style.color)},${outlineColor},${back},-1,0,0,0,100,100,0,0,${borderStyle},${outline},0,${align},${Math.round(width * 0.07)},${Math.round(width * 0.07)},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const esc = (t: string) => (style.uppercase ? t.toLocaleUpperCase() : t).replace(/[{}]/g, '').replace(/\n/g, '\\N');
  const lines = cues.map((c) => {
    let text: string;
    if (style.wordHighlight && c.words?.length) {
      // \k durations in centiseconds; secondary colour is shown until the word is reached.
      text = c.words
        .map((w, i) => {
          const next = c.words![i + 1]?.start ?? c.end;
          return `{\\k${Math.max(1, Math.round((next - w.start) * 100))}}${esc(w.text)}`;
        })
        .join(' ');
      const lead = Math.max(0, Math.round((c.words[0].start - c.start) * 100));
      if (lead) text = `{\\k${lead}}${text}`;
    } else text = esc(c.text);
    const anim = style.animation === 'fade' ? '{\\fad(150,0)}' : style.animation === 'pop' ? '{\\fscx85\\fscy85\\t(0,120,\\fscx100\\fscy100)}' : '';
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${anim}${text}`;
  });
  return header + lines.join('\n') + '\n';
}
