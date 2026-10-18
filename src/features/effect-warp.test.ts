import { expect, test } from 'vitest';
import { effectSample } from './effect-warp';
import { VISUAL_EFFECTS, effectAmount } from '../visual-effects';

test('identity and repeat coordinates retain phase and handle the whole source', () => {
  expect(effectSample('tile', 1, .12, .7)).toEqual([.12, .7]);
  const sample = effectSample('tile', 3, .4, .5);
  expect(sample[0]).toBeCloseTo(.2); expect(sample[1]).toBeCloseTo(.5);
  expect(effectSample('fisheye', 0, .1, .9)).toEqual([.1, .9]);
  expect(effectSample('crt', 0, .2, .8)).toEqual([.2, .8]);
});
test('kaleido folds mirrored radial segments onto the same picture coordinates', () => {
  const point = (angle: number) => effectSample('kaleido', 6, .5 + Math.cos(angle) * .3, .5 + Math.sin(angle) * .3);
  const a = point(.1), b = point(.1 + Math.PI / 3), c = point(-.1);
  for (let i = 0; i < 2; i++) { expect(b[i]).toBeCloseTo(a[i]); expect(c[i]).toBeCloseTo(a[i]); }
  for (const x of [0, .2, .5, 1]) for (const y of [0, .5, 1]) for (const value of effectSample('kaleido', 16, x, y)) expect(value).toBeGreaterThanOrEqual(0);
});
test('lens center is fixed, positive and negative distortion bend in opposite directions', () => {
  expect(effectSample('fisheye', 90, .5, .5)).toEqual([.5, .5]);
  expect(effectSample('fisheye', 90, .8, .5)[0]).toBeLessThan(.8);
  expect(effectSample('fisheye', -90, .8, .5)[0]).toBeGreaterThan(.8);
  expect(effectSample('crt', 90, .8, .5)[0]).toBeGreaterThan(.8);
});
test('every effect has one valid finite range; grid and segment counts are integral', () => {
  expect(VISUAL_EFFECTS).toHaveLength(11);
  for (const e of VISUAL_EFFECTS) { expect(effectAmount(e.value, Infinity)).toBe(e.initial); expect(effectAmount(e.value, -1e6)).toBe(e.min); expect(effectAmount(e.value, 1e6)).toBe(e.max); }
  expect(effectAmount('kaleido', 5.7)).toBe(6); expect(effectAmount('tile', 2.2)).toBe(2);
});
