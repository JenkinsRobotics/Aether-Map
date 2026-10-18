import type { ShaderSource } from './types';
import { newShader, SHADERS } from './shader-catalog';

export type LookSlot = 'A' | 'B' | 'C';
export function storeShaderLook(shader: ShaderSource, slot: LookSlot): ShaderSource {
  const { looks: _looks, ...look } = shader;
  return { ...shader, looks: { ...shader.looks, [slot]: structuredClone(look) } };
}
export function recallShaderLook(shader: ShaderSource, slot: LookSlot): ShaderSource {
  const look = shader.looks?.[slot];
  return look ? { ...structuredClone(look), looks: shader.looks } : shader;
}
/** Random starts from a valid catalog variation and varies continuous controls only. */
export function randomShaderLook(shader: ShaderSource, random = Math.random): ShaderSource {
  const entry = SHADERS.find(item => item.id === shader.preset) ?? SHADERS[0];
  const next = newShader(entry.id, Math.floor(random() * entry.presets.length));
  next.colors = next.colors.map(() => `#${Math.floor(random() * 0x1000000).toString(16).padStart(6, '0')}`);
  if (typeof next.parameters.scale === 'number') next.parameters.scale = .5 + random() * 1.5;
  if (typeof next.parameters.rotation === 'number') next.parameters.rotation = random() * 360;
  if (typeof next.parameters.speed === 'number') next.parameters.speed = .25 + random() * 1.75;
  return { ...next, time: shader.time, modulation: shader.modulation, animation: shader.animation, looks: shader.looks };
}
