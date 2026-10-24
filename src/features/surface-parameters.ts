import type { MapShow, Surface } from '../document';
import { DEFAULT_TRANSFORM, type AnimatedProperty } from './types';

/** Surface geometry uses scene pixels and degrees, independent of source content. */
export const SURFACE_PARAMETERS = [
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: .01, unit: '' },
  { key: 'xPx', label: 'Horizontal offset', min: -1e6, max: 1e6, step: 1, unit: 'px' },
  { key: 'yPx', label: 'Vertical offset', min: -1e6, max: 1e6, step: 1, unit: 'px' },
  { key: 'scaleX', label: 'Horizontal scale', min: .01, max: 100, step: .01, unit: '×' },
  { key: 'scaleY', label: 'Vertical scale', min: .01, max: 100, step: .01, unit: '×' },
  { key: 'rotationDeg', label: 'Rotation', min: -3600, max: 3600, step: 1, unit: '°' },
  { key: 'radiusPx', label: 'Corner radius', min: 0, max: 16384, step: 1, unit: 'px' },
  { key: 'bendAngleDeg', label: 'Bend angle', min: -170, max: 170, step: 1, unit: '°' },
] as const;
export function surfaceParameterBase(surface: Surface, property: AnimatedProperty): number {
  if (property === 'opacity') return surface.opacity;
  if (property === 'radiusPx') return surface.radiusPx ?? 0;
  if (property === 'bendAngleDeg') return surface.bend?.angleDeg ?? 0;
  return surface.transform?.[property] ?? DEFAULT_TRANSFORM[property];
}
export function surfaceMotionVersion(show: MapShow): MapShow {
  const surfaces = [...show.scenes.flatMap(s => s.surfaces), ...(show.unassignedSurfaces ?? [])];
  return show.version < 12 && surfaces.some(s => Object.keys(s.modulation ?? {}).length || s.animation?.radiusPx?.length || s.animation?.bendAngleDeg?.length)
    ? { ...show, version: 12 } : show;
}
