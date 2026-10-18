import { expect, it } from 'vitest';
import { emptyShow, newScene, newSurface } from './document';
import { newVisual } from './visual-document';
import { setSceneSurfaceTargets, setVisualTarget } from './visual-targets';

it('assigns one shared instance without duplicating targets, preserving other scenes and source', () => {
  const show = emptyShow(), scene = show.scenes[0], other = newScene('Other');
  const a = newSurface(show.output, 0), b = newSurface(show.output, 1);
  scene.surfaces = [a, b, { ...newSurface(show.output, 2), kind: 'mask' }];
  const original = { ...newVisual(show, a.source, [{ sceneID: other.id }]), legacyTrack: a.id };
  const first = setVisualTarget(original, { sceneID: scene.id, surfaceID: a.id }, true);
  const second = setVisualTarget(first, { sceneID: scene.id, surfaceID: a.id }, true);
  expect(second.targets).toHaveLength(2); expect(second.source).toBe(original.source);
  expect(second.id).toBe(original.id); expect(second.legacyTrack).toBeUndefined();
  const whole = setVisualTarget(second, { sceneID: scene.id }, true);
  const all = setSceneSurfaceTargets(whole, scene, true);
  expect(all.targets).toEqual([{ sceneID: other.id }, { sceneID: scene.id }, { sceneID: scene.id, surfaceID: a.id }, { sceneID: scene.id, surfaceID: b.id }]);
  const none = setSceneSurfaceTargets(all, scene, false);
  expect(none.targets).toEqual([{ sceneID: other.id }, { sceneID: scene.id }]);
  expect(original.targets).toEqual([{ sceneID: other.id }]);
});

it('target edits leave locked visuals unchanged', () => {
  const show = emptyShow(), scene = show.scenes[0], face = newSurface(show.output, 0);
  scene.surfaces = [face];
  const visual = { ...newVisual(show, face.source, []), locked: true };
  expect(setVisualTarget(visual, { sceneID: scene.id, surfaceID: face.id }, true)).toBe(visual);
  expect(setSceneSurfaceTargets(visual, scene, true)).toBe(visual);
});
