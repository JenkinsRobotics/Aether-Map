import type { Point, Quad, Surface } from "./document";

/**
 * A mask is an output-space polygon that clips a surface — how you keep a beam
 * off a window, a doorway, or a neighbour's wall.
 */

/** A starting mask: the surface's own quad, inset so its handles are grabbable. */
export function defaultMask(corners: Quad): Point[] {
  const cx = corners.reduce((sum, p) => sum + p[0], 0) / 4;
  const cy = corners.reduce((sum, p) => sum + p[1], 0) / 4;
  return corners.map(([x, y]) => [
    Math.round(x + (cx - x) * 0.15),
    Math.round(y + (cy - y) * 0.15),
  ]) as Point[];
}

/** Split the longest edge, so "add point" puts the new handle where there is
 *  the most room to shape rather than always at the end. */
export function addMaskPoint(mask: Point[]): Point[] {
  if (mask.length < 2) return mask;
  let longest = 0;
  let best = -1;
  for (let index = 0; index < mask.length; index += 1) {
    const from = mask[index];
    const to = mask[(index + 1) % mask.length];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (length > longest) {
      longest = length;
      best = index;
    }
  }
  if (best < 0) return mask;
  const from = mask[best];
  const to = mask[(best + 1) % mask.length];
  const midpoint: Point = [
    Math.round((from[0] + to[0]) / 2),
    Math.round((from[1] + to[1]) / 2),
  ];
  return [...mask.slice(0, best + 1), midpoint, ...mask.slice(best + 1)];
}

/** A polygon needs three points; below that, drop the mask entirely. */
export function removeMaskPoint(mask: Point[], index: number): Point[] | null {
  if (mask.length <= 3) return null;
  return mask.filter((_, at) => at !== index);
}

export function hasMask(surface: Surface): boolean {
  return surface.masks.some((shape) => shape.length >= 3);
}

/** Nearest closed-polygon edge in canvas pixels; the fraction also maps to authored geometry. */
export function nearestMaskEdge(shape: Point[], point: Point, tolerance: number): { edge: number; fraction: number } | null {
  let best: { edge: number; fraction: number } | null = null, distance = tolerance;
  shape.forEach((a, edge) => {
    const b = shape[(edge + 1) % shape.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
    if (!length2) return;
    const fraction = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2));
    // Do not create coincident vertices by double-clicking an existing node.
    if (fraction <= .001 || fraction >= .999) return;
    const gap = Math.hypot(point[0] - a[0] - fraction * dx, point[1] - a[1] - fraction * dy);
    if (gap <= distance) { distance = gap; best = { edge, fraction }; }
  });
  return best;
}
export function insertMaskPoint(shape: Point[], edge: number, fraction: number): Point[] {
  const a = shape[edge], b = shape[(edge + 1) % shape.length];
  if (!a || !b) return shape;
  const point: Point = [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])];
  return [...shape.slice(0, edge + 1), point, ...shape.slice(edge + 1)];
}

/** Replace one vertex with a tangent quadratic arc. The cut-back distance is
 * measured along each adjacent edge, capped at half either edge. Sampling to
 * a 0.2 scene-pixel target (bounded to 512 segments) keeps the mask/clip/export contract:
 * every renderer and saved document receives exactly the same outline. */
export function roundMaskPoint(shape: Point[], index: number, distancePx: number): Point[] {
  if (shape.length < 3 || !Number.isFinite(distancePx) || distancePx <= 0 || !shape[index]) return shape;
  const p = shape[index], prev = shape[(index + shape.length - 1) % shape.length], next = shape[(index + 1) % shape.length];
  const a = Math.hypot(prev[0] - p[0], prev[1] - p[1]), b = Math.hypot(next[0] - p[0], next[1] - p[1]);
  if (a < 1e-6 || b < 1e-6) return shape;
  const cross = (prev[0] - p[0]) * (next[1] - p[1]) - (prev[1] - p[1]) * (next[0] - p[0]);
  if (Math.abs(cross / (a * b)) < 1e-6) return shape;
  const distance = Math.min(distancePx, a / 2, b / 2);
  const start: Point = [p[0] + (prev[0] - p[0]) * distance / a, p[1] + (prev[1] - p[1]) * distance / a];
  const end: Point = [p[0] + (next[0] - p[0]) * distance / b, p[1] + (next[1] - p[1]) * distance / b];
  const curvature = Math.hypot(start[0] - 2 * p[0] + end[0], start[1] - 2 * p[1] + end[1]);
  const steps = Math.max(2, Math.min(512, Math.ceil(Math.sqrt(curvature / .8))));
  const arc = Array.from({ length: steps + 1 }, (_, i): Point => {
    const t = i / steps, u = 1 - t;
    return [u * u * start[0] + 2 * u * t * p[0] + t * t * end[0], u * u * start[1] + 2 * u * t * p[1] + t * t * end[1]];
  });
  return [...shape.slice(0, index), ...arc, ...shape.slice(index + 1)];
}
