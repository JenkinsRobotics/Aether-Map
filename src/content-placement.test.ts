import { expect, test } from 'vitest';
import { emptyShow, newScene, newSurface } from './document';
import { canPlaceContent, placeContent, resizeSceneContent, type PlaceContent } from './content-placement';
import { evaluateSurface } from './playback';
import { parseShow, serializeShow } from './show-file';
function fixture() { const show = emptyShow(); show.scenes[0].surfaces = [newSurface(show.output, 0), newSurface(show.output, 1)]; show.scenes.push(newScene('Other')); return show; }
const source = { mediaId: 'image', rect: [0, 0, 640, 360] as [number, number, number, number] };
test('scene content is a persistent ordinary layer above existing layers and replaces in place', () => {
  const show = fixture(), options: PlaceContent = { sceneID: show.activeSceneId, target: 'scene', placement: 'replace', timeS: 0 };
  const next = placeContent(show, source, options), canvas = next.scenes[0].surfaces[2];
  expect(canvas.sceneCanvas).toBe(true); expect(canvas.corners).toEqual([[0, 0], [1920, 0], [1920, 1080], [0, 1080]]);
  expect(next.scenes[0].surfaces.slice(0, 2)).toEqual(show.scenes[0].surfaces);
  const restored = parseShow(serializeShow(next)); expect(restored.scenes[0].surfaces[2].sceneCanvas).toBe(true);
  const replaced = placeContent(restored, { ...source, mediaId: 'second' }, options);
  expect(replaced.scenes[0].surfaces).toHaveLength(3);
  expect(evaluateSurface(replaced.scenes[0].surfaces[2], 0).source.mediaId).toBe('second');
  expect(replaced.scenes[1]).toEqual(show.scenes[1]);
});
test('applying to all surfaces preserves masks, geometry, locks, and other scenes', () => {
  const show = fixture(); show.scenes[0].surfaces.push({ ...newSurface(show.output, 2), kind: 'mask' });
  show.scenes[0].surfaces[1].locked = true;
  const next = placeContent(show, source, { sceneID: show.activeSceneId, target: 'surfaces', placement: 'replace', timeS: 0 });
  expect(evaluateSurface(next.scenes[0].surfaces[0], 0).source.mediaId).toBe('image');
  expect(next.scenes[0].surfaces[0].corners).toEqual(show.scenes[0].surfaces[0].corners);
  expect(next.scenes[0].surfaces.slice(1)).toEqual(show.scenes[0].surfaces.slice(1));
  expect(next.scenes[1]).toBe(show.scenes[1]);
  expect(canPlaceContent(show, 'surface', show.scenes[0].surfaces[1].id)).toBe(false);
});
test('replace keeps a clip identity and timing; append retains the previous content', () => {
  const show = fixture(), options: PlaceContent = { sceneID: show.activeSceneId, target: 'surface', surfaceID: show.scenes[0].surfaces[0].id, placement: 'replace', timeS: 0 };
  const first = placeContent(show, source, options), clip = first.scenes[0].surfaces[0].clips[0];
  const next = placeContent(first, { ...source, mediaId: 'second' }, options);
  expect(next.scenes[0].surfaces[0].clips[0]).toEqual({ ...clip, source: { ...source, mediaId: 'second' }, mediaId: undefined });
  const appended = placeContent(next, source, { ...options, placement: 'append' }).scenes[0].surfaces[0].clips;
  expect(appended).toHaveLength(2); expect(appended[1].startS).toBe(clip.startS + clip.durationS);
});

test('scene visual follows artboard resize while surface geometry and timing stay unchanged', () => {
  const show = fixture();
  const next = placeContent(show, source, { sceneID: show.activeSceneId, target: 'scene', placement: 'replace', timeS: 0 });
  const scene = next.scenes[0], result = resizeSceneContent(next, scene, { ...scene, artboard: { widthPx: 1080, heightPx: 1920 } });
  expect(result.surfaces[2].corners).toEqual([[0, 0], [1080, 0], [1080, 1920], [0, 1920]]);
  expect(result.surfaces[2].clips).toEqual(scene.surfaces[2].clips);
  expect(result.surfaces.slice(0, 2)).toEqual(scene.surfaces.slice(0, 2));
});
