import { putKeyframe } from './animation';
import type { FeatureKeyframe } from './types';

export const MAX_PARAMETER_KEYS = 1000;
export const MAX_PARAMETER_TIME_S = 604800;

/** File recovery is bounded and deterministic; commands validate before calling it. */
export function readParameterKeys(value: unknown, min = -1e6, max = 1e6): FeatureKeyframe[] {
  if (!Array.isArray(value)) return [];
  let keys: FeatureKeyframe[] = [];
  for (const [index, raw] of value.slice(0, MAX_PARAMETER_KEYS).entries()) {
    if (!raw || typeof raw !== 'object' || !Number.isFinite(raw.timeS) || !Number.isFinite(raw.value)) continue;
    keys = putKeyframe(keys, { id: typeof raw.id === 'string' && raw.id ? raw.id : `parameter-key-${index}`,
      timeS: Math.max(0, Math.min(MAX_PARAMETER_TIME_S, raw.timeS)), value: Math.max(min, Math.min(max, raw.value)),
      interpolation: raw.interpolation === 'hold' || raw.interpolation === 'smooth' ? raw.interpolation : 'linear' });
  }
  return keys;
}

export function readParameterAnimation(value: unknown): Record<string, FeatureKeyframe[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 256).flatMap(([name, raw]) => {
    if (['__proto__', 'constructor', 'prototype'].includes(name)) return [];
    const keys = readParameterKeys(raw);
    return keys.length ? [[name, keys]] : [];
  }));
}
