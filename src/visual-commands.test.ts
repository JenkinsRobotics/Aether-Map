import { expect, it } from 'vitest';
import { emptyShow, newSurface, newScene } from './document';
import { normalizeVisuals, newVisual } from './visual-document';
import { createVisualCommands } from './visual-commands';
import { placeContent } from './content-placement';
import { sceneVisuals } from './visual-render';

it('keeps assignments with moved geometry, detaches deleted targets without deleting the visual', () => {
  const show = emptyShow(), face = newSurface(show.output, 0); face.source.fill = '#ff0000'; show.scenes[0].surfaces = [face];
  const next = normalizeVisuals(show), scene = newScene('Second');
  const geometry = next.scenes[0].surfaces[0];
  next.scenes[0].surfaces = []; next.scenes.push({ ...scene, surfaces: [geometry] });
  const moved = normalizeVisuals(next);
  expect(moved.visuals![0].targets).toEqual([{ sceneID: scene.id, surfaceID: face.id }]);
  const removed = normalizeVisuals({ ...moved, scenes: moved.scenes.map(s => ({ ...s, surfaces: [] })) });
  expect(removed.visuals).toHaveLength(1); expect(removed.visuals![0].targets).toEqual([]);
});
it('media placement creates one shared visual; append follows prior targets and replace keeps settings', () => {
  let show = normalizeVisuals(emptyShow());
  show.scenes[0].surfaces = [newSurface(show.output, 0), newSurface(show.output, 1)];
  const source = { mediaId: null, rect: [0,0,100,100] as [number,number,number,number], fill: '#ff0000' };
  const options = { sceneID: show.activeSceneId, target: 'surfaces' as const, placement: 'replace' as const, timeS: 0 };
  show = placeContent(show, source, options);
  expect(show.visuals).toHaveLength(1); expect(show.visuals![0].targets).toHaveLength(2);
  const appended = placeContent(show, source, { ...options, placement: 'append' });
  expect(appended.visuals![1].startS).toBe(show.visuals![0].durationS);
  const replaced = placeContent(show, { ...source, fill: '#0000ff' }, { ...options, clipID: show.visuals![0].id });
  expect(replaced.visuals).toHaveLength(1); expect(replaced.visuals![0].targets).toEqual(show.visuals![0].targets);
});
it('visual commands reorder, lock, unlock and duplicate without changing geometry or assigning copies in sequence', () => {
  let show = normalizeVisuals(emptyShow());
  const source = { mediaId: null, rect: [0,0,100,100] as [number,number,number,number], fill: '#ff0000' };
  const visual = newVisual(show, source, [{ sceneID: show.activeSceneId }]); show.visuals = [visual];
  const geometry = show.scenes;
  const commands = () => createVisualCommands({ show, edit: fn => { show = fn(show); }, select: () => {} });
  commands().change(visual.id, { ...visual, locked: true });
  commands().remove(visual.id, visual.id); expect(show.visuals).toHaveLength(1);
  commands().change(visual.id, { ...visual, name: 'ignored', locked: false });
  expect(show.visuals![0].name).toBe(visual.name); expect(show.visuals![0].locked).toBe(false);
  show.visuals!.push({ ...visual, id: 'second' });
  commands().move('', 'second', -1); expect(show.visuals![0].id).toBe('second');
  expect(show.scenes).toBe(geometry);
});
it('spanning keeps its window stable when a target is hidden and preserves target opacity', () => {
  const show = normalizeVisuals(emptyShow()), a = newSurface(show.output,0), b = newSurface(show.output,1);
  a.corners = [[0,0],[100,0],[100,100],[0,100]]; b.corners = [[100,0],[200,0],[200,100],[100,100]];
  show.scenes[0].surfaces = [a,b];
  const visual = newVisual(show, { ...a.source, fill: '#ff0000' }, [a,b].map(s => ({ sceneID: show.activeSceneId, surfaceID: s.id })));
  visual.mapping = 'span'; show.visuals = [visual];
  b.enabled = false; a.opacity = .5;
  const picture = sceneVisuals(show, show.scenes[0], 0)[0];
  expect(picture.corners[1][0]).toBe(200); expect(picture.opacity).toBe(.5);
  a.shape = 'ellipse';
  const ellipse = sceneVisuals(show, show.scenes[0], 0)[0];
  expect(ellipse.masks[0]).toHaveLength(96); expect(ellipse.shape).toBeUndefined();
});
