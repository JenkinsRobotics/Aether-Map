import type { MapShow, Scene, Surface } from '../document';
import { quadCorners } from '../document';
import { animateSurface } from '../features/animation';
import { backdropSurface } from '../background-layer';
import { solveHomography, project } from '../homography';
import { bentSourceFraction } from '../mask/bend';
import { sceneSize } from '../scene-size';
import { svgDocument, surfaceMarkup } from './geometry';

function canvas(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 16_777_216)
    throw Error('PNG export supports artboards up to 16 megapixels. SVG retains the full size.');
  const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
}
async function image(url: string) {
  const img = new Image(); img.src = url; await img.decode(); return img;
}
async function vectorLayer(surface: Surface, width: number, height: number) {
  const c = canvas(width, height), url = URL.createObjectURL(new Blob([svgDocument(width, height, surfaceMarkup(surface, 'layer', true))], { type: 'image/svg+xml' }));
  try { c.getContext('2d')!.drawImage(await image(url), 0, 0); } finally { URL.revokeObjectURL(url); }
  return c;
}
const yieldFrame = () => new Promise<void>(resolve => setTimeout(resolve, 0));
/** Bilinear sampling, with transparent pixels outside the source image. */
function sample(data: ImageData, x: number, y: number, channel: number): number {
  x -= .5; y -= .5;
  const left = Math.floor(x), top = Math.floor(y), dx = x - left, dy = y - top;
  let value = 0;
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const px = left + col, py = top + row;
    if (px >= 0 && py >= 0 && px < data.width && py < data.height)
      value += data.data[(py * data.width + px) * 4 + channel] * (col ? dx : 1 - dx) * (row ? dy : 1 - dy);
  }
  return value;
}
async function imagePixels(url: string) {
  const img = await image(url), c = canvas(img.naturalWidth, img.naturalHeight);
  c.getContext('2d')!.drawImage(img, 0, 0); return c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
}

export async function maskCanvas(show: MapShow, scene: Scene, surfaceIDs?: readonly string[], wholeArtboard = false, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const { width, height } = sceneSize(show, scene), result = canvas(width, height), ctx = result.getContext('2d')!;
  ctx.fillStyle = wholeArtboard ? '#fff' : '#000'; ctx.fillRect(0, 0, width, height);
  for (const raw of scene.surfaces) {
    signal?.throwIfAborted();
    if (!raw.enabled || raw.sceneCanvas || (wholeArtboard && raw.kind !== 'mask') || (surfaceIDs && !surfaceIDs.includes(raw.id) && raw.kind !== 'mask')) continue;
    const surface = animateSurface(raw, 0), layer = await vectorLayer(surface, width, height);
    if (surface.alphaMask) {
      const src = await imagePixels(surface.alphaMask.png), target = layer.getContext('2d')!, pixels = target.getImageData(0, 0, width, height);
      const inverse = solveHomography(surface.corners, quadCorners([0, 0, 1, 1]));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const at = (y * width + x) * 4;
          if (!pixels.data[at + 3]) continue;
          let [u, v] = project(inverse, [x + .5, y + .5]);
          if (surface.bend?.axis === 'horizontal') u = bentSourceFraction(u, surface.bend.angleDeg);
          if (surface.bend?.axis === 'vertical') v = bentSourceFraction(v, surface.bend.angleDeg);
          pixels.data[at + 3] *= sample(src, u * src.width, v * src.height, 3) / 255;
        }
        if (y % 64 === 0) { await yieldFrame(); signal?.throwIfAborted(); }
      }
      target.putImageData(pixels, 0, 0);
    }
    ctx.drawImage(layer, 0, 0); await yieldFrame();
  }
  signal?.throwIfAborted();
  return result;
}

/** Clean artboard reference. Backdrop stays an editor reference, never a projected asset. */
export async function referenceCanvas(show: MapShow, scene: Scene, mediaUrls: Record<string, string>) {
  if (!scene.setupBackground?.visible) return null;
  const surface = backdropSurface({ ...show, activeSceneId: scene.id });
  const url = mediaUrls[scene.setupBackground.mediaId];
  if (!surface || !url) throw Error('The enabled backdrop is unavailable. Restore it or disable it before exporting.');
  const sourceURL = new URL(url, location.href);
  if (sourceURL.origin !== location.origin) throw Error('Import the backdrop into this project before exporting it.');
  const source = await imagePixels(url), { width, height } = sceneSize(show, scene);
  const c = canvas(width, height), ctx = c.getContext('2d')!, pixels = ctx.createImageData(width, height);
  const inverse = solveHomography(surface.corners, quadCorners([0, 0, source.width, source.height]));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [u, v] = project(inverse, [x + .5, y + .5]), at = (y * width + x) * 4;
      if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || v < 0 || u > source.width || v > source.height) continue;
      for (let channel = 0; channel < 4; channel++) pixels.data[at + channel] = sample(source, u, v, channel);
      pixels.data[at + 3] *= surface.opacity;
    }
    if (y % 64 === 0) await yieldFrame();
  }
  ctx.putImageData(pixels, 0, 0); return c;
}
export const pngBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Could not encode PNG.')), 'image/png'));
