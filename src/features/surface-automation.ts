import type { Surface } from '../document';
import { object, number } from '../ai/catalog';
import { parameterKeys, parameterModulation } from '../ai/parameter-motion';
import { SURFACE_PARAMETERS } from './surface-parameters';
import { DEFAULT_TRANSFORM, type AnimatedProperty } from './types';

/** Canonical, atomic surface edits for the inspector and saved/live commands. */
export function editSurfaceAutomation(surface: Surface, changes: unknown): Surface {
  if (surface.locked) throw Error('This surface is locked.');
  const raw = object(changes, ['bases', 'animation', 'modulation', 'bend_axis']);
  let next = { ...surface };
  if (raw.bend_axis !== undefined) {
    if (raw.bend_axis !== 'horizontal' && raw.bend_axis !== 'vertical') throw Error('Use horizontal or vertical bend axis.');
    next.bend = { axis: raw.bend_axis, angleDeg: surface.bend?.angleDeg ?? 0 };
  }
  const properties = SURFACE_PARAMETERS.map(p => p.key);
  if (raw.bases !== undefined) for (const [key, rawValue] of Object.entries(object(raw.bases, properties))) {
    const spec = SURFACE_PARAMETERS.find(p => p.key === key)!;
    const value = number(rawValue, spec.label, spec.min, spec.max);
    if (key === 'opacity' || key === 'radiusPx') next = { ...next, [key]: value };
    else if (key === 'bendAngleDeg') next.bend = { axis: next.bend?.axis ?? 'horizontal', angleDeg: value };
    else next.transform = { ...DEFAULT_TRANSFORM, ...next.transform, [key]: value };
  }
  for (const field of ['animation', 'modulation'] as const) {
    if (raw[field] === undefined) continue;
    if (raw[field] === null) { next[field] = undefined; continue; }
    for (const [key, value] of Object.entries(object(raw[field], properties))) {
      const spec = SURFACE_PARAMETERS.find(p => p.key === key)!;
      if (field === 'animation') {
        const assignments = { ...next.animation }, keys = parameterKeys(value, spec.min, spec.max);
        if (keys) assignments[spec.key] = keys; else delete assignments[spec.key];
        next.animation = Object.keys(assignments).length ? assignments : undefined;
      } else {
        const assignments = { ...next.modulation }, m = parameterModulation(value, spec.min, spec.max);
        if (m) assignments[spec.key] = m; else delete assignments[spec.key];
        next.modulation = Object.keys(assignments).length ? assignments : undefined;
      }
    }
  }
  return next;
}

export function manualSurfaceParameter(surface: Surface, property: AnimatedProperty, value: number): Surface {
  return editSurfaceAutomation(surface, { bases: { [property]: value }, animation: { [property]: null }, modulation: { [property]: null } });
}

/** Source/clip fields must never enter the surface inspector's patch callback. */
export function surfaceAutomationPatch(before: Surface, next: Surface): Partial<Surface> {
  return Object.fromEntries((['opacity','transform','radiusPx','bend','animation','modulation'] as const)
    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(next[key])).map(key => [key, next[key]]));
}
