import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileFfmpegArgs, type RenderManifest } from '../../src/services/ffmpeg/filtergraph.ts';
import { motionKeys } from '../../src/services/compositor/motion.ts';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

function fixture(dir: string) {
  const ff = (...a: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { cwd: dir });
  ff('-f', 'lavfi', '-i', 'testsrc2=s=768x1344:d=1', '-frames:v', '1', 'scene_001.png');
  ff('-f', 'lavfi', '-i', 'smptebars=s=1024x1024:d=1', '-frames:v', '1', 'scene_002.png');
  ff('-f', 'lavfi', '-i', 'color=c=0x223355:s=720x1280:d=1', '-frames:v', '1', 'title_000.png');
  ff('-f', 'lavfi', '-i', 'sine=f=440:d=2.5', 'nar_1.wav');
  ff('-f', 'lavfi', '-i', 'sine=f=660:d=2', 'nar_2.wav');
  ff('-f', 'lavfi', '-i', 'sine=f=110:d=1.5', '-ac', '2', 'music.wav');
  writeFileSync(
    join(dir, 'subs.ass'),
    `[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,60,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,2,40,40,160,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.20,0:00:02.00,Default,,0,0,0,,{\\k40}Merhaba {\\k60}dünya\n`,
  );
}

test('compiles a manifest and renders a real MP4 with native FFmpeg', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cs-ff-'));
  fixture(dir);
  const m: RenderManifest = {
    version: 1,
    width: 720,
    height: 1280,
    fps: 30,
    duration: 2 + 3 + 2.5,
    videoBitrate: 0,
    clips: [
      { file: 'title_000.png', imgW: 720, imgH: 1280, duration: 2, motion: motionKeys('zoomIn', 0.5), transition: 'cut', transitionDuration: 0 },
      { file: 'scene_001.png', imgW: 768, imgH: 1344, duration: 3, motion: motionKeys('panUp', 1), transition: 'fadeblack', transitionDuration: 0.6 },
      { file: 'scene_002.png', imgW: 1024, imgH: 1024, duration: 2.5, motion: motionKeys('kenBurns', 1.2), transition: 'slideleft', transitionDuration: 0.5 },
    ],
    audio: [
      { file: 'nar_1.wav', track: 'narration', start: 2.1, offset: 0, duration: 2.5, volume: 1, fadeIn: 0, fadeOut: 0.05, loop: false },
      { file: 'nar_2.wav', track: 'narration', start: 5.1, offset: 0, duration: 2, volume: 1, fadeIn: 0, fadeOut: 0.05, loop: false },
      { file: 'music.wav', track: 'music', start: 0, offset: 0, duration: 7.5, volume: 0.35, fadeIn: 1, fadeOut: 1.5, loop: true },
    ],
    overlays: [],
    ducking: { enabled: true, level: 0.35 },
    normalize: true,
    subtitles: 'subs.ass',
  };
  const args = compileFfmpegArgs(m, { output: 'out.mp4', preset: 'ultrafast' });
  const r = spawnSync('ffmpeg', args, { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr.slice(-2000));
  assert.ok(existsSync(join(dir, 'out.mp4')));
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height:format=duration', '-of', 'json', 'out.mp4'], { cwd: dir, encoding: 'utf8' });
  const j = JSON.parse(probe);
  const v = j.streams.find((s: { codec_name: string }) => s.codec_name === 'h264');
  const a = j.streams.find((s: { codec_name: string }) => s.codec_name === 'aac');
  assert.ok(v && a, probe);
  assert.equal(v.width, 720);
  assert.equal(v.height, 1280);
  assert.ok(Math.abs(Number(j.format.duration) - 7.5) < 0.15, `duration ${j.format.duration}`);
});

test('rejects path traversal in manifest file names', () => {
  assert.throws(() =>
    compileFfmpegArgs(
      { version: 1, width: 640, height: 360, fps: 30, duration: 1, videoBitrate: 0, clips: [{ file: '../etc/passwd', imgW: 1, imgH: 1, duration: 1, motion: motionKeys('static', 1), transition: 'cut', transitionDuration: 0 }], audio: [], overlays: [], ducking: { enabled: false, level: 1 }, normalize: false },
      { output: 'o.mp4', preset: 'ultrafast' },
    ),
  );
});
