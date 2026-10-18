import { expect, test } from 'vitest';
import { emptyShow, newScene, newSurface } from './document';
import { createLayerFolder, folderNames, moveTreeLayer, patchLayerFolder, renameLayerFolder, stepLayerFolder } from './layer-tree-commands';
import { canDeleteLayer, deleteTreeLayer, folderID, resolveTreeID, canvasDestinationRowID, moveCanvasItemToScene, unassignCanvasItem } from './scene-tree';
import { parseShow, serializeShow } from './show-file';

function fixture() {
  const show = emptyShow();
  const a = newScene('Front'), b = newScene('Side');
  a.surfaces = ['bottom', 'a', 'b', 'top'].map((id, i) => ({ ...newSurface(show.output, i), id }));
  return { ...show, activeSceneId: a.id, scenes: [a, b] };
}
test('empty folders persist, rename and delete independently from scene and surfaces', () => {
  const show = fixture(), owner = show.scenes[1].id;
  let next = createLayerFolder(show, owner, 'Empty');
  next = parseShow(serializeShow(next));
  expect(resolveTreeID(next, folderID(owner, 'Empty'))?.kind).toBe('folder');
  next = renameLayerFolder(next, owner, 'Empty', 'Scenery');
  expect(folderNames(next, owner)).toEqual(['Scenery']);
  expect(canDeleteLayer(next, folderID(owner, 'Scenery'))).toBe(true);
  next = deleteTreeLayer(next, folderID(owner, 'Scenery'));
  expect(folderNames(next, owner)).toEqual([]);
  expect(next.scenes[0].surfaces.map(s => s.id)).toEqual(['bottom', 'a', 'b', 'top']);
  expect(next.scenes).toHaveLength(2);
});
test('group, hide, show, reorder and ungroup preserve member geometry and content', () => {
  const show = fixture(), owner = show.scenes[0].id, id = folderID(owner, 'Pair');
  let next = createLayerFolder(show, owner, 'Pair', ['a', 'b']);
  next = patchLayerFolder(next, id, { enabled: false });
  expect(next.scenes[0].surfaces.filter(s => !s.enabled).map(s => s.id)).toEqual(['a', 'b']);
  next = patchLayerFolder(next, id, { enabled: true });
  next = stepLayerFolder(next, id, 1);
  expect(next.scenes[0].surfaces.map(s => s.id)).toEqual(['bottom', 'top', 'a', 'b']);
  next = stepLayerFolder(next, id, -1);
  next = renameLayerFolder(next, owner, 'Pair', '');
  expect(folderNames(next, owner)).toEqual([]);
  expect(next.scenes[0].surfaces).toEqual(show.scenes[0].surfaces);
});
test('moves entire groups between scenes without merging names or changing identities', () => {
  const show = fixture(), [a, b] = show.scenes;
  let next = createLayerFolder(show, a.id, 'Pair', ['a', 'b']);
  next = createLayerFolder(next, b.id, 'Pair');
  next = moveTreeLayer(next, folderID(a.id, 'Pair'), b.id, 'inside');
  expect(next.scenes[0].surfaces.map(s => s.id)).toEqual(['bottom', 'top']);
  expect(next.scenes[1].surfaces.map(s => [s.id, s.folder])).toEqual([['a', 'Pair 2'], ['b', 'Pair 2']]);
  expect(folderNames(next, a.id)).toEqual([]);
  expect(folderNames(next, b.id)).toEqual(['Pair', 'Pair 2']);
  expect(next.scenes[1].surfaces[0].corners).toEqual(a.surfaces[1].corners);
});
test('before/after drops use tree order in another scene and empty folders accept layers', () => {
  const show = fixture(), [a, b] = show.scenes;
  let next = createLayerFolder(show, b.id, 'Empty');
  next = moveTreeLayer(next, 'a', folderID(b.id, 'Empty'), 'inside');
  next = moveTreeLayer(next, 'b', 'a', 'before');
  expect(next.scenes[1].surfaces.map(s => [s.id, s.folder])).toEqual([['a', 'Empty'], ['b', 'Empty']]);
  next = moveTreeLayer(next, 'top', 'a', 'after');
  expect(next.scenes[1].surfaces.map(s => s.id)).toEqual(['top', 'a', 'b']);
  next = moveTreeLayer(next, 'a', b.id, 'inside');
  expect(next.scenes[1].surfaces.at(-1)?.folder).toBeUndefined();
  expect(next.scenes[0].id).toBe(a.id);
});
test('a locked member blocks group movement, deletion and ungrouping atomically', () => {
  const show = fixture(), [a, b] = show.scenes;
  let next = createLayerFolder(show, a.id, 'Pair', ['a', 'b']);
  next.scenes[0].surfaces[1].locked = true;
  const id = folderID(a.id, 'Pair');
  expect(moveTreeLayer(next, id, b.id, 'inside')).toBe(next);
  expect(deleteTreeLayer(next, id)).toBe(next);
  expect(renameLayerFolder(next, a.id, 'Pair', '')).toBe(next);
});
test('workspace folders can be empty, take members and transfer into a scene', () => {
  const show = fixture();
  show.unassignedSurfaces = [show.scenes[0].surfaces.pop()!];
  let next = createLayerFolder(show, null, 'Loose', ['top']);
  next = parseShow(serializeShow(next));
  expect(resolveTreeID(next, folderID(null, 'Loose'))?.kind).toBe('folder');
  next = moveTreeLayer(next, folderID(null, 'Loose'), show.scenes[1].id, 'inside');
  expect(next.unassignedSurfaces).toEqual([]);
  expect(next.unassignedFolders).toEqual([]);
  expect(next.scenes[1].surfaces[0].id).toBe('top');
});


test('canvas transfers carry explicit folders and avoid empty destination folder names', () => {
  const show = fixture(), [a, b] = show.scenes;
  let next = createLayerFolder(show, a.id, 'Pair', ['a', 'b']);
  next = createLayerFolder(next, b.id, 'Pair');
  const id = folderID(a.id, 'Pair');
  expect(canvasDestinationRowID(next, id, b.id)).toBe(folderID(b.id, 'Pair 2'));
  next = moveCanvasItemToScene(next, id, b.id, [0, 0]);
  expect(folderNames(next, a.id)).toEqual([]);
  expect(folderNames(next, b.id)).toEqual(['Pair', 'Pair 2']);
  next = unassignCanvasItem(next, folderID(b.id, 'Pair 2'), [0, 0]);
  expect(folderNames(next, b.id)).toEqual(['Pair']);
  expect(folderNames(next, null)).toEqual(['Pair 2']);
});
