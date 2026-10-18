import type { Point, Surface } from "../document";
import { regularPolygon, resizeRegularPolygon } from "./geometry";

/** Replace only the polygon outline, leaving its warp quad and content intact. */
export function polygonSidesPatch(surface: Surface, sides: number): Pick<Surface, "polygonSides" | "masks" | "maskCurves"> {
  const count = Math.max(3, Math.min(64, Math.floor(sides)));
  const existing = surface.polygonSides && surface.masks[0];
  let outline: Point[];
  if (existing) outline = resizeRegularPolygon(existing, count);
  else {
    const xs = surface.corners.map(([x]) => x);
    const ys = surface.corners.map(([, y]) => y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const radius = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
    outline = regularPolygon([cx, cy], [cx + radius, cy], count);
  }
  return { maskCurves: undefined, polygonSides: count, masks: existing ? [outline, ...surface.masks.slice(1)] : [outline] };
}
