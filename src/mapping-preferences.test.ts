// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { DEFAULT_MAPPING_PREFERENCES, readMappingPreferences } from './mapping-preferences';
afterEach(() => localStorage.removeItem('aether-map.mapping-preferences'));
test('mapping preferences tolerate missing, invalid and out-of-range saved settings', () => {
  localStorage.setItem('aether-map.mapping-preferences', '{broken');
  expect(readMappingPreferences()).toEqual(DEFAULT_MAPPING_PREFERENCES);
  localStorage.setItem('aether-map.mapping-preferences', JSON.stringify({ snapping: false, grid: false, pinSizePx: 400, snapDistancePx: -2 }));
  expect(readMappingPreferences()).toEqual({ snapping: false, grid: false, pinSizePx: 16, snapDistancePx: 1, showVisual: false });
  localStorage.setItem('aether-map.mapping-preferences', 'null');
  expect(readMappingPreferences()).toEqual(DEFAULT_MAPPING_PREFERENCES);
});

test('mapping visual preview is opt-in and survives reopening without changing legacy defaults', () => {
  expect(readMappingPreferences().showVisual).toBe(false);
  localStorage.setItem('aether-map.mapping-preferences', JSON.stringify({ showVisual: true }));
  expect(readMappingPreferences().showVisual).toBe(true);
});
