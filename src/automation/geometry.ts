/** Mapping-space geometry edits share the editor's transform and weld transaction. */
import type { MapShow } from '../document';
import { animateSurface, featureTransformAt } from '../features/animation';
import { boundsOf, rotateLayer, setLayerBounds } from '../layer-transform';
import { maintainCornerWelds } from '../corner-welds';

export interface GeometryArguments {
  scene_id?: string; surface_id?: string;
  x_px?: number; y_px?: number; width_px?: number; height_px?: number;
  delta_degrees?: number;
}
const LIMIT = 1_000_000;
function numberIn(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`Geometry values must be finite and between ${min} and ${max}.`);
  return value;
}
export function editGeometry(command: string, show: MapShow, args: GeometryArguments) {
  const scene = show.scenes.find(item => item.id === args.scene_id);
  const surface = scene?.surfaces.find(item => item.id === args.surface_id);
  if (!scene || !surface) throw new Error('Surface not found in the specified scene. Inspect the show first.');
  if (surface.locked) throw new Error('The surface is locked.');
  const visible = animateSurface(surface, 0), before = boundsOf(visible.corners);
  const transform = featureTransformAt(surface, 0);
  if (before.width < 1e-8 || before.height < 1e-8 || Math.abs(transform.scaleX * transform.scaleY) < 1e-8)
    throw new Error('Cannot transform degenerate surface geometry.');
  let geometry;
  if (command === 'map.surface.bounds') {
    const next = { x: numberIn(args.x_px, -LIMIT, LIMIT), y: numberIn(args.y_px, -LIMIT, LIMIT),
      width: numberIn(args.width_px, 1, 32768), height: numberIn(args.height_px, 1, 32768) };
    if (surface.lockAspectRatio && Math.abs(next.width / next.height - before.width / before.height) > 1e-6)
      throw new Error('The surface aspect ratio is locked. Supply proportional dimensions.');
    geometry = setLayerBounds(surface, next, 0);
  } else if (command === 'map.surface.rotate') {
    const degrees = numberIn(args.delta_degrees, -360, 360);
    if (degrees % 360 === 0) throw new Error('Geometry is unchanged. No revision was saved.');
    geometry = rotateLayer(surface, degrees, 0);
  } else throw new Error('Unknown geometry command.');
  const proposed = { ...show, scenes: show.scenes.map(item => item.id === scene.id
    ? { ...item, surfaces: item.surfaces.map(layer => layer.id === surface.id ? { ...layer, ...geometry } : layer) } : item) };
  const next = maintainCornerWelds(show, proposed);
  if (next === show) throw new Error('Geometry edit refused by welded-corner constraints or a locked neighbour.');
  const changed = next.scenes.find(item => item.id === scene.id)!.surfaces;
  const changedIDs = changed.filter((layer, index) => JSON.stringify([layer.corners, layer.masks, layer.maskCurves]) !==
    JSON.stringify([scene.surfaces[index].corners, scene.surfaces[index].masks, scene.surfaces[index].maskCurves])).map(layer => layer.id);
  // Inverse animation transforms and welded peers can extend beyond requested bounds.
  for (const layer of changed.filter(item => changedIDs.includes(item.id))) {
    const points = [...layer.corners, ...layer.masks.flat(), ...(layer.maskCurves ?? []).flatMap(profile => profile.flatMap(curve => curve ? [curve.c1, curve.c2] : []))];
    for (const point of points) for (const coordinate of point) numberIn(coordinate, -LIMIT, LIMIT);
  }
  if (!changedIDs.length) throw new Error('Geometry is unchanged. No revision was saved.');
  return { show: next, changedIDs };
}
