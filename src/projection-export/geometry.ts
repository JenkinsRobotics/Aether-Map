import { pathData } from '@aether/sketch';
import { animateSurface } from '../features/animation';
import { project, solveHomography } from '../homography';
import { quadCorners, type MapShow, type Scene, type Surface, type Point } from '../document';
import { sceneSize } from '../scene-size';

export const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
export const exportName = (s: string) => s.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^\.+/, '').slice(0, 80) || 'scene';
export const svgDocument = (width: number, height: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;

/** Mask curves already live in scene coordinates. Preserve cubics, including the closing edge. */
export function outlinePaths(surface: Surface): string[] {
  return surface.masks.length ? surface.masks.map((points, i) => pathData({ points, curves: surface.maskCurves?.[i], closed: true }))
    : [sourceBoundary(surface)];
}

/** Source clip projected through the same homography as Mapping. SVG cannot express
 * a projective image transform; curved source boundaries are sampled (512 points). */
export function sourceBoundary(surface: Surface): string {
  const [x, y, w, h] = surface.source.rect;
  if (surface.shape !== 'ellipse' && !surface.radiusPx) return pathData({ points: surface.corners, closed: true });
  const matrix = solveHomography(quadCorners(surface.source.rect), surface.corners);
  const radius = Math.max(0, Math.min(surface.radiusPx ?? 0, w / 2, h / 2));
  const points: Point[] = [];
  if (surface.shape === 'ellipse') {
    for (let i = 0; i < 512; i++) { const angle = i / 512 * Math.PI * 2;
      points.push(project(matrix, [x + w / 2 + Math.cos(angle) * w / 2, y + h / 2 + Math.sin(angle) * h / 2])); }
  } else {
    const centers: Point[] = [[x + w - radius, y + radius], [x + w - radius, y + h - radius], [x + radius, y + h - radius], [x + radius, y + radius]];
    centers.forEach(([cx, cy], corner) => { for (let i = 0; i <= 128; i++) {
      const angle = (-1 + corner + i / 128) * Math.PI / 2;
      points.push(project(matrix, [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]));
    } });
  }
  return pathData({ points, closed: true });
}

export function surfaceMarkup(surface: Surface, id: string, filled = false): string {
  const paths = outlinePaths(surface), fill = surface.kind === 'mask' ? '#000000' : '#ffffff';
  const attrs = filled ? `fill="${fill}" stroke="none"` : `fill="none" stroke="${surface.kind === 'mask' ? '#e7a843' : '#4c9dff'}" stroke-width="1"`;
  const shapes = surface.maskFillRule
    ? `<path d="${xml(paths.join(' '))}" fill-rule="${surface.maskFillRule}" ${attrs}/>`
    : paths.map(d => `<path d="${xml(d)}" ${attrs}/>`).join('');
  return `<g id="${id}" data-surface-id="${xml(surface.id)}" data-folder="${xml(surface.folder ?? '')}"${surface.enabled ? '' : ' display="none"'}><title>${xml(surface.name)}</title><defs><clipPath id="${id}-clip"><path d="${xml(sourceBoundary(surface))}"/></clipPath></defs><g clip-path="url(#${id}-clip)">${shapes}</g></g>`;
}

export function sceneSvg(show: MapShow, scene: Scene, filled = false, onlyIDs?: readonly string[]): string {
  const size = sceneSize(show, scene);
  return svgDocument(size.width, size.height, `<title>${xml(scene.name)}</title>` + (filled ? `<rect width="100%" height="100%" fill="black"/>` : '') +
    scene.surfaces.filter(s => !onlyIDs || onlyIDs.includes(s.id) || s.kind === 'mask').map((s, i) => surfaceMarkup(animateSurface(s, 0), `surface-${i}`, filled)).join(''));
}

/** An overview separates artboards instead of stacking unrelated scenes at (0,0). */
export function mappingSvg(show: MapShow): string {
  let y = 0;
  const scenes = show.scenes.map((scene, si) => {
    const size = sceneSize(show, scene), top = y; y += size.height + 48;
    return `<g id="scene-${si}" data-scene-id="${xml(scene.id)}" transform="translate(0 ${top})"><title>${xml(scene.name)}</title><svg width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" overflow="hidden">` +
      scene.surfaces.map((s, i) => surfaceMarkup(animateSurface(s, 0), `scene-${si}-surface-${i}`)).join('') + '</svg></g>';
  });
  return svgDocument(Math.max(1, ...show.scenes.map(s => sceneSize(show, s).width)), Math.max(1, y - 48), scenes.join(''));
}
