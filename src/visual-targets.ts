import type { MapShow } from './document';
import type { Visual, VisualTarget } from './visual-model';

export const sameVisualTarget = (a: VisualTarget, b: VisualTarget) =>
  a.sceneID === b.sceneID && a.surfaceID === b.surfaceID;

export function setVisualTarget(visual: Visual, target: VisualTarget, assigned: boolean): Visual {
  if (visual.locked) return visual;
  const targets = visual.targets.filter(t => !sameVisualTarget(t, target));
  return { ...visual, targets: assigned ? [...targets, target] : targets, legacyTrack: undefined };
}

/** Applies only to mapped faces in this scene; other scenes and full-scene targets survive. */
export function setSceneSurfaceTargets(visual: Visual, scene: MapShow['scenes'][number], assigned: boolean): Visual {
  if (visual.locked) return visual;
  const surfaces = scene.surfaces.filter(s => !s.sceneCanvas && s.kind !== 'mask');
  const ids = new Set(surfaces.map(s => s.id));
  const targets = visual.targets.filter(t => t.sceneID !== scene.id || !t.surfaceID || !ids.has(t.surfaceID));
  return { ...visual, targets: assigned ? [...targets, ...surfaces.map(s => ({ sceneID: scene.id, surfaceID: s.id }))] : targets, legacyTrack: undefined };
}
