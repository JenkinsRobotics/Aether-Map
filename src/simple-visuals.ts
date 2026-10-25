import { activeScene, type MapShow, type Surface } from './document';
import { addPoolAsset, addVisualTrack, placePoolAsset, orderedVisuals } from './media-pool';
import { currentTimelineID, isClip, timelineDuration, timelineVisuals } from './timelines';
import type { Visual } from './visual-model';

/** Simple and advanced authoring share the same pool, tracks, clips and targets. */
export function simpleVisuals(show: MapShow): Visual[] {
  const ids = new Set(timelineVisuals(show).map(v => v.id));
  return orderedVisuals(show).filter(v => ids.has(v.id) && !v.mask
    && show.tracks?.find(t => t.id === v.trackID)?.kind !== 'audio'
    && (!v.timelineRefID || timelineVisuals(show, v.timelineRefID).some(child => !child.mask))
    && (v.targets.some(t => t.sceneID === show.activeSceneId) || !v.targets.length));
}
export function visualIsLocked(show: MapShow, visual: Visual): boolean {
  return !!(visual.locked || show.tracks?.find(t => t.id === visual.trackID)?.locked);
}

/** A new visual gets its own compositing track and loops until the show stops.
 * Existing schedules are never converted merely by opening the simple editor. */
export function addSimpleVisual(show: MapShow, source: Surface['source'], name: string, poolID?: string, visualID?: string): MapShow {
  if (show.media.some(m => m.id === source.mediaId && m.kind === 'audio')) return show;
  const scene = activeScene(show);
  const timeline = show.timelines?.find(t => t.id === currentTimelineID(show));
  const surfaces = scene.surfaces.filter(s => !s.sceneCanvas && s.kind !== 'mask');
  // Inside a clip a visual draws on the board, so it aims nowhere.
  const targets = isClip(timeline) ? [] : timeline?.surfaceID ? [{ sceneID: scene.id, surfaceID: timeline.surfaceID }]
    : surfaces.length ? surfaces.map(s => ({ sceneID: scene.id, surfaceID: s.id })) : [{ sceneID: scene.id }];
  let next = poolID ? show : addPoolAsset(show, source, name);
  const assetID = poolID ?? next.pool!.at(-1)!.id;
  if (!next.pool?.some(a => a.id === assetID)) return show;
  next = addVisualTrack(next, targets, name);
  next = placePoolAsset(next, assetID, next.tracks!.at(-1)!.id, 0);
  const id = next.visuals!.at(-1)!.id;
  return { ...next, visuals: next.visuals!.map(v => v.id === id ? { ...v, ...(visualID ? { id: visualID } : {}), name, continuous: true, loop: true, durationS: timelineDuration(show) } : v) };
}

/** Replace this use only; reused pool assets and the advanced schedule survive. */
export function replaceSimpleVisual(show: MapShow, id: string, source: Surface['source'], name: string): MapShow {
  const visual = show.visuals?.find(v => v.id === id);
  if (!visual || visual.timelineRefID || visualIsLocked(show, visual)
    || show.media.some(m => m.id === source.mediaId && m.kind === 'audio')) return show;
  return { ...show, visuals: show.visuals!.map(v => v.id === id ? { ...v, source: structuredClone(source), name } : v) };
}

export type SimpleLayerMove = -1 | 1 | 'front' | 'back';

/** Layers are canonical tracks. A scheduled track's clips always move together. */
function layerMove(show: MapShow, id: string, direction: SimpleLayerMove) {
  const visible = simpleVisuals(show), visual = visible.find(v => v.id === id);
  const ids = new Set(visible.map(v => v.trackID));
  const layers = (show.tracks ?? []).filter(t => ids.has(t.id));
  const index = layers.findIndex(t => t.id === visual?.trackID);
  const locked = (i: number) => layers[i].locked || show.visuals?.some(v => v.trackID === layers[i].id && v.locked);
  if (!visual || index < 0 || locked(index)) return null;
  const step = direction === 'back' || direction === -1 ? -1 : 1;
  let target = index;
  while (target + step >= 0 && target + step < layers.length) {
    if (locked(target + step)) return null;
    target += step;
    if (typeof direction === 'number') break;
  }
  return target === index ? null : { layers, index, target };
}

export function canMoveSimpleVisual(show: MapShow, id: string, direction: SimpleLayerMove): boolean {
  return layerMove(show, id, direction) !== null;
}

/** Skip audio/empty/other-scene tracks without changing their positions. Locked
 * layers are barriers. Endpoint moves preserve every other layer's relative order. */
export function moveSimpleVisual(show: MapShow, id: string, direction: SimpleLayerMove): MapShow {
  const move = layerMove(show, id, direction);
  if (!move) return show;
  const { layers, index, target } = move;
  const ids = new Set(layers.map(t => t.id));
  const [selected] = layers.splice(index, 1);
  layers.splice(target, 0, selected);
  let i = 0;
  const next = { ...show, tracks: show.tracks!.map(t => ids.has(t.id) ? layers[i++] : t) };
  return { ...next, visuals: orderedVisuals(next) };
}
