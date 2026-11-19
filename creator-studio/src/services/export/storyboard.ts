import type { Project } from '@/types';
import { getAssetBlob } from '@/services/storage/assets';
import { canvasToBlob } from '@/services/media/image';
import { fontStack } from '@/services/compositor/compositor';

/** Contact sheet (JPEG) of all scene images with numbers and timing. */
export async function contactSheet(p: Project): Promise<Blob | undefined> {
  const withImg = p.scenes.filter((s) => s.imageAssetId);
  if (!withImg.length) return undefined;
  const cols = p.brief.aspect === '9:16' ? 5 : 4;
  const cellW = 300;
  const cellH = p.brief.aspect === '9:16' ? 533 : p.brief.aspect === '1:1' ? 300 : 169;
  const rows = Math.ceil(withImg.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * cellW + (cols + 1) * 12;
  c.height = rows * (cellH + 40) + (rows + 1) * 12 + 60;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0b0d17';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#fff';
  ctx.font = `700 26px ${fontStack('Montserrat')}`;
  ctx.fillText(p.title.slice(0, 70), 12, 40);
  for (const [i, s] of withImg.entries()) {
    const x = 12 + (i % cols) * (cellW + 12);
    const y = 60 + 12 + Math.floor(i / cols) * (cellH + 52);
    const blob = await getAssetBlob(s.imageAssetId!);
    if (!blob) continue;
    const bmp = await createImageBitmap(blob, { resizeWidth: cellW * 2, resizeQuality: 'medium' });
    const scale = Math.max(cellW / bmp.width, cellH / bmp.height);
    const sw = cellW / scale;
    const sh = cellH / scale;
    ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, x, y, cellW, cellH);
    bmp.close();
    ctx.fillStyle = '#c7c9ff';
    ctx.font = `600 16px ${fontStack('Montserrat')}`;
    ctx.fillText(`#${s.number}  ${s.start.toFixed(1)}s–${s.end.toFixed(1)}s`, x, y + cellH + 24);
  }
  const out = await canvasToBlob(c, 'image/jpeg', 0.85);
  c.width = c.height = 0;
  return out;
}
