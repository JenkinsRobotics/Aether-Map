import { allSurfaces, nextId, surfaceCollection, withSurfaceCollection, type MapShow, type Point, type Quad, type Surface } from './document';
import { animateSurface } from './features/animation';
import { geometryFromVisible } from './layer-transform';

export interface CornerRef { surfaceID: string; index: number }
const same = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-5;
const valid = (r: CornerRef) => Number.isInteger(r.index) && r.index >= 0 && r.index < 4;

export function joinCorners(show: MapShow, a: CornerRef, b: CornerRef): MapShow {
  if (!valid(a) || !valid(b) || a.surfaceID === b.surfaceID) return show;
  const ownerA = surfaceCollection(show, a.surfaceID), ownerB = surfaceCollection(show, b.surfaceID);
  if (!ownerA || !ownerB || ownerA.scene?.id !== ownerB.scene?.id) return show;
  const sa = allSurfaces(show).find(s => s.id === a.surfaceID)!, sb = allSurfaces(show).find(s => s.id === b.surfaceID)!;
  const ids = [sa.cornerWelds?.[a.index], sb.cornerWelds?.[b.index]].filter((v): v is string => Boolean(v));
  const target = animateSurface(sb, 0).corners[b.index];
  const members = ownerA.scene?.surfaces ?? show.unassignedSurfaces;
  if (members.some(s => (s.id === sa.id || s.id === sb.id || s.cornerWelds?.some(w => w && ids.includes(w))) && s.locked)) return show;
  const weld = ids[0] ?? nextId('weld');
  return withSurfaceCollection(show, sa.id, list => list.map(s => {
    const links = [...(s.cornerWelds ?? [null, null, null, null])] as NonNullable<Surface['cornerWelds']>;
    const visible = animateSurface(s, 0), corners = visible.corners.map(p => [...p]) as Quad;
    let changed = false;
    links.forEach((id, i) => {
      if ((s.id === sa.id && i === a.index) || (s.id === sb.id && i === b.index) || (id && ids.includes(id))) {
        links[i] = weld; corners[i] = target; changed = true;
      }
    });
    return changed ? { ...s, ...geometryFromVisible(s, { corners, masks: visible.masks, maskCurves: visible.maskCurves }, 0), cornerWelds: links } : s;
  }));
}

export function detachCorner(show: MapShow, ref: CornerRef): MapShow {
  if (!valid(ref)) return show;
  return withSurfaceCollection(show, ref.surfaceID, list => list.map(s => {
    if (s.id !== ref.surfaceID || s.locked || !s.cornerWelds?.[ref.index]) return s;
    const links = [...s.cornerWelds] as NonNullable<Surface['cornerWelds']>; links[ref.index] = null;
    return { ...s, cornerWelds: links };
  }));
}

/** Document transaction boundary. Welding is authored geometry, not a renderer
 * effect. Scene transfers/deletions drop orphaned links; duplicated IDs in a
 * different scene never connect. Locked peers reject the geometry transaction. */
export function maintainCornerWelds(before: MapShow, next: MapShow): MapShow {
  if (before === next) return next;
  if (!allSurfaces(next).some(s => s.cornerWelds?.some(Boolean))) return next;
  const old = new Map(allSurfaces(before).map(s => [s.id, s]));
  let blocked = false;
  const update = (list: Surface[]): Surface[] => {
    const links = new Map<string, { surface: Surface; index: number }[]>();
    for (const s of list) s.cornerWelds?.forEach((id, index) => {
      // A moved face loses its old connections, even if a destination has a
      // coincident vertex. Whole-group moves retain internal links below.
      if (id) links.set(id, [...(links.get(id) ?? []), { surface: s, index }]);
    });
    const replacements = new Map<string, Point>();
    for (const [id, entries] of links) {
      if (entries.length < 2) continue;
      const proposals: Point[] = [];
      for (const { surface: s, index } of entries) {
        const prior = old.get(s.id), point = animateSurface(s, 0).corners[index];
        if (prior && !same(animateSurface(prior, 0).corners[index], point)) proposals.push(point);
      }
      const desired = proposals[0] ?? animateSurface(entries[0].surface, 0).corners[entries[0].index];
      if (proposals.some(p => !same(p, desired))) { blocked = true; continue; }
      if (entries.some(({ surface: s, index }) => s.locked && !same(animateSurface(s, 0).corners[index], desired))) {
        blocked = true; continue;
      }
      replacements.set(id, desired);
    }
    return list.map(s => {
      if (!s.cornerWelds?.some(Boolean)) return s;
      const ids = s.cornerWelds.map(id => id && (links.get(id)?.length ?? 0) >= 2 ? id : null) as NonNullable<Surface['cornerWelds']>;
      const visible = animateSurface(s, 0), corners = visible.corners.map(p => [...p]) as Quad;
      let moved = false;
      ids.forEach((id, i) => { const p = id && replacements.get(id); if (p && !same(p, corners[i])) { corners[i] = p; moved = true; } });
      const changedLinks = ids.some((v, i) => v !== s.cornerWelds![i]);
      return moved || changedLinks ? { ...s, ...(moved ? geometryFromVisible(s, { corners, masks: visible.masks, maskCurves: visible.maskCurves }, 0) : {}), cornerWelds: ids } : s;
    });
  };
  const scenes = next.scenes.map(scene => ({ ...scene, surfaces: update(scene.surfaces) }));
  const unassignedSurfaces = update(next.unassignedSurfaces);
  return blocked ? before : { ...next, scenes, unassignedSurfaces };
}
