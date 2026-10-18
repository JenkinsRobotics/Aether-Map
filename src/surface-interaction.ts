import { groupSurfaces, nextId, type Point, type Quad, type Surface } from "./document";
import { animateSurface, type SurfaceMotionContext } from "./features/animation";
import { pointInSurfaceMask } from "./mask/clip";
import { mapMaskCurves } from './mask/curves';

export type SurfaceGeometry = Pick<Surface, "corners" | "masks" | "maskCurves">;

/** Both sets of points are absolute scene coordinates; translate them atomically. */
export function translateSurface(surface: SurfaceGeometry, [dx, dy]: Point): SurfaceGeometry {
  const translate = ([x, y]: Point): Point => [x + dx, y + dy];
  return { corners: surface.corners.map(translate) as Quad, masks: surface.masks.map((shape) => shape.map(translate)),
    ...(surface.maskCurves ? { maskCurves: mapMaskCurves(surface.maskCurves, translate) } : {}) };
}

function contains(points: Point[], [x, y]: Point): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j], [bx, by] = points[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-6 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return true;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Pick actual authoring shapes, topmost first. Hidden/locked layers do not intercept clicks. */
export function surfacesAt(surfaces: Surface[], point: Point, timeS: number, context?: SurfaceMotionContext): Surface[] {
  return [...surfaces].reverse().filter((surface) => {
    if (!surface.enabled || surface.locked) return false;
    const visible = animateSurface(surface, timeS, context);
    return contains(visible.corners, point) && pointInSurfaceMask(visible, point);
  });
}

export function duplicateSurface(source: Surface): Surface {
  const copy = structuredClone(source);
  delete copy.cornerWelds;
  copy.id = nextId("s"); copy.name = `${source.name} copy`; copy.locked = false;
  copy.cues.forEach((cue) => { cue.id = nextId("c"); });
  copy.clips.forEach((clip) => { clip.id = nextId("k"); });
  Object.values(copy.animation ?? {}).forEach((track) => track?.forEach((key) => { key.id = nextId("kf"); }));
  return { ...copy, ...translateSurface(copy, [20, 20]) };
}

/** UI order is topmost first, storage/painting order is the reverse. */
export function moveSurface(list: Surface[], id: string, targetID: string, position: "before" | "after"): Surface[] {
  const source = list.find((surface) => surface.id === id);
  const target = list.find((surface) => surface.id === targetID);
  if (!source || source.locked || id === targetID || !target) return list;
  // Dropping beside a layer also adopts that layer's folder, so a drag is the
  // one gesture that both reorders and moves a layer in or out of a folder.
  const moved = target.folder === source.folder ? source : withFolder(source, target.folder);
  const next = list.filter((surface) => surface.id !== id);
  next.splice(next.findIndex((surface) => surface.id === targetID) + (position === "before" ? 1 : 0), 0, moved);
  return groupSurfaces(next);
}

function withFolder(surface: Surface, folder: string | undefined): Surface {
  // Moving a face into an ordinary folder stops it claiming membership in its
  // former Cube/Box. Renaming a whole compound folder is handled separately.
  const { folder: _dropped, groupShape: _groupShape, ...rest } = surface;
  return folder ? { ...rest, folder, groupShape: null } : rest;
}

/**
 * Drops a layer into a folder, or back out to the root with no folder. Joining
 * an existing folder puts the layer at the top of that run — dropping onto a
 * folder row reads as "put this in here". Forming a new folder, or leaving one,
 * keeps the layer exactly where it paints: grouping a layer must never silently
 * change what covers what. Locked layers do not move.
 */
export function setSurfaceFolder(list: Surface[], id: string, folder: string | undefined): Surface[] {
  const source = list.find((surface) => surface.id === id);
  if (!source || source.locked || (source.folder ?? undefined) === folder) return list;
  const moved = withFolder(source, folder);
  const rest = list.filter((surface) => surface.id !== id);
  // Storage order is bottom-up, so the top of a folder's run is its last member.
  const last = folder ? rest.map((surface) => surface.folder).lastIndexOf(folder) : -1;
  if (last < 0) return groupSurfaces(list.map((surface) => surface.id === id ? moved : surface));
  rest.splice(last + 1, 0, moved);
  return groupSurfaces(rest);
}

/** Renaming a folder is renaming it on every member; an empty name dissolves it. */
export function renameSurfaceFolder(list: Surface[], from: string, to: string): Surface[] {
  const name = to.trim();
  if (!from || name === from) return list;
  return groupSurfaces(list.map((surface) => surface.folder === from
    ? name ? { ...surface, folder: name } : withFolder(surface, undefined)
    : surface));
}

/** Dissolving keeps the layers and their order; only the grouping goes. */
export function dissolveSurfaceFolder(list: Surface[], folder: string): Surface[] {
  return renameSurfaceFolder(list, folder, "");
}

/** A name no existing folder uses, so "New folder" never silently merges two. */
export function nextFolderName(list: readonly Surface[]): string {
  const used = new Set(list.map((surface) => surface.folder));
  for (let n = 1; ; n += 1) if (!used.has(`Folder ${n}`)) return `Folder ${n}`;
}
