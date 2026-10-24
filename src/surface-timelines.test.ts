import { expect, it } from 'vitest';
import { emptyShow, newSurface } from './document';
import { normalizeMediaPool, addPoolAsset, placePoolAsset } from './media-pool';
import { normalizeSurfaceTimelines } from './surface-timelines';
import { timelineTracks, createTimeline } from './timelines';
import { parseShow, serializeShow } from './show-file';

const source = { mediaId:null, rect:[0,0,100,100] as [number,number,number,number], fill:'#ff0000' };
function fixture() {
  const s = emptyShow(); s.scenes[0].surfaces = [newSurface(s.output,0), newSurface(s.output,1), newSurface(s.output,2)];
  return s;
}
const normalize = (s: ReturnType<typeof emptyShow>) => normalizeSurfaceTimelines(normalizeMediaPool(s));

it('a new show has one scene and one Main timeline: surfaces get no timeline of their own', () => {
  let s = normalize(fixture());
  expect(s.timelines ?? []).toHaveLength(0);
  expect(timelineTracks(s).filter(t => t.kind === 'video')).toHaveLength(1);
  expect(normalize(s)).toBe(s);
  s = parseShow(serializeShow(s)); expect(normalize(s)).toBe(s);
  // Visuals go on Main and target surfaces directly.
  s = addPoolAsset(s, source, 'Red');
  s = placePoolAsset(s, s.pool![0].id, timelineTracks(s)[0].id, 2);
  expect(s.visuals!.filter(v => v.timelineRefID)).toHaveLength(0);
});

it('keeps a saved surface timeline reusable when its surface is deleted', () => {
  // A show saved before 2026-10-22 may carry a per-surface timeline.
  let s = normalize(fixture());
  const surface = s.scenes[0].surfaces[0];
  s = createTimeline(s, 'Wall');
  const child = s.timelines!.at(-1)!;
  s = { ...s, timelines: s.timelines!.map(t => t.id === child.id ? { ...t, surfaceID: surface.id } : t) };
  expect(normalize(s).timelines!.find(t => t.id === child.id)?.surfaceID).toBe(surface.id);
  s = normalize({ ...s, scenes: s.scenes.map(scene => ({ ...scene, surfaces: scene.surfaces.filter(v => v.id !== surface.id) })) });
  expect(s.timelines!.find(t => t.id === child.id)?.surfaceID).toBeUndefined();
  expect(timelineTracks(s, child.id)).toHaveLength(2);
  expect(normalize(s)).toBe(s);
});
