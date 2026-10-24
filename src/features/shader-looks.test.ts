import { expect, test } from 'vitest';
import { emptyShow, newSurface } from '../document';
import { parseShow, serializeShow } from '../show-file';
import { newShader } from './shader-catalog';
import { storeShaderLook, recallShaderLook, randomShaderLook } from './shader-looks';

test('A/B/C are independent snapshots and survive saved shows without nesting snapshots', () => {
  const initial = newShader('tunnel'); initial.parameters.scale = 2;
  const a = storeShaderLook(initial, 'A'); a.parameters.scale = 7;
  const b = storeShaderLook(a, 'B');
  expect(recallShaderLook(b, 'A').parameters.scale).toBe(2);
  expect(recallShaderLook(b, 'B').parameters.scale).toBe(7);
  expect(recallShaderLook(b, 'C')).toBe(b);
  expect(b.looks?.B).not.toHaveProperty('looks');
  const show = emptyShow(), surface = newSurface(show.output, 0);
  surface.source.shader = b; show.scenes[0].surfaces = [surface];
  const saved = parseShow(serializeShow(show)).scenes[0].surfaces[0].source.shader!;
  expect(recallShaderLook(saved, 'A').parameters.scale).toBe(2);
  expect(recallShaderLook(saved, 'B').parameters.scale).toBe(7);
});
test('randomization keeps stored looks and timing without invalidating discrete controls', () => {
  const shader = storeShaderLook(newShader('tunnel'), 'A');
  const next = randomShaderLook(shader, () => .5);
  expect(next.looks).toBe(shader.looks); expect(next.time).toBe(shader.time);
  expect(next.preset).toBe(shader.preset); expect(next.parameters.scale).toBeGreaterThan(0);
  expect(recallShaderLook(next, 'A').parameters).toEqual(shader.parameters);
});
