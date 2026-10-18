import { describe, expect, it } from "vitest";
import {
  closesOnStart,
  ellipsePolygon,
  isUsableShape,
  polygonArea,
  rectPolygon,
  regularPolygon,
  resizeRegularPolygon,
  simplify,
} from "./geometry";
import type { Point } from "../document";

describe("rectPolygon", () => {
  it("is the same rectangle whichever corner you start from", () => {
    const a = rectPolygon([10, 10], [110, 60]);
    const b = rectPolygon([110, 60], [10, 10]);
    expect(a).toEqual(b);
    expect(a).toEqual([
      [10, 10],
      [110, 10],
      [110, 60],
      [10, 60],
    ]);
  });
});

describe("ellipsePolygon", () => {
  it("fills the bounding box and closes back on itself", () => {
    const points = ellipsePolygon([0, 0], [200, 100], 48);
    expect(points).toHaveLength(48);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    expect(Math.max(...xs)).toBe(200);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...ys)).toBe(100);
    expect(Math.min(...ys)).toBe(0);
  });

  it("never drops below a triangle", () => {
    expect(ellipsePolygon([0, 0], [10, 10], 1)).toHaveLength(3);
  });
});

describe("regularPolygon", () => {
  it("puts one vertex exactly on the dragged edge point", () => {
    const points = regularPolygon([100, 100], [160, 100], 6);
    expect(points[0]).toEqual([160, 100]);
    expect(points).toHaveLength(6);
  });

  it("keeps every vertex at the same radius, to the pixel", () => {
    // Vertices land on whole output pixels, so the radius may vary by the
    // rounding of each coordinate — under a pixel, never more.
    const points = regularPolygon([0, 0], [0, 50], 5);
    for (const p of points) expect(Math.abs(Math.hypot(p[0], p[1]) - 50)).toBeLessThan(1);
  });
});

describe("resizeRegularPolygon", () => {
  it("changes sides while retaining the centre, radius and first-vertex direction", () => {
    const original = regularPolygon([120, 90], [155, 125], 6);
    const changed = resizeRegularPolygon(original, 9);
    expect(changed).toHaveLength(9);
    const centroid = (points: Point[]): Point => [
      points.reduce((sum, point) => sum + point[0], 0) / points.length,
      points.reduce((sum, point) => sum + point[1], 0) / points.length,
    ];
    expect(centroid(changed)[0]).toBeCloseTo(centroid(original)[0], 0);
    expect(centroid(changed)[1]).toBeCloseTo(centroid(original)[1], 0);
    expect(changed[0]).toEqual(original[0]);
  });
});

describe("simplify", () => {
  it("keeps the corners of a square drawn with many intermediate points", () => {
    const stroke: Point[] = [];
    for (let i = 0; i <= 100; i += 2) stroke.push([i, 0]);
    for (let i = 0; i <= 100; i += 2) stroke.push([100, i]);
    for (let i = 100; i >= 0; i -= 2) stroke.push([i, 100]);
    for (let i = 100; i >= 0; i -= 2) stroke.push([0, i]);
    const simplified = simplify(stroke, 2);
    expect(simplified.length).toBeLessThan(8);
    expect(simplified).toContainEqual([100, 0]);
    expect(simplified).toContainEqual([100, 100]);
    expect(simplified).toContainEqual([0, 100]);
  });

  it("keeps a genuine bump that exceeds the tolerance", () => {
    const stroke: Point[] = [
      [0, 0],
      [50, 0],
      [60, 30],
      [70, 0],
      [120, 0],
    ];
    expect(simplify(stroke, 5)).toContainEqual([60, 30]);
  });

  it("leaves two points and zero tolerance alone", () => {
    expect(simplify([[0, 0], [9, 9]], 5)).toHaveLength(2);
    expect(simplify([[0, 0], [1, 0], [2, 0]], 0)).toHaveLength(3);
  });
});

describe("closesOnStart", () => {
  it("closes when the pointer returns near the first point, once there is a shape", () => {
    const points: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
    ];
    expect(closesOnStart(points, [4, 3], 8)).toBe(true);
    expect(closesOnStart(points, [30, 30], 8)).toBe(false);
  });

  it("will not close a two-point line into nothing", () => {
    expect(closesOnStart([[0, 0], [10, 0]], [0, 0], 8)).toBe(false);
  });
});

describe("shape sanity", () => {
  it("rejects a slip of the pointer as a mask", () => {
    expect(isUsableShape([[0, 0], [2, 0], [2, 2]])).toBe(false);
    expect(isUsableShape(rectPolygon([0, 0], [40, 40]))).toBe(true);
  });

  it("measures area regardless of winding", () => {
    const square = rectPolygon([0, 0], [10, 10]);
    expect(Math.abs(polygonArea(square))).toBe(100);
    expect(Math.abs(polygonArea([...square].reverse()))).toBe(100);
  });
});
