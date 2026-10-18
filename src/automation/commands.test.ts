import { describe, expect, it } from 'vitest';
import { emptyShow, newSurface } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addPoolAsset, placePoolAsset } from '../media-pool';
import { parseShow, serializeShow } from '../show-file';
import { runCommand } from './commands';
import { sceneVisuals } from '../visual-render';
import { initialHistory, pushHistory, redoHistory, undoHistory } from '../history';

function fixture() {
  let show = emptyShow();
  show.scenes[0].surfaces = [newSurface(show.output, 0)];
  show = normalizeDocument(show);
  show = addPoolAsset(show, { mediaId: null, rect: [0, 0, 1920, 1080], fill: '#ff0000' }, 'Red');
  const track = show.tracks!.find(t => t.timelineID && t.kind === 'video')!;
  show = placePoolAsset(show, show.pool![0].id, track.id, 2);
  const clip = show.visuals!.find(v => !v.timelineRefID)!;
  clip.durationS = 10; clip.inS = 3;
  return { show, track, clip };
}
const encode = (show: ReturnType<typeof emptyShow>) => new TextDecoder().decode(serializeShow(show));

describe('saved Map agent commands', () => {
  it('inspects stable grouped surface timelines without saving or embedding source payloads', () => {
    const { show } = fixture(), content = encode(show);
    const result = runCommand('map.show.inspect', content, {});
    expect(result.content).toBeUndefined();
    expect(result.result).toMatchObject({ scenes: [{ surfaces: [{ id: show.scenes[0].surfaces[0].id }] }], assets: [{ name: 'Red', kind: 'fill' }] });
    expect(runCommand('map.show.inspect', content, {})).toEqual(result);
  });
  it('evaluates Main, independent of saved child editor focus, using the actual compositor', () => {
    const { show, track } = fixture();
    show.activeTimelineID = track.timelineID;
    const args = { scene_id: show.activeSceneId, time_s: 5 };
    const result = runCommand('map.show.evaluate', encode(show), args).result;
    const expected = sceneVisuals({ ...show, activeTimelineID: 'main' }, show.scenes[0], 5);
    expect(result).toMatchObject({ pixel_preview: false, layers: expected.map(s => ({ id: s.id, opacity: s.opacity, corners: s.corners, media_time_s: s.mediaTimeS })) });
    expect(runCommand('map.show.evaluate', encode(show), { ...args, time_s: 0 }).result).toMatchObject({ layers: [] });
    show.scenes[0].suppressed = true;
    expect(runCommand('map.show.evaluate', encode(show), args).result).toMatchObject({ layers: [], audio: [] });
  });
  it('moves a clip while preserving source, surfaces, duration and trim', () => {
    const { show, track, clip } = fixture();
    const changed = runCommand('map.clip.move', encode(show), { clip_id: clip.id, track_id: track.id, start_s: 4.25 });
    const next = parseShow(changed.content!);
    expect(next.visuals!.find(v => v.id === clip.id)).toMatchObject({ ...clip, startS: 4.25 });
    expect(next.pool).toEqual(show.pool);
    expect(next.scenes).toEqual(parseShow(encode(show)).scenes);
  });
  it('splits with continuous source time and retains a restorable document', () => {
    const { show, clip } = fixture();
    const result = runCommand('map.clip.edit', encode(show), { clip_id: clip.id, action: 'split', time_s: 6 });
    const next = parseShow(result.content!);
    const parts = next.visuals!.filter(v => v.assetID === clip.assetID);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ startS: 2, durationS: 4, inS: 3 });
    expect(parts[1]).toMatchObject({ startS: 6, durationS: 6, inS: 7 });
    const history = pushHistory(initialHistory(show), next, null, 1);
    expect(undoHistory(history).present).toBe(show);
    expect(redoHistory(undoHistory(history)).present).toBe(next);
  });
  it.each(['duplicate', 'delete', 'trim-start', 'trim-end'] as const)('supports %s through existing timeline edits', action => {
    const { show, clip } = fixture();
    const changed = runCommand('map.clip.edit', encode(show), { clip_id: clip.id, action, time_s: 6 });
    const next = parseShow(changed.content!);
    const clips = next.visuals!.filter(v => v.assetID === clip.assetID);
    expect(clips).toHaveLength(action === 'duplicate' ? 2 : action === 'delete' ? 0 : 1);
    if (action === 'trim-start') expect(clips[0]).toMatchObject({ startS: 6, inS: 7, durationS: 6 });
    if (action === 'trim-end') expect(clips[0].durationS).toBe(4);
  });
  it.each(['clip', 'track'] as const)('refuses edits with a locked %s', kind => {
    const { show, clip, track } = fixture();
    if (kind === 'clip') clip.locked = true; else track.locked = true;
    expect(() => runCommand('map.clip.edit', encode(show), { clip_id: clip.id, action: 'delete' })).toThrow('locked');
  });
  it('rejects incompatible tracks, missing identifiers, invalid times and boundary splits', () => {
    const { show, clip } = fixture(), content = encode(show);
    expect(() => runCommand('map.clip.move', content, { clip_id: clip.id, track_id: show.tracks!.find(t => t.kind === 'audio')!.id, start_s: 0 })).toThrow('refused');
    expect(() => runCommand('map.clip.edit', content, { clip_id: clip.id, action: 'split', time_s: 2 })).toThrow('refused');
    expect(() => runCommand('map.clip.edit', content, { clip_id: 'missing', action: 'delete' })).toThrow('not found');
    expect(() => runCommand('map.show.evaluate', content, { scene_id: 'missing', time_s: 0 })).toThrow('not found');
    for (const time_s of [NaN, Infinity, -1, 604801]) expect(() => runCommand('map.show.evaluate', content, { scene_id: show.activeSceneId, time_s })).toThrow('time_s');
    expect(() => runCommand('map.clip.edit', content, { clip_id: clip.id, action: 'split' })).toThrow('Time');
    expect(() => runCommand('map.show.inspect', '{"version":999}', {})).toThrow('Unsupported');
  });
  it('keeps seeded move/round-trip/undo invariants across 100 edits', () => {
    let seed = 20261009;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const { show, clip, track } = fixture();
    let history = initialHistory(show);
    for (let i = 0; i < 100; i++) {
      const before = history.present, start_s = Math.round(random() * 4000) / 100;
      const changed = runCommand('map.clip.move', encode(before), { clip_id: clip.id, track_id: track.id, start_s });
      const next = parseShow(changed.content!);
      expect(next.visuals!.find(v => v.id === clip.id)).toMatchObject({ assetID: clip.assetID, targets: clip.targets, inS: clip.inS, durationS: clip.durationS, startS: start_s });
      expect(normalizeDocument(next)).toBe(next);
      history = pushHistory(history, next, null, i);
      expect(undoHistory(history).present).toBe(before);
      expect(redoHistory(undoHistory(history)).present).toBe(next);
    }
  });
});
