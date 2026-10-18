import type { Point } from '../document';
import * as sketch from '@aether/sketch';
export { closesOnStart, polygonArea, isUsableShape } from '@aether/sketch';
// Map's pixel-quantization policy is an adapter, never CAD's geometry policy.
export const rectPolygon = (a: Point, b: Point) => sketch.rectPolygon(a, b, 1);
export const ellipsePolygon = (a: Point, b: Point, segments = 48) => sketch.ellipsePolygon(a, b, segments, 1);
export const regularPolygon = (a: Point, b: Point, sides: number) => sketch.regularPolygon(a, b, sides, 1);
export const resizeRegularPolygon = (points: Point[], sides: number) => sketch.resizeRegularPolygon(points, sides, 1);
export const simplify = (points: Point[], tolerance: number) => sketch.simplify(points, tolerance, 1);

/** Older Polygon-tool surfaces saved only their six-point outline. */
export function isLegacyRegularHexagon(points: Point[]): boolean {
  if (points.length !== 6) return false;
  const cx = points.reduce((sum, point) => sum + point[0], 0) / 6;
  const cy = points.reduce((sum, point) => sum + point[1], 0) / 6;
  const radii = points.map(([x, y]) => Math.hypot(x - cx, y - cy));
  const radius = radii.reduce((sum, value) => sum + value, 0) / 6;
  if (radius < 3 || radii.some((value) => Math.abs(value - radius) > 1.5)) return false;
  const angles = points.map(([x, y]) => Math.atan2(y - cy, x - cx));
  return angles.every((angle, index) => {
    const next = angles[(index + 1) % 6];
    const sweep = ((next - angle) + Math.PI * 2) % (Math.PI * 2);
    return Math.abs(sweep - Math.PI / 3) < Math.max(0.05, 1.5 / radius);
  });
}
