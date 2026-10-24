import { describe, expect, it } from 'vitest';
import { emptyShow } from '../document';
import { addPoolAsset, visualSource } from '../media-pool';
import { normalizeDocument } from '../normalize-document';
import { parseShow, serializeShow } from '../show-file';
import { runCommand } from './commands';
import { placeAsset } from './placement';
const fixture = () => addPoolAsset(normalizeDocument(emptyShow()), { mediaId: null, rect: [0, 0, 100, 100], fill: '#ff0000' }, 'Red');
const encode = (show: ReturnType<typeof fixture>) => new TextDecoder().decode(serializeShow(show));
describe('saved asset placement', () => {
  it('reopens distinct clips with inherited sources, track targets and preserved editor focus', () => {
    const show = fixture(), asset = show.pool![0], track = show.tracks![0];
    const args = { asset_id: asset.id, track_id: track.id, start_s: 2.5 };
    const first = runCommand('map.asset.place', encode(show), args);
    const second = runCommand('map.asset.place', first.content!, args);
    const next = parseShow(second.content!), clips = next.visuals!;
    expect(clips).toHaveLength(2);
    expect(clips[0].id).not.toBe(clips[1].id);
    expect(second.result).toMatchObject({ created: { clip_id: clips[1].id } });
    expect(clips[0]).toMatchObject({ assetID: asset.id, trackID: track.id, targets: track.targets, startS: 2.5, inS: 0 });
    expect(clips[0].source).toBeUndefined();
    expect(visualSource(next, clips[0])).toEqual(asset.source);
    expect(next.pool).toEqual(show.pool);
    expect(next.activeSceneId).toBe(show.activeSceneId);
    expect(next.activeTimelineID).toBe(show.activeTimelineID);
    expect(next.outputs).toEqual(show.outputs);
  });
  it.each([-1, NaN, Infinity, 604801, 604800])('rejects invalid timing %s without mutation', start_s => {
    const show = fixture(), before = encode(show);
    expect(() => placeAsset(show, { asset_id: show.pool![0].id, track_id: show.tracks![0].id, start_s })).toThrow();
    expect(encode(show)).toBe(before);
  });
  it('rejects unknown assets, locked tracks, incompatible audio and bounded clip counts', () => {
    const show = fixture(), args = { asset_id: show.pool![0].id, track_id: show.tracks![0].id, start_s: 0 };
    expect(() => placeAsset(show, { ...args, asset_id: 'missing' })).toThrow('not found');
    expect(() => placeAsset(show, { ...args, track_id: 'missing' })).toThrow('not found');
    show.tracks![0].locked = true;
    expect(() => placeAsset(show, args)).toThrow('refused');
    show.tracks![0].locked = false;
    show.tracks![0].kind = 'audio';
    expect(() => placeAsset(show, args)).toThrow('refused');
    show.visuals = Array(10000).fill({});
    expect(() => placeAsset(show, args)).toThrow('limit');
  });
});
