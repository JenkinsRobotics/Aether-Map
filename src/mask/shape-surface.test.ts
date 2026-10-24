import { ellipsePath } from '@aether/sketch';
import { describe, expect, it } from "vitest";
import { boundingQuad, isAxisAlignedRect, surfaceFromShape, surfaceFromPath } from "./shape-surface";
import type { Point } from "../document";

const OUTPUT = { width: 1920, height: 1080 };

describe("a sketch profile becomes a surface", () => {
  it("a rectangle is a plain quad with no separate outline", () => {
    const rect: Point[] = [
      [100, 100],
      [400, 100],
      [400, 300],
      [100, 300],
    ];
    const surface = surfaceFromShape(rect, OUTPUT, 0, false);
    expect(surface.corners).toEqual(rect);
    expect(surface.masks).toEqual([]);
    expect(surface.source.rect).toEqual([0, 0, 300, 200]);
    expect(surface.source.fill).toBeUndefined();
    expect(surface.name).toBe("Surface 1");
  });

  it("any other profile keeps its outline and warps by its bounding box", () => {
    const triangle: Point[] = [
      [200, 100],
      [400, 500],
      [0, 500],
    ];
    const surface = surfaceFromShape(triangle, OUTPUT, 2, false);
    expect(surface.corners).toEqual([
      [0, 100],
      [400, 100],
      [400, 500],
      [0, 500],
    ]);
    expect(surface.masks).toEqual([triangle]);
    expect(surface.source.rect).toEqual([0, 0, 400, 400]);
  });

  it("a cutout is the same surface filled black", () => {
    const surface = surfaceFromShape(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      OUTPUT,
      1,
      true,
    );
    expect(surface.source.fill).toBe("#000000");
    expect(surface.name).toBe("Cutout 2");
  });
});

describe("isAxisAlignedRect", () => {
  it("recognises a rectangle in any corner order", () => {
    expect(
      isAxisAlignedRect([
        [400, 300],
        [100, 300],
        [100, 100],
        [400, 100],
      ]),
    ).toBe(true);
  });

  it("rejects a rotated quad, a triangle, and a collapsed rectangle", () => {
    expect(
      isAxisAlignedRect([
        [100, 0],
        [200, 100],
        [100, 200],
        [0, 100],
      ]),
    ).toBe(false);
    expect(isAxisAlignedRect([[0, 0], [10, 0], [5, 10]])).toBe(false);
    expect(isAxisAlignedRect([[0, 0], [0, 0], [10, 10], [10, 10]])).toBe(false);
  });
});

describe("boundingQuad", () => {
  it("is clockwise from top-left, like every other quad here", () => {
    expect(boundingQuad([[5, 9], [1, 2], [7, 3]])).toEqual([
      [1, 2],
      [7, 2],
      [7, 9],
      [1, 9],
    ]);
  });
});

it('keeps shared ellipse geometry and node modes editable on the surface', () => {
  const path = ellipsePath([100, 100], [500, 300]), s = surfaceFromPath(path, OUTPUT, 0, false);
  expect(s.masks).toEqual([path.points]); expect(s.maskCurves).toEqual([path.curves]);
  expect(s.maskNodeModes).toEqual([path.nodeModes]); expect(s.source.rect).toEqual([0, 0, 400, 200]);
});
it('uses exact cubic extrema for the enclosing projection quad', () => {
  const s = surfaceFromPath({ points: [[0, 0], [100, 0], [100, 20]], closed: true,
    curves: [{ c1: [0, -100], c2: [100, -100] }, null, null] }, OUTPUT, 0, false);
  expect(s.corners).toEqual([[0, -75], [100, -75], [100, 20], [0, 20]]);
  expect(() => surfaceFromPath({ points: [[0, 0], [100, 100]], closed: false }, OUTPUT, 0, false)).toThrow('closed');
});
