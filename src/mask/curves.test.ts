import { expect, test } from 'vitest';
import { newFeature } from '../features/new-feature';
import { setMaskNodeMode, moveMaskControl, reverseMaskShape, setEdgeCurve, nearestCurveEdge, readMaskCurves, replaceMaskShape, sampleMask, splitCurve, splitMaskEdge } from './curves';
import { flipLayer } from '../layer-transform';
import { translateSurface } from '../surface-interaction';
import { emptyShow } from '../document';
import { parseShow, serializeShow } from '../show-file';
const fixture = () => ({ ...newFeature('surface', { width: 100, height: 100 }, 0), masks: [[[0, 0], [100, 0], [100, 100], [0, 100]]] as [number, number][][],
  maskCurves: [[{ c1: [0, 80] as [number, number], c2: [100, 80] as [number, number] }, null, null, null]] });
test('cubic outlines flatten curved edges and split without changing the curve', () => {
  const s = fixture(), curve = s.maskCurves[0][0]!;
  expect(sampleMask(s, 0).length).toBeGreaterThan(4);
  const at = splitCurve(s.masks[0][0], curve, s.masks[0][1], .5).point;
  expect(nearestCurveEdge(s, 0, at, 1)).toEqual({ edge: 0, fraction: .5 });
  const split = { ...s, ...splitMaskEdge(s, 0, 0, .5) };
  expect(split.masks[0]).toHaveLength(5);
  for (const t of [.1, .25, .7, .9]) {
    const before = splitCurve(s.masks[0][0], curve, s.masks[0][1], t).point;
    const edge = t < .5 ? 0 : 1;
    const after = splitCurve(split.masks[0][edge], split.maskCurves![0][edge]!, split.masks[0][edge + 1], t < .5 ? t * 2 : t * 2 - 1).point;
    expect(after[0]).toBeCloseTo(before[0]); expect(after[1]).toBeCloseTo(before[1]);
  }
});
test('moving an anchor carries attached controls, and whole-shape transforms carry all controls', () => {
  const s = fixture(), p = replaceMaskShape(s, 0, [[10, 20], ...s.masks[0].slice(1)]);
  expect(p.maskCurves![0][0]).toEqual({ c1: [10, 100], c2: [100, 80] });
  expect(translateSurface(s, [20, 30]).maskCurves![0][0]).toEqual({ c1: [20, 110], c2: [120, 110] });
  const twice = flipLayer({ ...s, ...flipLayer(s, 0, 0) }, 0, 0);
  expect(twice.maskCurves).toEqual(s.maskCurves);
});
test('curve controls roundtrip and malformed controls normalize to straight edges', () => {
  const show = emptyShow(), s = fixture(); show.scenes[0].surfaces = [s];
  expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].maskCurves).toEqual(s.maskCurves);
  expect(readMaskCurves([[{ c1: [NaN, 0], c2: [3, 4] }]], s.masks)).toEqual([[null, null, null, null]]);
});
test('collinear overshooting curves are not incorrectly flattened into a straight edge', () => {
  const s = fixture(); s.maskCurves[0][0] = { c1: [400, 0], c2: [-300, 0] };
  expect(sampleMask(s, 0).length).toBeGreaterThan(4);
});
test('deleting an unrelated node preserves the retained curves on untouched edges', () => {
  const s = fixture(), changed = replaceMaskShape(s, 0, s.masks[0].slice(0, 3));
  expect(changed.maskCurves![0][0]).toEqual(s.maskCurves[0][0]);
  expect(changed.maskCurves![0]).toHaveLength(3);
});

test('shared node modes couple handles and survive a show-file roundtrip and subdivision', () => {
  const original = fixture();
  const smooth = { ...original, ...setMaskNodeMode(original, 0, 1, 'symmetric') };
  const moved = { ...smooth, ...moveMaskControl(smooth, 0, 1, 'c1', [130, 40]) };
  expect(moved.maskCurves![0][0]!.c2).toEqual([70, -40]);
  const show = emptyShow(); show.scenes[0].surfaces = [moved];
  expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].maskNodeModes).toEqual(moved.maskNodeModes);
  const split = splitMaskEdge(moved, 0, 1, .5);
  expect(split.maskNodeModes![0]).toHaveLength(5);
  expect(split.maskNodeModes![0][1]).toBe('smooth');
  expect(split.maskNodeModes![0][2]).toBe('smooth');
});

test('independent handles, straightening and reversal use shared path behavior', () => {
  const s = fixture(), coupled = { ...s, ...setMaskNodeMode(s, 0, 1, 'symmetric') };
  const independent = { ...coupled, ...moveMaskControl(coupled, 0, 1, 'c1', [150, 40], true) };
  expect(independent.maskNodeModes![0][1]).toBe('corner');
  expect(independent.maskCurves![0][0]).toEqual(coupled.maskCurves![0][0]);
  const straight = setEdgeCurve(coupled, 0, 1, null);
  expect(straight.maskNodeModes![0][1]).toBe('corner');
  const reversed = { ...independent, ...reverseMaskShape(independent, 0) };
  const restored = { ...reversed, ...reverseMaskShape(reversed, 0) };
  expect(restored.masks).toEqual(independent.masks); expect(restored.maskCurves).toEqual(independent.maskCurves);
  expect(restored.maskNodeModes).toEqual(independent.maskNodeModes);
});
