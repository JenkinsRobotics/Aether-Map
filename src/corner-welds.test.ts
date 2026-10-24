import { expect, test } from 'vitest';
import { allSurfaces, emptyShow, newSurface } from './document';
import { detachCorner, joinCorners, maintainCornerWelds } from './corner-welds';
import { duplicateSurface } from './surface-interaction';
import { parseShow, serializeShow } from './show-file';
import { animateSurface } from './features/animation';
function fixture() { const show = emptyShow(); show.scenes[0].surfaces = [newSurface(show.output, 0), newSurface(show.output, 1)]; return show; }
function welded() { const show = fixture(), [a, b] = allSurfaces(show); return joinCorners(show, { surfaceID: a.id, index: 1 }, { surfaceID: b.id, index: 0 }); }
test('weld survives persistence and moves a connected corner with its peer', () => {
  const show = parseShow(serializeShow(welded())), [a, b] = allSurfaces(show);
  expect(a.cornerWelds![1]).toBe(b.cornerWelds![0]);
  const next = structuredClone(show); next.scenes[0].surfaces[0].corners[1] = [200, 300];
  expect(allSurfaces(maintainCornerWelds(show, next))[1].corners[0]).toEqual([200, 300]);
});
test('locked peers block movement, detaching frees both pins and copies never inherit welds', () => {
  const show = welded(), [a, b] = allSurfaces(show); b.locked = true;
  const next = structuredClone(show); next.scenes[0].surfaces[0].corners[1] = [200, 300];
  expect(maintainCornerWelds(show, next)).toBe(show);
  const detached = maintainCornerWelds(show, detachCorner(show, { surfaceID: a.id, index: 1 }));
  expect(allSurfaces(detached).every(s => !s.cornerWelds?.some(Boolean))).toBe(true);
  expect(duplicateSurface(a).cornerWelds).toBeUndefined();
});
test('welding transformed surfaces uses visible scene-space points', () => {
  const show = fixture(), [a, b] = allSurfaces(show); a.transform = { xPx: 40, yPx: 20, rotationDeg: 32, scaleX: 1.2, scaleY: .7 };
  const joined = joinCorners(show, { surfaceID: a.id, index: 1 }, { surfaceID: b.id, index: 0 });
  const [aa, bb] = allSurfaces(joined).map(s => animateSurface(s, 0));
  expect(aa.corners[1][0]).toBeCloseTo(bb.corners[0][0]); expect(aa.corners[1][1]).toBeCloseTo(bb.corners[0][1]);
});
