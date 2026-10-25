import { expect, it } from 'vitest';
import { emptyShow } from './document';
import { createClip } from './compound-clips';
import { addPoolAsset } from './media-pool';
import { addBin, duplicatePoolAsset, moveToBin, poolBins, removeBin, renameBin } from './media-bins';

const setup = () => {
  const s = addPoolAsset(createClip(emptyShow(), 'Clip 1'), { mediaId: null, rect: [0, 0, 10, 10], fill: '#f00' }, 'Red');
  return { s, asset: s.pool!.at(-1)!.id, clip: s.timelines!.find(t => t.name === 'Clip 1')!.id };
};

it('keeps an empty bin, files media and clips into it, and lists it once', () => {
  const { s, asset, clip } = setup();
  const a = addBin(s, 'Footage');
  expect(poolBins(a)).toEqual(['Footage']);
  const b = moveToBin(a, [{ kind: 'asset', id: asset }, { kind: 'clip', id: clip }], 'Footage');
  expect(b.pool!.find(x => x.id === asset)!.folder).toBe('Footage');
  expect(b.timelines!.find(t => t.id === clip)!.folder).toBe('Footage');
  expect(poolBins(b)).toEqual(['Footage']);
  expect(moveToBin(b, [{ kind: 'asset', id: asset }], undefined).pool!.find(x => x.id === asset)!.folder).toBeUndefined();
});

it('renames a bin with its contents, and removing it returns them to Master', () => {
  const { s, asset, clip } = setup();
  const b = moveToBin(addBin(s, 'A'), [{ kind: 'asset', id: asset }, { kind: 'clip', id: clip }], 'A');
  const r = renameBin(b, 'A', 'B');
  expect(poolBins(r)).toEqual(['B']);
  expect(r.pool!.find(x => x.id === asset)!.folder).toBe('B');
  expect(r.timelines!.find(t => t.id === clip)!.folder).toBe('B');
  const d = removeBin(r, 'B');
  expect(poolBins(d)).toEqual([]);
  expect(d.pool!.find(x => x.id === asset)!.folder).toBeUndefined();
  expect(d.timelines!.find(t => t.id === clip)!.folder).toBeUndefined();
});

it('duplicates a pool asset beside the original', () => {
  const { s, asset } = setup();
  const d = duplicatePoolAsset(s, asset);
  expect(d.pool).toHaveLength(s.pool!.length + 1);
  const copy = d.pool!.at(-1)!;
  expect(copy.id).not.toBe(asset);
  expect(copy.name).toBe('Red copy');
  expect(copy.source).toEqual(s.pool!.find(x => x.id === asset)!.source);
});

it('saves empty bins with the show', async () => {
  const { parseShow, serializeShow } = await import('./show-file');
  expect(parseShow(serializeShow(addBin(emptyShow(), 'Empty'))).poolBins).toEqual(['Empty']);
});
