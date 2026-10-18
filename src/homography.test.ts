import { describe, expect, it } from "vitest";
import { cssMatrix3d, project, solveHomography } from "./homography";
import type { Quad } from "./document";

const UNIT: Quad = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

function expectQuadsClose(actual: Quad, expected: Quad, epsilon = 1e-9) {
  for (let i = 0; i < 4; i += 1) {
    expect(actual[i][0]).toBeCloseTo(expected[i][0], 6);
    expect(actual[i][1]).toBeCloseTo(expected[i][1], 6);
  }
  void epsilon;
}

function projectQuad(h: number[], quad: Quad): Quad {
  return quad.map((p) => project(h, p)) as Quad;
}

describe("solveHomography", () => {
  it("maps every source corner onto its destination corner", () => {
    // The test that matters: an arbitrary, deliberately non-affine quad.
    const dst: Quad = [
      [120, 80],
      [900, 64],
      [912, 700],
      [110, 684],
    ];
    const src: Quad = [
      [0, 0],
      [1920, 0],
      [1920, 1080],
      [0, 1080],
    ];

    expectQuadsClose(projectQuad(solveHomography(src, dst), src), dst);
  });

  it("returns the identity transform when source and destination match", () => {
    const h = solveHomography(UNIT, UNIT);
    expectQuadsClose(projectQuad(h, UNIT), UNIT);
    expect(h[6]).toBeCloseTo(0, 9);
    expect(h[7]).toBeCloseTo(0, 9);
  });

  it("stays exact for a pure translation and scale", () => {
    const dst: Quad = [
      [10, 20],
      [110, 20],
      [110, 70],
      [10, 70],
    ];
    const h = solveHomography(UNIT, dst);
    expect(project(h, [0.5, 0.5])).toEqual([
      expect.closeTo(60, 6),
      expect.closeTo(45, 6),
    ]);
  });

  it("is genuinely projective — the centre does not land on the centroid", () => {
    // An affine transform (what a two-triangle mesh gives you) would put the
    // source centre exactly on the average of the four corners. A correct
    // perspective warp does not. This is the creased-diagonal bug, caught.
    const dst: Quad = [
      [0, 0],
      [1000, 200],
      [1000, 600],
      [0, 1000],
    ];
    const centre = project(solveHomography(UNIT, dst), [0.5, 0.5]);
    const centroidY = (0 + 200 + 600 + 1000) / 4;
    expect(Math.abs(centre[1] - centroidY)).toBeGreaterThan(1);
  });

  it("throws on a degenerate quad rather than emitting a silent NaN", () => {
    const collapsed: Quad = [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ];
    expect(() => solveHomography(UNIT, collapsed)).toThrow(/degenerate/i);
  });
});

describe("cssMatrix3d", () => {
  it("emits sixteen column-major components", () => {
    const value = cssMatrix3d(solveHomography(UNIT, UNIT));
    expect(value.startsWith("matrix3d(")).toBe(true);
    expect(value.slice("matrix3d(".length, -1).split(",")).toHaveLength(16);
  });

  it("places the projective terms in the w row where CSS expects them", () => {
    const dst: Quad = [
      [0, 0],
      [100, 10],
      [100, 90],
      [0, 100],
    ];
    const h = solveHomography(UNIT, dst);
    const m = cssMatrix3d(h)
      .slice("matrix3d(".length, -1)
      .split(",")
      .map(Number);
    expect(m[3]).toBeCloseTo(h[6], 12);
    expect(m[7]).toBeCloseTo(h[7], 12);
    expect(m[15]).toBe(1);
  });
});
