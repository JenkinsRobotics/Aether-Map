import { expect, it } from 'vitest';
import { emptyShow, newScene, newSurface, quadCorners, type MapShow } from './document';
import { canNestTimeline, createTimeline, placeTimeline, removeSceneTimelines, timelineTracks, validateTimelines } from './timelines';
import { clipPictures, sceneVisuals } from './visual-render';
import { createClip, isClip, projectClips } from './compound-clips';
import { parseShow, serializeShow } from './show-file';
import type { Visual } from './visual-model';
import { normalizeDocument } from './normalize-document';

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

/** The r23 shape: Timeline 3 (one full-canvas fill) nested in Timeline 4 on surfaces a and b. */
function r23() {
  let show = emptyShow();
  const sceneID = show.activeSceneId;
  const a = { ...newSurface(show.output, 0), id: 'a', corners: quadCorners([100, 100, 400, 300]) };
  const b = { ...newSurface(show.output, 1), id: 'b', corners: quadCorners([600, 200, 900, 700]) };
  show.scenes[0].surfaces = [a, b];
  show = createTimeline(show, 'Timeline 3');
  const t3 = show.activeTimelineID!, t3Track = timelineTracks(show, t3).find(t => t.kind === 'video')!;
  show = { ...show, visuals: [...(show.visuals ?? []), fill('text', t3Track.id, [{ sceneID }])] };
  show = createTimeline(show, 'Timeline 4');
  const t4 = show.activeTimelineID!, t4Track = timelineTracks(show, t4).find(t => t.kind === 'video')!;
  show = placeTimeline(show, t3, t4Track.id, 0);
  show = { ...show, visuals: show.visuals!.map(v => v.timelineRefID === t3 ? { ...v, targets: [{ sceneID, surfaceID: 'a' }, { sceneID, surfaceID: 'b' }] } : v) };
  return { show, t3, t4 };
}

it('an r23 nested project renders identically after migration', () => {
  const { show, t3 } = r23();
  const after = normalizeDocument(show);
  expect(isClip(after.timelines!.find(t => t.id === t3))).toBe(true);
  const look = (s: MapShow) => sceneVisuals(s, s.scenes[0], 2).map(p => ({ corners: p.corners, masks: p.masks, opacity: p.opacity }));
  const before = look(show), migrated = look(after);
  expect(migrated).toHaveLength(2);
  migrated.forEach((p, i) => {
    p.corners.forEach((c, k) => { expect(c[0]).toBeCloseTo(before[i].corners[k][0]); expect(c[1]).toBeCloseTo(before[i].corners[k][1]); });
    expect(p.masks).toEqual(before[i].masks); expect(p.opacity).toBe(before[i].opacity);
  });
});

it('a timeline with surface-targeted visuals stays a scene', () => {
  const { show, t4 } = r23();
  expect(normalizeDocument(show).timelines!.find(t => t.id === t4)!.board).toBeUndefined();
});

it('migration is idempotent', () => {
  const once = normalizeDocument(r23().show);
  expect(normalizeDocument(once)).toEqual(once);
});

it('a migrated clip a show plays as a scene still fills that canvas', () => {
  const { show, clip } = fixture();
  const canvas2 = show.scenes.find(s => s.id === 'canvas-2')!;
  const small = { ...canvas2, artboard: { widthPx: 1280, heightPx: 720 } };
  const played = { ...show, scenes: show.scenes.map(s => s.id === small.id ? small : s), activeSceneId: small.id, activeTimelineID: clip };
  expect(sceneVisuals(played, small, 0).map(p => p.corners)).toEqual([quadCorners([0, 0, 1280, 720])]);
});
