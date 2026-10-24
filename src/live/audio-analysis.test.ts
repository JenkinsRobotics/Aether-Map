import { expect, test } from 'vitest';
import { audioLevels, normalizeAudioSettings, SILENT_LEVELS } from './audio-analysis';

test('audio bands follow physical frequency, sensitivity and finite limits', () => {
  const bins = new Uint8Array(1024); bins[4] = 255; // 93.75 Hz at 48 kHz.
  const settings = { sensitivity: 1, smoothing: 0 };
  const level = audioLevels(bins, 48000, SILENT_LEVELS, settings, .016);
  expect(level.low).toBeGreaterThan(0); expect(level.mid).toBe(0); expect(level.high).toBe(0);
  expect(audioLevels(bins, 48000, SILENT_LEVELS, { ...settings, sensitivity: 2 }, .016).low).toBeCloseTo(level.low * 2);
  expect(audioLevels(new Uint8Array(1024).fill(255), 48000, SILENT_LEVELS, { ...settings, sensitivity: 10 }, .016).level).toBe(1);
  expect(normalizeAudioSettings({ sensitivity: NaN, smoothing: 100 })).toEqual({ sensitivity: 1, smoothing: 1 });
});
test('release smoothing is time based rather than frame-count dependent', () => {
  const settings = { sensitivity: 1, smoothing: .5 }, bins = new Uint8Array(1024);
  const full = { low: 1, mid: 1, high: 1, level: 1 };
  const once = audioLevels(bins, 48000, full, settings, .1);
  const first = audioLevels(bins, 48000, full, settings, .05);
  const twice = audioLevels(bins, 48000, first, settings, .05);
  expect(twice.level).toBeCloseTo(once.level);
  expect(audioLevels(bins, 48000, full, { ...settings, smoothing: 0 }, .1)).toEqual(SILENT_LEVELS);
});
