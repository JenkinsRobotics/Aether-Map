// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { effectSample, effectWarpMap } from './effect-warp';
afterEach(() => vi.restoreAllMocks());
test('local maps reconstruct source coordinates on landscape and portrait sources without tile seams', () => {
  const images: Uint8ClampedArray[] = [];
  const ctx = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: (image: {data: Uint8ClampedArray}) => images.push(image.data) };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => `data:image/png;fixture,${images.length - 1}`);
  for (const kind of ['fisheye','crt'] as const) for (const aspect of [9 / 16, 16 / 9]) {
    const grid=kind === 'crt' ? 4 : 8, size=256/grid+4;
    const offset = images.length;
    const tiles = effectWarpMap(kind, 71, aspect);
    expect(tiles).toHaveLength(grid*grid);
    expect(new Set(tiles.map(tile=>tile.url)).size).toBe(1);
    expect(effectWarpMap(kind, 71, aspect)).toBe(tiles);
    for (const [tileIndex, tile] of tiles.entries()) for (const px of [2, 17, 33]) for (const py of [2, 17, 33]) {
      const pixels = images[offset + tileIndex], index = (py * size + px) * 4;
      const u = tile.x - 2 / 256 + (px + .5) / 256, v = tile.y - 2 / 256 + (py + .5) / 256;
      expect(tile.imageX + ((tileIndex % grid) * size + px + .5) / 256).toBeCloseTo(u);
      expect(tile.imageY + (Math.floor(tileIndex / grid) * size + py + .5) / 256).toBeCloseTo(v);
      const expected = effectSample(kind, 71, u, v);
      const sampled = [u + tile.dx + (pixels[index] / 255 - .5) * tile.scale, v + tile.dy + (pixels[index + 1] / 255 - .5) * tile.scale / aspect];
      expect(Math.abs(sampled[0] - expected[0])).toBeLessThan(tile.scale / 510 + .00001);
      expect(Math.abs(sampled[1] - expected[1])).toBeLessThan(tile.scale / (510 * aspect) + .00002);
    }
  }
});
