import type { Point, Quad } from "./document";

/**
 * Planar homography, row-major: [a, b, c, d, e, f, g, h, 1] where
 *
 *   X = (a·x + b·y + c) / (g·x + h·y + 1)
 *   Y = (d·x + e·y + f) / (g·x + h·y + 1)
 *
 * This is the whole of the warp. A quad projected onto a flat surface is a
 * homography; anything that interpolates affinely across two triangles gets it
 * wrong and creases along the diagonal.
 */
export type Homography = number[];

/**
 * Solve the homography carrying the four `src` corners onto the four `dst`
 * corners. Eight unknowns, eight equations, Gaussian elimination with partial
 * pivoting.
 */
export function solveHomography(src: Quad, dst: Quad): Homography {
  const a: number[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 8; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) {
      throw new Error(
        "Cannot solve a degenerate quad: at least three corners are collinear or coincident.",
      );
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const lead = a[col][col];
    for (let k = col; k < 9; k += 1) a[col][k] /= lead;

    for (let row = 0; row < 8; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      if (factor === 0) continue;
      for (let k = col; k < 9; k += 1) a[row][k] -= factor * a[col][k];
    }
  }

  const h = a.map((row) => row[8]);
  h.push(1);
  if (h.some((value) => !Number.isFinite(value))) {
    throw new Error("Cannot solve a degenerate quad: the solution diverged.");
  }
  return h;
}

/** Apply a homography to a single point. */
export function project(h: Homography, p: Point): Point {
  const [x, y] = p;
  const w = h[6] * x + h[7] * y + 1;
  return [
    (h[0] * x + h[1] * y + h[2]) / w,
    (h[3] * x + h[4] * y + h[5]) / w,
  ];
}

/**
 * Emit the homography as a CSS `matrix3d`, which is column-major and carries
 * the projective terms in the w row. Requires `transform-origin: 0 0` on the
 * element; the browser then does the perspective divide per pixel, in
 * hardware, correctly.
 */
export function cssMatrix3d(h: Homography, preferAffine = false): string {
  // Flat editing planes are affine. Avoid a 3D compositing layer that can
  // rasterize text at source size and magnify the cached bitmap on zoom.
  if (preferAffine && Math.abs(h[6]) < 1e-12 && Math.abs(h[7]) < 1e-12) return `matrix(${[h[0],h[3],h[1],h[4],h[2],h[5]].join(',')})`;
  const m = [
    h[0], h[3], 0, h[6],
    h[1], h[4], 0, h[7],
    0, 0, 1, 0,
    h[2], h[5], 0, 1,
  ];
  return `matrix3d(${m.join(",")})`;
}

/** The CSS `clip-path` polygon for a quad or mask, in output-space pixels. */
export function cssPolygon(points: Point[]): string {
  return `polygon(${points.map(([x, y]) => `${x}px ${y}px`).join(", ")})`;
}
