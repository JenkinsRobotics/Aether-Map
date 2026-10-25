import { expect, it } from 'vitest';
import { emptyShow, newScene, newSurface, quadCorners, type MapShow } from './document';
import { canNestTimeline, placeTimeline, removeSceneTimelines, timelineTracks, validateTimelines } from './timelines';
import { clipPictures, sceneVisuals } from './visual-render';
import { createClip, isClip, projectClips } from './compound-clips';
import { parseShow, serializeShow } from './show-file';
import type { Visual } from './visual-model';

const fill = (id: string, trackID: string, targets: Visual['targets'] = []): Visual => ({ id, name: id, trackID, startS: 0, durationS: 60, inS: 0, loop: true, continuous: true,
  targets, mapping: 'repeat', color: '#f00', opacity: 1, source: { mediaId: null, rect: [0, 0, 100, 100], fill: '#ff0000' } });

/** Canvas 1 (active) and Canvas 2 with surface `top`; a 1000×500 clip "Card" holding one fill. */
function fixture() {
  let show = emptyShow();
  const canvas1 = show.activeSceneId;
  const canvas2 = { ...newScene('Canvas 2'), id: 'canvas-2' };
  const top = { ...newSurface(show.output, 0), id: 'top', corners: quadCorners([200, 100, 500, 400]) };
  canvas2.surfaces = [top];
  show = { ...show, scenes: [...show.scenes, canvas2] };
  show = createClip(show, 'Card', { widthPx: 1000, heightPx: 500 });
  const clip = show.activeClipID!;
  const track = timelineTracks(show, clip).find(t => t.kind === 'video')!;
  show = { ...show, visuals: [...(show.visuals ?? []), fill('red', track.id)] };
  return { show, canvas1, canvas2: canvas2.id, top, clip };
}

/** A Canvas-2 scene track on `top` holding one use of `clip`. */
function onTop(show: MapShow, canvas2: string, clip: string) {
  const next = { ...show, activeSceneId: canvas2, tracks: [...(show.tracks ?? []), { id: 'scene-top', name: 'Top', kind: 'video' as const, targets: [{ sceneID: canvas2, surfaceID: 'top' }], enabled: true, locked: false }] };
  const placed = placeTimeline(next, clip, 'scene-top', 0);
  return { ...placed, visuals: placed.visuals!.map(v => v.timelineRefID === clip ? { ...v, targets: [{ sceneID: canvas2, surfaceID: 'top' }] } : v) };
}

it('a clip renders on its board regardless of targets', () => {
  const { show, clip } = fixture();
  expect(isClip(show.timelines!.find(t => t.id === clip))).toBe(true);
  expect(projectClips(show).map(t => t.name)).toEqual(['Card']);
  const pictures = clipPictures(show, clip, 0);
  expect(pictures).toHaveLength(1);
  expect(pictures[0].corners).toEqual([[0, 0], [1000, 0], [1000, 500], [0, 500]]);
});

it('a clip made on Canvas 1 plays on Canvas 2 surfaces', () => {
  const { show, canvas2, top, clip } = fixture();
  const next = onTop(show, canvas2, clip);
  const pictures = sceneVisuals(next, next.scenes.find(s => s.id === canvas2)!, 0);
  expect(pictures).toHaveLength(1);
  pictures[0].corners.forEach((p, i) => { expect(p[0]).toBeCloseTo(top.corners[i][0]); expect(p[1]).toBeCloseTo(top.corners[i][1]); });
});

it('removing the canvas a clip was made on keeps the clip', () => {
  const { show, canvas1, clip } = fixture();
  const next = removeSceneTimelines({ ...show, scenes: show.scenes.filter(s => s.id !== canvas1), activeSceneId: 'canvas-2' }, canvas1);
  expect(next.timelines!.some(t => t.id === clip)).toBe(true);
  expect(next.visuals!.some(v => v.id === 'red')).toBe(true);
  expect(() => validateTimelines(next)).not.toThrow();
});

it('a clip cannot contain itself through another clip', () => {
  let { show, clip: a } = fixture();
  show = createClip(show, 'Outer');
  const b = show.activeClipID!;
  const bTrack = timelineTracks(show, b).find(t => t.kind === 'video')!;
  show = placeTimeline(show, a, bTrack.id, 0);
  expect(show.visuals!.some(v => v.timelineRefID === a && v.trackID === bTrack.id)).toBe(true);
  expect(canNestTimeline(show, b, a)).toBe(false);
  const aTrack = timelineTracks(show, a).find(t => t.kind === 'video')!;
  expect(placeTimeline(show, b, aTrack.id, 0)).toBe(show);
});

it('board survives save and load', () => {
  const { show, clip } = fixture();
  const restored = parseShow(serializeShow(show));
  expect(restored.version).toBe(13);
  expect(restored.timelines!.find(t => t.id === clip)!.board).toEqual({ widthPx: 1000, heightPx: 500 });
});

it('documents without clips load as before', () => {
  const plain = emptyShow();
  const restored = parseShow(serializeShow({ ...plain, version: 12 }));
  expect(restored.timelines ?? []).toEqual(plain.timelines ?? []);
  expect(projectClips(restored)).toEqual([]);
});
