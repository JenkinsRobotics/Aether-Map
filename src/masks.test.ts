import { describe, expect, it } from "vitest";
import { addMaskPoint, defaultMask, removeMaskPoint, nearestMaskEdge, insertMaskPoint, roundMaskPoint } from "./masks";
import type { Point, Quad } from "./document";

const QUAD: Quad = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

describe("defaultMask", () => {
  it("sits inside the surface so its handles are reachable", () => {
    const mask = defaultMask(QUAD);
    expect(mask).toHaveLength(4);
    for (const [x, y] of mask) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(100);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(100);
    }
  });
});

describe("addMaskPoint", () => {
  it("splits the longest edge, not the last one", () => {
    // The 0→1 edge is 200 long; every other edge is shorter.
    const mask: Point[] = [
      [0, 0],
      [200, 0],
      [200, 10],
      [0, 10],
    ];
    const next = addMaskPoint(mask);
    expect(next).toHaveLength(5);
    expect(next[1]).toEqual([100, 0]);
  });

  it("can close around the wrap-around edge", () => {
    const mask: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 400],
    ];
    // The longest edge is the last→first wrap, 400 long.
    expect(addMaskPoint(mask)).toHaveLength(5);
  });

  it("leaves a degenerate mask alone", () => {
    expect(addMaskPoint([[0, 0]])).toHaveLength(1);
  });
});

describe("removeMaskPoint", () => {
  it("removes a point when the polygon can spare it", () => {
    const mask = defaultMask(QUAD);
    expect(removeMaskPoint(mask, 1)).toHaveLength(3);
  });

  it("drops the mask entirely rather than leaving a two-point polygon", () => {
    const triangle: Point[] = [
      [0, 0],
      [10, 0],
      [0, 10],
    ];
    expect(removeMaskPoint(triangle, 0)).toBeNull();
  });
});


describe("edge insertion", () => {
  it("uses the closest edge and preserves fractional placement", () => {
    expect(nearestMaskEdge(QUAD, [35, 2], 5)).toEqual({ edge: 0, fraction: .35 });
    expect(insertMaskPoint(QUAD, 0, .35)).toEqual([[0, 0], [35, 0], ...QUAD.slice(1)]);
    expect(nearestMaskEdge(QUAD, [50, 50], 5)).toBeNull();
    expect(nearestMaskEdge(QUAD, QUAD[0], 5)).toBeNull();
  });
});

describe('individual rounded mask points', () => {
  it('replaces only the chosen corner with a tangent curve and leaves the input untouched', () => {
    const result = roundMaskPoint(QUAD, 0, 20);
    expect(result[0]).toEqual([0, 20]);
    expect(result.at(-4)).toEqual([20, 0]);
    expect(result.slice(-3)).toEqual(QUAD.slice(1));
    expect(result.some(([x, y]) => x > 0 && y > 0 && x < 20 && y < 20)).toBe(true);
    expect(QUAD[0]).toEqual([0, 0]);
    expect(result.every(p => p.every(Number.isFinite))).toBe(true);
  });
  it('caps the trim distance and accepts concave points without changing winding', () => {
    const result = roundMaskPoint(QUAD, 3, 1000);
    expect(result[3]).toEqual([50, 100]);
    expect(result.at(-1)).toEqual([0, 50]);
    const concave: Point[] = [[0, 0], [100, 0], [50, 50], [100, 100], [0, 100]];
    expect(roundMaskPoint(concave, 2, 20).length).toBeGreaterThan(concave.length);
  });
  it('rejects straight, coincident and invalid corners', () => {
    const line: Point[] = [[0, 0], [50, 0], [100, 0], [100, 100]];
    expect(roundMaskPoint(line, 1, 20)).toBe(line);
    expect(roundMaskPoint(QUAD, 9, 20)).toBe(QUAD);
    expect(roundMaskPoint(QUAD, 1, NaN)).toBe(QUAD);
    expect(roundMaskPoint(QUAD, 1, -20)).toBe(QUAD);
  });
});
