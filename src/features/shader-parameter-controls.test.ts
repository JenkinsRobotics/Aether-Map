import { expect, test } from 'vitest';
import { modulationLabel, parameterSliderRange } from './shader-parameter-controls';
import { DEFAULT_MODULATION } from './types';

test('only known controls get suggested slider intervals; assignments name their real source', () => {
  expect(parameterSliderRange('speed')).toEqual({ min: 0, max: 5 });
  expect(parameterSliderRange('worldWidth')).toBeUndefined();
  expect(modulationLabel({ ...DEFAULT_MODULATION, source: 'lfo', lfoIndex: 2 })).toBe('LFO 3');
  expect(modulationLabel({ ...DEFAULT_MODULATION, source: 'audio', band: 'high' })).toBe('Treble');
  expect(modulationLabel({ ...DEFAULT_MODULATION, source: 'midi', control: 24 })).toBe('MIDI 24');
});
