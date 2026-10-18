import { nearestPoint, handlePoint, resizeBounds as sharedResizeBounds } from '@aether/sketch';
import { type Point, type Quad, type Surface } from './document';
import { animateSurface, featureTransformAt, type SurfaceMotionContext } from './features/animation';
import type { SurfaceGeometry } from './surface-interaction';
import { mapMaskCurves } from './mask/curves';

export interface Bounds { x: number; y: number; width: number; height: number }
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export interface SnapGuide { axis: 0 | 1; position: number }
export function boundsOf(points: Point[]): Bounds {
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]));
  return { x, y, width: Math.max(...points.map(p => p[0])) - x, height: Math.max(...points.map(p => p[1])) - y };
}
export { handlePoint } from '@aether/sketch';
export const resizeBounds = (b: Bounds, h: ResizeHandle, delta: Point, aspect: boolean) => sharedResizeBounds(b, h, delta, aspect, 1);
const mapGeometry = (g: SurfaceGeometry, fn: (p: Point) => Point): SurfaceGeometry => ({ corners: g.corners.map(fn) as Quad, masks: g.masks.map(s => s.map(fn)),
  ...(g.maskCurves ? { maskCurves: mapMaskCurves(g.maskCurves, fn) } : {}) });
/** Undo the evaluated transform using the NEW centroid, preserving all animation keys. */
export function geometryFromVisible(surface: Surface, geometry: SurfaceGeometry, timeS: number, context?: SurfaceMotionContext): SurfaceGeometry {
  const t = featureTransformAt(surface, timeS, context);
  if (Math.abs(t.scaleX * t.scaleY) < 1e-8) return { corners: surface.corners, masks: surface.masks, maskCurves: surface.maskCurves };
  const pivot: Point = [geometry.corners.reduce((sum, p) => sum + p[0], 0) / 4 - t.xPx, geometry.corners.reduce((sum, p) => sum + p[1], 0) / 4 - t.yPx];
  const r = t.rotationDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return mapGeometry(geometry, p => {
    const x = p[0] - pivot[0] - t.xPx, y = p[1] - pivot[1] - t.yPx;
    return [pivot[0] + (c * x + s * y) / t.scaleX, pivot[1] + (-s * x + c * y) / t.scaleY];
  });
}
export function setLayerBounds(surface: Surface, next: Bounds, timeS: number, context?: SurfaceMotionContext): SurfaceGeometry {
  const visible = animateSurface(surface, timeS, context), b = boundsOf(visible.corners);
  if (b.width < 1e-8 || b.height < 1e-8) return surface;
  return geometryFromVisible(surface, mapGeometry(visible, p => [next.x + (p[0] - b.x) * next.width / b.width, next.y + (p[1] - b.y) * next.height / b.height]), timeS, context);
}
/** Apply one shared bounds transform to a layer. All members of a compound use
 * the same source/target pair, so coincident face vertices remain coincident. */
export function remapLayerBetweenBounds(surface: Surface, from: Bounds, next: Bounds, timeS: number, context?: SurfaceMotionContext): SurfaceGeometry {
  if (from.width < 1e-8 || from.height < 1e-8) return surface;
  const visible = animateSurface(surface, timeS, context);
  return geometryFromVisible(surface, mapGeometry(visible, ([x, y]) => [
    next.x + (x - from.x) * next.width / from.width,
    next.y + (y - from.y) * next.height / from.height,
  ]), timeS, context);
}
export function rotateLayer(surface: Surface, degrees: number, timeS: number, context?: SurfaceMotionContext): SurfaceGeometry {
  const visible = animateSurface(surface, timeS, context), b = boundsOf(visible.corners);
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2, r = degrees * Math.PI / 180;
  return geometryFromVisible(surface, mapGeometry(visible, ([x, y]) => [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)]), timeS, context);
}
/** Rotate one layer around a group pivot rather than its own centre. */
export function rotateLayerAround(surface: Surface, pivot: Point, degrees: number, timeS: number, context?: SurfaceMotionContext): SurfaceGeometry {
  const visible = animateSurface(surface, timeS, context);
  const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return geometryFromVisible(surface, mapGeometry(visible, ([x, y]) => [
    pivot[0] + (x - pivot[0]) * c - (y - pivot[1]) * s,
    pivot[1] + (x - pivot[0]) * s + (y - pivot[1]) * c,
  ]), timeS, context);
}
const anchors = (b: Bounds, axis: 0 | 1) => axis === 0 ? [b.x, b.x + b.width / 2, b.x + b.width] : [b.y, b.y + b.height / 2, b.y + b.height];

/** Mirror the evaluated geometry, including every clipping profile. A shared
 * pivot lets compound faces reflect together without opening their seams. */
export function flipLayer(surface: Surface, axis: 0 | 1, timeS: number, pivot?: Point, context?: SurfaceMotionContext): SurfaceGeometry {
  const visible = animateSurface(surface, timeS, context), b = boundsOf(visible.corners);
  const center = pivot ?? [b.x + b.width / 2, b.y + b.height / 2];
  return geometryFromVisible(surface, mapGeometry(visible, p => axis === 0
    ? [2 * center[0] - p[0], p[1]] : [p[0], 2 * center[1] - p[1]]), timeS, context);
}

/** Snap a node to one real vertex, not an accidental intersection of two axes. */
export function snapVertex(point: Point, targets: Point[], tolerance: number): Point | null {
  // Preserve Map's last-target tie priority while using the shared distance test.
  return nearestPoint(point, [...targets].reverse().map(point => ({ point })), tolerance)?.point ?? null;
}
/** Nearest scene/layer edge or center, measured in screen pixels by the caller. */
export function snapBounds(b: Bounds, targets: Bounds[], tolerance: number, handle?: ResizeHandle): { delta: Point; guides: SnapGuide[] } {
  const delta: Point = [0, 0], guides: SnapGuide[] = [];
  for (const axis of [0, 1] as const) {
    if (handle && (axis === 0 ? !/[we]/.test(handle) : !/[ns]/.test(handle))) continue;
    const points = handle ? [handlePoint(b, handle)[axis]] : anchors(b, axis);
    let best = tolerance + 1, guide: number | undefined;
    for (const target of targets) for (const edge of anchors(target, axis)) for (const point of points) {
      const distance = edge - point;
      if (Math.abs(distance) <= tolerance && Math.abs(distance) < best) { best = Math.abs(distance); delta[axis] = distance; guide = edge; }
    }
    if (guide !== undefined) guides.push({ axis, position: guide });
  }
  return { delta, guides };
}
