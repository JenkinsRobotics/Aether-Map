import { expect, test } from 'vitest';
import { detectAudioBeat, SILENT_BEAT } from './audio-beat';

test('attacks pulse, steady tones do not retrigger, silence decays, and later attacks retrigger', () => {
  let state = { ...SILENT_BEAT };
  for (let i = 0; i < 60; i++) state = detectAudioBeat(state, 0, 1 / 60);
  expect(state.pulse).toBe(0);
  state = detectAudioBeat(state, .8, 1 / 60); expect(state.pulse).toBe(1);
  for (let i = 0; i < 60; i++) state = detectAudioBeat(state, .8, 1 / 60);
  expect(state.pulse).toBeLessThan(.01);
  for (let i = 0; i < 60; i++) state = detectAudioBeat(state, 0, 1 / 60);
  state = detectAudioBeat(state, .8, 1 / 60); expect(state.pulse).toBe(1);
  state = detectAudioBeat(state, 0, .05);
  state = detectAudioBeat(state, .9, .05); expect(state.pulse).toBeLessThan(1);
});

test('pulse release is frame-rate independent and small noise does not trigger', () => {
  const beat = detectAudioBeat(SILENT_BEAT, .8, .016);
  const once = detectAudioBeat(beat, 0, .1);
  const twice = detectAudioBeat(detectAudioBeat(beat, 0, .05), 0, .05);
  expect(twice.pulse).toBeCloseTo(once.pulse);
  expect(detectAudioBeat(SILENT_BEAT, .02, .016).pulse).toBe(0);
  expect(detectAudioBeat(SILENT_BEAT, NaN, .016).pulse).toBe(0);
});
