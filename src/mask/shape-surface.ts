import { pathBounds, pathContours, samplePath, polygonArea, type SketchPath } from '@aether/sketch';
import { newSurface, type Point, type Quad, type Surface } from "../document";

/**
 * A closed sketch profile becomes a surface — the way a closed sketch becomes
 * a feature in CAD.
 *
 * The profile's bounding box is the warp quad: four corners, because a
 * perspective warp is a homography and a homography has exactly four. The
 * profile itself is the outline that clips the picture to the shape. For a
 * rectangle the two coincide, so there is no separate outline at all.
 *
 * A cutout is the same thing filled black and layered above: a projector
 * masks by projecting nothing, so a black surface *is* the mask. No
 * subtractive geometry, and the layer order already says what is on top.
 */
const CUTOUT_FILL = "#000000";

export function boundingQuad(shape: Point[]): Quad {
  const xs = shape.map((p) => p[0]);
  const ys = shape.map((p) => p[1]);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
}

/** True when the shape is its own bounding box: an axis-aligned rectangle. */
export function isAxisAlignedRect(shape: Point[]): boolean {
  if (shape.length !== 4) return false;
  const quad = boundingQuad(shape);
  const onCorner = (p: Point) => quad.some((c) => c[0] === p[0] && c[1] === p[1]);
  return shape.every(onCorner) && new Set(shape.map((p) => p.join(","))).size === 4;
}

export function surfaceFromShape(
  shape: Point[],
  output: { width: number; height: number },
  index: number,
  cutout: boolean,
): Surface {
  const corners = boundingQuad(shape);
  const width = corners[1][0] - corners[0][0];
  const height = corners[3][1] - corners[0][1];
  const base = newSurface(output, index);
  return {
    ...base,
    ...(cutout ? { kind: "mask" as const } : {}),
    name: cutout ? `Cutout ${index + 1}` : `Surface ${index + 1}`,
    corners,
    // The source box is the shape's own size, so the unwarped picture fills it.
    source: { mediaId: null, rect: [0, 0, width, height], ...(cutout ? { fill: CUTOUT_FILL } : {}) },
    masks: isAxisAlignedRect(shape) ? [] : [shape],
  };
}

/** Retain authored paths and their node behavior; the warp quad encloses exact cubic extrema. */
export function surfaceFromPath(path: SketchPath, output: { width: number; height: number }, index: number, cutout: boolean): Surface {
  if (!path.closed) throw new Error('A projection surface requires a closed outline.');
  if(pathContours(path).some(c=>samplePath(c).length<3||Math.abs(polygonArea(samplePath(c)))<1e-9))throw Error("A projection contour requires an area.");
  const base = surfaceFromShape(path.points, output, index, cutout), bounds = pathBounds([path]);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) throw new Error('A projection surface requires an area.');
  const { x, y, width, height } = bounds;
  const contours=pathContours(path);
  if(contours.some(c=>!c.closed)) throw Error("All surface contours must be closed.");
  const curved = path.curves?.some(Boolean), masks = contours.length>1 ? contours.map(c=>c.points) : curved ? [path.points] : base.masks;
  return { ...base, corners: [[x, y], [x + width, y], [x + width, y + height], [x, y + height]],
    source: { ...base.source, rect: [0, 0, width, height] }, masks,
    ...(masks.length ? { maskFillRule: path.fillRule ?? "nonzero", maskCurves: contours.map(c=>c.curves??c.points.map(()=>null)), maskNodeModes: contours.map(c=>c.nodeModes??c.points.map(()=>"corner" as const)) } : {}) };
}
