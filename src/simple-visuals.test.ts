import { parseShow, serializeShow } from './show-file';
import { expect, test } from 'vitest';
import { emptyShow, newSurface, newScene } from './document';
import { normalizeDocument } from './normalize-document';
import { addSimpleVisual, replaceSimpleVisual, simpleVisuals, moveSimpleVisual, canMoveSimpleVisual } from './simple-visuals';
import { sceneVisuals } from './visual-render';
import { visualSource } from './media-pool';
import { duplicateVisual } from './visual-document';
import { setVisualTarget } from './visual-targets';
import { createTimeline } from './timelines';

const source = { mediaId: null, rect: [0, 0, 1920, 1080] as [number, number, number, number], fill: '#10cffe' };
function fixture() {
  const show = emptyShow();
  show.scenes[0].surfaces = [newSurface(show.output, 0), newSurface(show.output, 1)];
  return normalizeDocument(show);
}
test('new continuous visuals use real mapped surfaces and survive normalization and saved-file reopen', () => {
  const before = fixture(), created = addSimpleVisual(before, source, 'Ocean');
  const show = normalizeDocument(created), visual = simpleVisuals(show)[0];
  expect(simpleVisuals(before)).toHaveLength(0); // empty per-surface timeline uses are not visual content
  expect(visual.continuous).toBe(true); expect(visual.loop).toBe(true);
  expect(visual.targets.map(t => t.surfaceID)).toEqual(before.scenes[0].surfaces.map(s => s.id));
  const reopened = parseShow(serializeShow(show));
  for (const time of [0, 15, 59]) {
    const output = sceneVisuals(reopened, reopened.scenes[0], time);
    expect(output).toHaveLength(2); expect(output.map(s => s.source.fill)).toEqual(['#10cffe', '#10cffe']);
    expect(output.map(s => s.corners)).toEqual(before.scenes[0].surfaces.map(s => s.corners));
  }
  expect(before.pool).toHaveLength(0);
});
test('empty scenes use full scene; reusing a pool source creates an independent editable use', () => {
  let show = addSimpleVisual(normalizeDocument(emptyShow()), source, 'Ocean');
  const first = show.visuals!.at(-1)!;
  expect(first.targets).toEqual([{ sceneID: show.activeSceneId }]);
  show = addSimpleVisual(show, source, 'Ocean second', first.assetID);
  expect(show.pool).toHaveLength(1); expect(show.visuals).toHaveLength(2);
  const replaced = replaceSimpleVisual(show, first.id, { ...source, fill: '#ff0000' }, 'Red');
  expect(visualSource(replaced, replaced.visuals![0]).fill).toBe('#ff0000');
  expect(visualSource(replaced, replaced.visuals![1]).fill).toBe('#10cffe');
});
test('replacement preserves advanced timing, placement, effects, identity and assignments', () => {
  let show = addSimpleVisual(fixture(), source, 'Ocean');
  const id = show.visuals!.at(-1)!.id;
  show = { ...show, visuals: show.visuals!.map(v => v.id !== id ? v : { ...v, continuous: false, startS: 7, durationS: 9, inS: 2, loop: false, opacity: .6, effects: [{ id: 'blur', kind: 'blur', amount: 20, enabled: true }] }) };
  const before = show.visuals!.at(-1)!;
  const next = replaceSimpleVisual(show, id, { ...source, fill: '#ffff00' }, 'Yellow');
  expect(next.visuals!.at(-1)).toEqual({ ...before, name: 'Yellow', source: { ...source, fill: '#ffff00' } });
  expect(sceneVisuals(next, next.scenes[0], 6)).toHaveLength(0);
  expect(sceneVisuals(next, next.scenes[0], 8)).toHaveLength(2);
  expect(sceneVisuals(next, next.scenes[0], 16)).toHaveLength(0);
});
test('assignment, visibility, duplication and order change actual compositor output', () => {
  let show = addSimpleVisual(fixture(), source, 'Ocean');
  const a = simpleVisuals(show)[0];
  show = { ...show, visuals: show.visuals!.map(v => v.id === a.id ? setVisualTarget(v, a.targets[0], false) : v) };
  expect(sceneVisuals(show, show.scenes[0], 2)).toHaveLength(1);
  show = duplicateVisual(show, a.id);
  const b = simpleVisuals(show)[1];
  show = replaceSimpleVisual(show, b.id, { ...source, fill: '#f00' }, 'Red');
  expect(sceneVisuals(show, show.scenes[0], 2).map(s => s.source.fill)).toEqual(['#10cffe', '#f00']);
  show = moveSimpleVisual(show, b.id, -1);
  expect(sceneVisuals(show, show.scenes[0], 2).map(s => s.source.fill)).toEqual(['#f00', '#10cffe']);
  show = { ...show, visuals: show.visuals!.map(v => v.id === b.id ? { ...v, enabled: false } : v) };
  expect(sceneVisuals(show, show.scenes[0], 2).map(s => s.source.fill)).toEqual(['#10cffe']);
});
test('locked visuals and tracks cannot be replaced or reordered; audio cannot become a visual', () => {
  let show = addSimpleVisual(addSimpleVisual(fixture(), source, 'A'), source, 'B');
  const visual = simpleVisuals(show)[1];
  show = { ...show, tracks: show.tracks!.map(t => t.id === visual.trackID ? { ...t, locked: true } : t) };
  expect(replaceSimpleVisual(show, visual.id, source, 'Changed')).toBe(show);
  expect(moveSimpleVisual(show, visual.id, -1)).toBe(show);
  show = { ...show, media: [{ id: 'audio', file: 'audio.wav', name: 'Sound', kind: 'audio', width: 1, height: 1, bytes: 12 }] };
  expect(addSimpleVisual(show, { ...source, mediaId: 'audio' }, 'Sound')).toBe(show);
});
test('scene and child timeline membership survive a simple edit without flattening schedules', () => {
  let show = fixture();
  const other = newScene('Other');
  show = { ...show, scenes: [...show.scenes, other] };
  show = createTimeline(show, 'Detail');
  const timelineID = show.activeTimelineID;
  show = addSimpleVisual(show, source, 'Child');
  expect(show.activeTimelineID).toBe(timelineID);
  expect(show.tracks!.at(-1)!.timelineID).toBe(timelineID);
  expect(simpleVisuals(show)).toHaveLength(1);
  expect(simpleVisuals({ ...show, activeTimelineID: undefined })).toHaveLength(0);
  expect(simpleVisuals({ ...show, activeSceneId: other.id })).toHaveLength(0);
});

test('front/back preserve intermediate layer order, timing, targets and reopened composition', () => {
  let show = normalizeDocument(emptyShow());
  for (const name of ['A', 'B', 'C', 'D']) show = addSimpleVisual(show, source, name);
  const before = show, b = simpleVisuals(show)[1];
  const names = (s: typeof show) => sceneVisuals(s, s.scenes[0], 8).map(layer => layer.name);
  expect(names(show)).toEqual(['A', 'B', 'C', 'D']);
  show = moveSimpleVisual(show, b.id, 'front');
  expect(names(show)).toEqual(['A', 'C', 'D', 'B']);
  expect(canMoveSimpleVisual(show, b.id, 1)).toBe(false);
  expect(moveSimpleVisual(show, b.id, 'front')).toBe(show);
  show = moveSimpleVisual(show, b.id, 'back');
  expect(names(parseShow(serializeShow(normalizeDocument(show))))).toEqual(['B', 'A', 'C', 'D']);
  expect(canMoveSimpleVisual(show, b.id, -1)).toBe(false);
  expect(show.visuals!.find(v => v.id === b.id)).toEqual(b);
  expect(names(before)).toEqual(['A', 'B', 'C', 'D']);
});

test('locked layers stop endpoint moves and hidden-context tracks retain their positions', () => {
  let show = normalizeDocument(emptyShow());
  for (const name of ['A', 'B', 'Locked', 'D']) show = addSimpleVisual(show, source, name);
  const [a, b, locked] = simpleVisuals(show);
  show = { ...show, tracks: show.tracks!.map(t => t.id === locked.trackID ? { ...t, locked: true } : t) };
  const unrelated = { ...show.tracks![0], id: 'other', targets: [], kind: 'audio' as const };
  show.tracks!.splice(1, 0, unrelated);
  expect(moveSimpleVisual(show, a.id, 'front')).toBe(show);
  const moved = moveSimpleVisual(show, a.id, 1);
  expect(simpleVisuals(moved).map(v => v.name)).toEqual(['B', 'A', 'Locked', 'D']);
  expect(moved.tracks![1]).toBe(unrelated);
  expect(canMoveSimpleVisual(moved, a.id, 1)).toBe(false);
  expect(moveSimpleVisual(show, locked.id, 'back')).toBe(show);
  expect(moveSimpleVisual(show, b.id, 1)).toBe(show);
});

test('scheduled clips on one track move together past a whole neighboring layer', () => {
  let show = addSimpleVisual(addSimpleVisual(normalizeDocument(emptyShow()), source, 'A'), source, 'B');
  const [a, b] = simpleVisuals(show);
  const later = { ...a, id: 'later', name: 'Later', continuous: false, startS: 10, durationS: 5 };
  show = { ...show, visuals: [...show.visuals!, later] };
  const moved = moveSimpleVisual(show, a.id, 1);
  expect(simpleVisuals(moved).map(v => v.id)).toEqual([b.id, a.id, later.id]);
  expect(moved.visuals!.find(v => v.id === later.id)).toEqual(later);
  expect(canMoveSimpleVisual(moved, a.id, 1)).toBe(false);
  const locked = { ...show, visuals: show.visuals!.map(v => v.id === later.id ? { ...v, locked: true } : v) };
  expect(moveSimpleVisual(locked, a.id, 1)).toBe(locked);
});
