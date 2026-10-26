import { expect, test } from 'vitest';
import { beginHistoryGesture, goToHistory, initialHistory, pushHistory } from './history';
import { describeMapEdit } from './history-description';
import { emptyShow, newScene } from './document';

test('returning to a step preserves the remaining undo/redo chain until the next edit', () => {
  const history = ['B', 'C', 'D'].reduce((h, value, i) => pushHistory(h, value, null, i), initialHistory('A'));
  const earlier = goToHistory(history, 1);
  expect([earlier.past, earlier.present, earlier.future]).toEqual([['A'], 'B', ['C', 'D']]);
  expect(goToHistory(earlier, 3)).toMatchObject({past:history.past, present:history.present, future:history.future});
  expect(pushHistory(earlier, 'E', null, 5).future).toEqual([]);
  expect(goToHistory(earlier, 9)).toBe(earlier);
  const gesture = beginHistoryGesture(earlier);
  expect(goToHistory(gesture, 0)).toBe(gesture);
});
test('history labels identify the real scene edit', () => {
  const before = emptyShow();
  const scene = newScene('Stage');
  const after = {...before, scenes: [...before.scenes, scene]};
  expect(describeMapEdit(before, after).label).toBe('Add Stage');
  expect(describeMapEdit(after, before).label).toBe('Remove Stage');
});
