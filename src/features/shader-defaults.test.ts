import { expect, test } from 'vitest';
import { newShader, SHADERS } from './shader-catalog';
import { shaderAt, shaderTimeS } from './shader-motion';
import { shaderRenderSpeed } from './ShaderMedia';
import { contentClip } from '../surface-assets';
import { emptyShow, newSurface } from '../document';
import { parseShow, serializeShow } from '../show-file';

test('every new shader starts animated with explicit editable 15-second timing', () => {
  for (const preset of SHADERS) {
    const shader = newShader(preset.id);
    expect(shader.time).toMatchObject({ loopS: 15, frozen: false });
    expect(shader.parameters.speed).not.toBe(0);
    const a = shaderAt(shader, 0), b = shaderAt(shader, 3.75);
    if (shader.modulation) expect(a.parameters.rotation).not.toBe(b.parameters.rotation);
    expect(shaderTimeS(shader.time, 16)).toBe(1);
    const clip = contentClip({ mediaId: null, rect: [0, 0, 640, 360], shader }, []);
    expect(clip).toMatchObject({ durationS: 15, loop: true });
  }
  expect(shaderRenderSpeed('tunnel')).toBe(1);
  expect(shaderRenderSpeed('kaleidoscope')).toBe(1);
  expect(shaderRenderSpeed('mesh-gradient')).toBe(0);
});
test('explicit static legacy sources and user timing roundtrip without adopting new defaults', () => {
  const show = emptyShow(), surface = newSurface(show.output, 0);
  surface.source.shader = { preset: 'tunnel', colors: [], parameters: { speed: 0 } };
  show.scenes[0].surfaces = [surface];
  expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].source.shader).toEqual(surface.source.shader);
  surface.source.shader = { ...newShader(), time: { loopS: 23, offsetS: 4, frozen: true, direction: 'reverse' } };
  expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].source.shader).toEqual(surface.source.shader);
});
