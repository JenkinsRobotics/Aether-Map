import type { Point, Surface } from "./document";
import { animateSurface, type SurfaceMotionContext } from "./features/animation";
import { boundsOf, remapLayerBetweenBounds, rotateLayerAround, setLayerBounds, type Bounds } from "./layer-transform";
import { translateSurface, type SurfaceGeometry } from "./surface-interaction";

export interface GroupGeometryChange { id: string; geometry: SurfaceGeometry }

/** The one selection outline and snap target for a folder of mapped faces. */
export function groupBounds(members: readonly Surface[], timeS: number, context?: SurfaceMotionContext): Bounds | null {
  if (!members.length) return null;
  return boundsOf(members.flatMap(surface => animateSurface(surface, timeS, context).corners));
}

/** Translate every face from the same pointer-down snapshot, preserving the
 * existing animation-aware transform math and shared edge positions. */
export function translatedGroupGeometry(members: readonly Surface[], delta: Point, timeS: number, context?: SurfaceMotionContext): GroupGeometryChange[] {
  const [dx, dy] = delta.map(Math.round) as Point;
  return members.map(surface => {
    // A static compound starts with literally shared point tuples. Direct
    // translation keeps those edges numerically identical across every face.
    if (!Object.values(surface.animation ?? {}).some(track => track?.length) && !Object.keys(surface.modulation ?? {}).length) {
      return { id: surface.id, geometry: translateSurface(surface, [dx, dy]) };
    }
    const bounds = boundsOf(animateSurface(surface, timeS, context).corners);
    return { id: surface.id, geometry: setLayerBounds(surface,
      { ...bounds, x: bounds.x + dx, y: bounds.y + dy }, timeS, context) };
  });
}

/** Resize every face through the compound's one selection frame. */
export function resizedGroupGeometry(members: readonly Surface[], next: Bounds, timeS: number, context?: SurfaceMotionContext): GroupGeometryChange[] {
  const from = groupBounds(members, timeS, context);
  if (!from) return [];
  return members.map(surface => ({
    id: surface.id,
    geometry: remapLayerBetweenBounds(surface, from, next, timeS, context),
  }));
}

/** Rotate every face around the centre of the compound selection. */
export function rotatedGroupGeometry(members: readonly Surface[], degrees: number, timeS: number, context?: SurfaceMotionContext): GroupGeometryChange[] {
  const bounds = groupBounds(members, timeS, context);
  if (!bounds) return [];
  const pivot: Point = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  return members.map(surface => ({
    id: surface.id,
    geometry: rotateLayerAround(surface, pivot, degrees, timeS, context),
  }));
}

/** Apply one whole-group edit; a locked or changed member blocks a partial move. */
export function applyGroupGeometry(list: Surface[], folder: string, changes: readonly GroupGeometryChange[]): Surface[] {
  const members = list.filter(surface => surface.folder === folder);
  const geometry = new Map(changes.map(change => [change.id, change.geometry]));
  if (!members.length || members.some(surface => surface.locked || !geometry.has(surface.id)) ||
      members.length !== geometry.size) return list;
  return list.map(surface => surface.folder === folder
    ? { ...surface, ...geometry.get(surface.id)! } : surface);
}
