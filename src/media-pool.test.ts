import { expect, it } from 'vitest';
import { emptyShow, newSurface } from './document';
import { normalizeVisuals, newVisual } from './visual-document';
import { addPoolAsset, addVisualTrack, normalizeMediaPool, placePoolAsset, removePoolAsset, visualSource } from './media-pool';
import { parseShow, serializeShow } from './show-file';
import { sceneVisuals } from './visual-render';

it('migrates legacy visuals without changing timing, source, masks or paint order and roundtrips references', () => {
  let show = normalizeVisuals(emptyShow());
  const source = { mediaId: null, rect: [0,0,100,100] as [number,number,number,number], fill: '#ff0000' };
  const v = newVisual(show, source, [{ sceneID: show.activeSceneId }], 2); v.durationS = 6;
  show.visuals = [v, { ...v, id: 'mask', mask: true, source: { ...source, fill: '#000000' } }];
  const before = sceneVisuals(show, show.scenes[0], 3);
  show = normalizeMediaPool(show);
  expect(show.pool).toHaveLength(1);
  expect(show.visuals![0].source).toBeUndefined();
  expect(show.visuals![0].id).toBe(v.id);
  expect(sceneVisuals(show, show.scenes[0], 3)).toEqual(before);
  expect(normalizeMediaPool(show)).toBe(show);
  expect(parseShow(serializeShow(show))).toMatchObject({ version: 6, pool: show.pool, visuals: show.visuals, tracks: show.tracks });
});
it('one source supports independent clips, targets, append, overrides, track order and visibility', () => {
  let show = normalizeMediaPool(normalizeVisuals(emptyShow()));
  const scene = show.scenes[0], face = newSurface(show.output, 0); scene.surfaces = [face];
  show = normalizeMediaPool(show);
  show = addPoolAsset(show, { mediaId: null, rect: [0,0,100,100], fill: '#ff0000' }, 'Red');
  const asset = show.pool!.at(-1)!;
  show = addVisualTrack(show, [{ sceneID: scene.id, surfaceID: face.id }]);
  const track = show.tracks!.at(-1)!;
  show = placePoolAsset(show, asset.id, track.id, 2);
  show = placePoolAsset(show, asset.id, track.id);
  expect(show.visuals![1].startS).toBe(2 + show.visuals![0].durationS);
  expect(show.visuals![0].assetID).toBe(show.visuals![1].assetID);
  expect(show.visuals![0].id).not.toBe(show.visuals![1].id);
  expect(show.pool).toHaveLength(1);
  show = addVisualTrack(show, [{ sceneID: scene.id }], 'Overlay');
  const upper = show.tracks!.at(-1)!;
  show = placePoolAsset(show, asset.id, upper.id, 2);
  show.visuals![2].source = { ...asset.source, fill: '#0000ff' };
  expect(visualSource(show, show.visuals![0]).fill).toBe('#ff0000');
  expect(show.pool![0].source.fill).toBe('#ff0000');
  expect(sceneVisuals(show, scene, 3).map(s => s.source.fill)).toEqual(['#ff0000', '#0000ff']);
  upper.enabled = false;
  expect(sceneVisuals(show, scene, 3).map(s => s.source.fill)).toEqual(['#ff0000']);
  expect(removePoolAsset(show, asset.id)).toBe(show);
  show = { ...show, visuals: [] };
  expect(show.pool).toHaveLength(1);
  expect(removePoolAsset(show, asset.id).pool).toHaveLength(0);
  track.locked = true;
  expect(placePoolAsset(show, asset.id, track.id)).toBe(show);
});

it('rejects broken reusable-source references instead of silently dropping a clip', () => {
  let show = normalizeMediaPool(normalizeVisuals(emptyShow()));
  show = addPoolAsset(show, { mediaId: null, rect: [0,0,100,100], fill: '#ff0000' }, 'Source');
  show = placePoolAsset(show, show.pool![0].id, show.tracks![0].id);
  expect(() => parseShow(serializeShow({ ...show, pool: [] }))).toThrow('Missing media pool asset');
});
