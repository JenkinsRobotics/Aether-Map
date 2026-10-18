import { expect, test } from 'vitest';
import { applyAudioResponse } from './audio-response';
import { newShader, SHADERS } from './shader-catalog';
import { shaderAt, usesAudio } from './shader-motion';
import { emptyShow, newSurface } from '../document';
import { parseShow, serializeShow } from '../show-file';

test.each(SHADERS.map(shader => shader.id))('%s supports a real audio assignment', id => {
  for (const mode of ['beat', 'bass', 'treble', 'mix'] as const) {
    const shader = applyAudioResponse(newShader(id), mode);
    expect(usesAudio(shader)).toBe(true);
  }
});

test('beat pulses change actual shader parameters, preserve other assignments and survive saving', () => {
  const original = newShader('tunnel');
  original.modulation = { rotation: { source: 'midi', control: 5, amount: 3, periodS: 1, waveform: 'sine', phase: 0 } };
  const shader = applyAudioResponse(original, 'beat');
  expect(shader.modulation!.rotation).toEqual(original.modulation.rotation);
  const quiet = shaderAt(shader, 0, { beat: 0 }), hit = shaderAt(shader, 0, { beat: 1 });
  expect(hit.parameters.scale).toBeGreaterThan(quiet.parameters.scale as number);
  const show = emptyShow(), surface = newSurface(show.output, 0);
  surface.source.shader = shader; show.scenes[0].surfaces = [surface];
  expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].source.shader).toEqual(shader);
});

test('manual BPM uses scene time through local visual loops without audio', () => {
  const shader = applyAudioResponse(newShader('tunnel'), 'tempo', 120);
  expect(usesAudio(shader)).toBe(false);
  expect(shader.modulation!.scale.periodS).toBe(.5);
  expect(shaderAt(shader, 0, {}, {}, undefined, .25).parameters.scale)
    .toBe(shaderAt(shader, 14.75, {}, {}, undefined, .25).parameters.scale);
  expect(shaderAt(shader, 0, {}, {}, undefined, .5).parameters.scale)
    .toBe(shaderAt(shader, 0, {}, {}, undefined, 0).parameters.scale);
});
