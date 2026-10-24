import { expect, test } from 'vitest';
import { drawingProgress, strokeLengths } from './drawing-replay';

test('reveals strokes in distance order, holds or loops, and scrubs backwards deterministically', () => {
  const replay = { durationS: 8, loop: false };
  expect(drawingProgress([10, 30], replay, 0)).toEqual([0, 0]);
  expect(drawingProgress([10, 30], replay, 1)).toEqual([.5, 0]);
  expect(drawingProgress([10, 30], replay, 5)).toEqual([1, .5]);
  expect(drawingProgress([10, 30], replay, 100)).toEqual([1, 1]);
  expect(drawingProgress([10, 30], { ...replay, loop: true }, 9)).toEqual([.5, 0]);
  expect(drawingProgress([10, 30], replay, 1)).toEqual([.5, 0]);
  expect(drawingProgress([0, 0], replay, 3)).toEqual([0, 0]);
  expect(drawingProgress([10, 30], undefined, 0)).toEqual([1, 1]);
});
test('distance ignores the density of recorded points', () => {
  expect(strokeLengths([
    { points: [[0, 0], [3, 4]], widthPx: 3, color: '#fff' },
    { points: [[0, 0], [1.5, 2], [3, 4]], widthPx: 3, color: '#fff' },
  ])).toEqual([5, 5]);
});
