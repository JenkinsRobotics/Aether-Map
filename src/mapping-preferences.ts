import { useState } from 'react';

export interface MappingPreferences { snapping: boolean; snapDistancePx: number; pinSizePx: number; grid: boolean; showVisual?: boolean }
export const DEFAULT_MAPPING_PREFERENCES: MappingPreferences = { snapping: true, snapDistancePx: 6, pinSizePx: 7, grid: true, showVisual: false };
const KEY = 'aether-map.mapping-preferences';
export function readMappingPreferences(): MappingPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const bounded = (value: unknown, fallback: number, min: number, max: number) =>
      typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    return { snapping: typeof saved.snapping === 'boolean' ? saved.snapping : true,
      grid: typeof saved.grid === 'boolean' ? saved.grid : true, showVisual: saved.showVisual === true,
      snapDistancePx: bounded(saved.snapDistancePx, 6, 1, 30), pinSizePx: bounded(saved.pinSizePx, 7, 4, 16) };
  } catch { return DEFAULT_MAPPING_PREFERENCES; }
}
/** Editor preferences never enter the show or change projector output. */
export function useMappingPreferences() {
  const [preferences, setPreferences] = useState(readMappingPreferences);
  const update = (patch: Partial<MappingPreferences>) => setPreferences(current => {
    const next = { ...current, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Session-only if storage is unavailable. */ }
    return next;
  });
  return [preferences, update] as const;
}
