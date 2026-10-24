import type { VisualEffectKind } from '../visual-effects';
import { effectAmount } from '../visual-effects';

export type WarpKind = Extract<VisualEffectKind, 'kaleido' | 'tile' | 'fisheye' | 'crt'>;
const fract = (n: number) => n - Math.floor(n);
/** Inverse texture coordinates, independent of media, time and the renderer. */
export function effectSample(kind: WarpKind, amount: number, u: number, v: number): [number, number] {
  const a = effectAmount(kind, amount);
  if (kind === 'tile') return [fract(u * a), fract(v * a)];
  if (a === 0 && (kind === 'fisheye' || kind === 'crt')) return [u, v];
  const x = u - .5, y = v - .5;
  if (kind === 'kaleido') {
    const sector = Math.PI * 2 / a;
    const angle = Math.abs(fract((Math.atan2(y, x) + sector / 2) / sector) * sector - sector / 2);
    const radius = Math.hypot(x, y);
    const mirror = (n: number) => 1 - Math.abs(fract(n / 2) * 2 - 1);
    return [mirror(.5 + radius * Math.cos(angle)), mirror(.5 + radius * Math.sin(angle))];
  }
  const strength = kind === 'crt' ? a / 250 : -a / 110;
  const scale = Math.exp(strength * (x * x + y * y) * 2);
  return [.5 + x * scale, .5 + y * scale];
}
export interface WarpTile {
  x: number; y: number; width: number; height: number;
  imageX: number; imageY: number; imageSize: number;
  dx: number; dy: number; scale: number; url: string;
}
/** Local offsets keep SVG's 8-bit displacement channels small enough to retain fine source detail, rather than introducing full-picture stair steps.
 * Overlapping coordinate textures avoid seams at the tile boundaries. Each
 * tile samples the same SourceGraphic; videos and shader contexts stay single. */
const maps = new Map<string, WarpTile[]>();
export function effectWarpMap(kind: WarpKind, value: number, aspect = 1): WarpTile[] {
  const ratio = Math.max(.001, Math.min(1000, Math.round(aspect * 10000) / 10000));
  const amount = Math.round(effectAmount(kind, value) * 10) / 10, key = `${kind}:${amount}:${ratio}`;
  const cached = maps.get(key);
  if (cached) { maps.delete(key); maps.set(key, cached); return cached; }
  // Lens fields are smooth, so 256 coordinate samples preserve sub-pixel
  // interpolation without regenerating 300k pixels per frame. Kaleido has
  // discontinuities at sector boundaries and keeps the dense static field.
  const grid = kind === 'crt' ? 4 : 8, resolution = kind === 'kaleido' ? 512 : 256, pad = 2, size = resolution / grid + pad * 2;
  const canvas = document.createElement('canvas'); canvas.width = size * grid; canvas.height = size * grid;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const tiles: WarpTile[] = [];
  for (let row = 0; row < grid; row++) for (let col = 0; col < grid; col++) {
    const x = col / grid, y = row / grid, imageX = x - pad / resolution, imageY = y - pad / resolution;
    const offsets: [number, number][] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const u = imageX + (px + .5) / resolution, v = imageY + (py + .5) / resolution;
      const [s, t] = effectSample(kind, amount, u, v), dx = s - u, dy = t - v;
      offsets.push([dx, dy]); minX = Math.min(minX, dx); maxX = Math.max(maxX, dx); minY = Math.min(minY, dy); maxY = Math.max(maxY, dy);
    }
    const dx = (minX + maxX) / 2, dy = (minY + maxY) / 2, scale = Math.max(.0001, maxX - minX, (maxY - minY) * ratio) * 1.01;
    const pixels = ctx.createImageData(size, size);
    offsets.forEach(([ox, oy], i) => {
      pixels.data[i * 4] = Math.round((.5 + (ox - dx) / scale) * 255);
      // SVG displacement's scalar uses the X axis for both channels, even
      // with objectBoundingBox primitives. Correct Y for the source aspect.
      pixels.data[i * 4 + 1] = Math.round((.5 + (oy - dy) * ratio / scale) * 255);
      pixels.data[i * 4 + 2] = 128; pixels.data[i * 4 + 3] = 255;
    });
    ctx.putImageData(pixels, col * size, row * size);
    // A single padded atlas is encoded/decoded once. Each feImage aligns its
    // own cell; the displacement primitive crops to that tile's output area.
    tiles.push({ x, y, width: 1 / grid, height: 1 / grid,
      imageX: imageX - col * size / resolution, imageY: imageY - row * size / resolution,
      imageSize: size * grid / resolution, dx, dy, scale, url: '' });
  }
  const url = canvas.toDataURL('image/png');
  for (const tile of tiles) tile.url = url;
  maps.set(key, tiles);
  if (maps.size > 16) maps.delete(maps.keys().next().value!);
  canvas.width = 0; canvas.height = 0;
  return tiles;
}
