import { setNodeMode, movePathControl, setPathEdgeCurve, reversePath, type NodeMode, type SketchPath } from '@aether/sketch';
import { samplePath, replacePathPoints, splitPathEdge, nearestPathEdge } from '@aether/sketch';
export { splitCurve } from '@aether/sketch';
import type { MaskCurve, Point, Surface } from '../document';

export function mapMaskCurves(curves: Surface['maskCurves'], map: (p: Point) => Point): Surface['maskCurves'] {
  return curves?.map(shape => shape.map(c => c ? { c1: map(c.c1), c2: map(c.c2) } : null));
}
export function sampleMask(surface: Pick<Surface, 'masks' | 'maskCurves'>, shape: number): Point[] {
  return samplePath({ points: surface.masks[shape] ?? [], curves: surface.maskCurves?.[shape], closed: true });
}
export function setEdgeCurve(surface: Surface, shape: number, edge: number, curve: MaskCurve | null): Partial<Surface> {
  if (!surface.masks[shape]?.[edge]) return {};
  const maskCurves = surface.masks.map((points, i) => points.map((_, j) => i === shape && j === edge ? curve : surface.maskCurves?.[i]?.[j] ?? null));
  return curve ? { maskCurves, polygonSides: undefined } : pathPatch(surface, shape, setPathEdgeCurve(maskPath(surface, shape), edge, false));
}
export function curveForEdge(surface: Surface, shape: number, edge: number): MaskCurve | null {
  const a = surface.masks[shape]?.[edge], b = surface.masks[shape]?.[(edge + 1) % surface.masks[shape].length];
  if (!a || !b) return null;
  return { c1: [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], c2: [a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3] };
}
/** Vertex edits carry attached handles; topology edits preserve untouched edges. */
export function replaceMaskShape(surface: Surface, shape: number, points: Point[]): Partial<Surface> {
  const masks = shape === surface.masks.length ? [...surface.masks, points] : surface.masks.map((m, i) => i === shape ? points : m);
  const maskCurves = surface.maskCurves?.map((controls, i) => i === shape
    ? replacePathPoints({ points: surface.masks[shape] ?? [], curves: controls, closed: true }, points).curves ?? points.map(() => null)
    : controls);
  const maskNodeModes = surface.maskNodeModes?.map((modes, i) => i === shape ? replacePathPoints(maskPath(surface, shape), points).nodeModes ?? points.map(() => 'corner' as const) : modes);
  return { masks, ...(maskCurves ? { maskCurves } : {}), ...(maskNodeModes ? { maskNodeModes } : {}), polygonSides: undefined };
}
export function readMaskCurves(raw: unknown, masks: Point[][]): Surface['maskCurves'] {
  if (!Array.isArray(raw)) return undefined;
  const point = (v: unknown): v is Point => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n));
  return masks.map((shape, i) => shape.map((_, j) => {
    const c = Array.isArray(raw[i]) ? raw[i][j] : null;
    return c && typeof c === 'object' && point(c.c1) && point(c.c2) ? { c1: c.c1, c2: c.c2 } : null;
  }));
}

/** Split the authored cubic without changing its shape or its other handles. */
export function splitMaskEdge(surface: Surface, shape: number, edge: number, t: number): Partial<Surface> {
  const points = surface.masks[shape] ?? surface.corners;
  const path = { points, curves: surface.maskCurves?.[shape], nodeModes: surface.maskNodeModes?.[shape], closed: true };
  const split = splitPathEdge(path, edge, t);
  if (split === path) return {};
  const masks = surface.masks.length ? surface.masks.map((m, i) => i === shape ? split.points : m) : [split.points];
  return { masks, maskNodeModes: masks.map((m, i) => i === shape ? split.nodeModes! : m.map((_, j) => surface.maskNodeModes?.[i]?.[j] ?? 'corner')), maskCurves: masks.map((m, i) => i === shape ? split.curves! : m.map((_, j) => surface.maskCurves?.[i]?.[j] ?? null)), polygonSides: undefined };
}
/** Sample for hit testing while retaining the edge's parameter for exact splitting. */
export function nearestCurveEdge(surface: Pick<Surface, 'masks' | 'maskCurves'>, shape: number, at: Point, tolerance: number) {
  return nearestPathEdge({ points: surface.masks[shape] ?? [], curves: surface.maskCurves?.[shape], closed: true }, at, tolerance);
}

export function maskPath(surface: Surface, shape: number): SketchPath {
  return { points: surface.masks[shape] ?? [], curves: surface.maskCurves?.[shape], nodeModes: surface.maskNodeModes?.[shape], closed: true };
}
function pathPatch(surface: Surface, shape: number, path: SketchPath): Partial<Surface> {
  return { masks: surface.masks.map((p, i) => i === shape ? path.points : p), maskCurves: surface.masks.map((p, i) => i === shape ? path.curves ?? p.map(() => null) : surface.maskCurves?.[i] ?? p.map(() => null)),
    maskNodeModes: surface.masks.map((p, i) => i === shape ? path.nodeModes ?? p.map(() => 'corner') : surface.maskNodeModes?.[i] ?? p.map(() => 'corner')), polygonSides: undefined };
}
export const setMaskNodeMode = (surface: Surface, shape: number, node: number, mode: NodeMode) => pathPatch(surface, shape, setNodeMode(maskPath(surface, shape), node, mode));
export const moveMaskControl = (surface: Surface, shape: number, edge: number, control: 'c1' | 'c2', point: Point, independent = false) => pathPatch(surface, shape, movePathControl(maskPath(surface, shape), edge, control, point, independent));
export function readMaskNodeModes(raw: unknown, masks: Point[][]): Surface['maskNodeModes'] {
  if (!Array.isArray(raw)) return undefined;
  return masks.map((points, i) => points.map((_, j) => ['corner', 'smooth', 'symmetric'].includes(raw[i]?.[j]) ? raw[i][j] : 'corner'));
}

export const reverseMaskShape = (surface: Surface, shape: number) => pathPatch(surface, shape, reversePath(maskPath(surface, shape)));
