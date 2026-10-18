import { describe, expect, it } from 'vitest';
import { emptyShow, newSurface } from './document';
import { normalizeVisuals } from './visual-document';
import { addPoolAsset, addVisualTrack, normalizeMediaPool, placePoolAsset } from './media-pool';
import { canPasteTimelineClip, pasteTimelineClip, editTimelineClip, moveTimelineClip, reorderTimelineTrack } from './timeline-edit';
import { timelineAudio } from './timeline-audio';
import { sceneVisuals } from './visual-render';
import { parseShow, serializeShow } from './show-file';

function fixture() {
  let show = normalizeMediaPool(normalizeVisuals(emptyShow()));
  show = addPoolAsset(show, { mediaId: null, rect: [0,0,100,100], fill: '#f00' }, 'Color');
  show = placePoolAsset(show, show.pool![0].id, show.tracks![0].id, 2);
  return show;
}
describe('Main timeline editing', () => {
  it('defaults to V1/A1 independent of face count and preserves existing uses on upgrade', () => {
    let show = fixture();
    expect(show.tracks?.map(t => [t.name, t.kind])).toEqual([['V1','video'], ['A1','audio']]);
    show.scenes[0].surfaces = [newSurface(show.output, 0), newSurface(show.output, 1)];
    show = normalizeMediaPool(show);
    expect(show.tracks).toHaveLength(2);
    expect(normalizeMediaPool(show)).toBe(show);
    expect(parseShow(serializeShow({ ...show, timelineMode: 'advanced' }))).toMatchObject({ version: 6, timelineMode: 'advanced', visuals: show.visuals });
  });
  it('moves across tracks without reassigning targets, blocks locks and incompatible drops', () => {
    let show = fixture();
    const clip = show.visuals![0];
    show = addVisualTrack(show, [{ sceneID: show.activeSceneId }]);
    const target = show.tracks!.at(-1)!;
    const moved = moveTimelineClip(show, clip.id, target.id, 8);
    expect(moved.visuals![0]).toMatchObject({ startS: 8, targets: clip.targets, assetID: clip.assetID, trackID: target.id });
    expect(moveTimelineClip(show, clip.id, show.tracks![1].id, 3)).toBe(show);
    target.locked = true;
    expect(moveTimelineClip(show, clip.id, target.id, 3)).toBe(show);
    expect(reorderTimelineTrack(show, target.id, -1)).toBe(show);
  });
  it('splits without changing source time and duplicates independent clip settings', () => {
    let show = fixture(); const first = show.visuals![0]; first.inS = 4;
    show = editTimelineClip(show, first.id, 'split', 9);
    expect(show.visuals).toHaveLength(2);
    expect(show.visuals![0].durationS).toBe(7);
    expect(show.visuals![1]).toMatchObject({ startS: 9, inS: 11, assetID: first.assetID, targets: first.targets });
    show = editTimelineClip(show, first.id, 'duplicate');
    expect(show.visuals).toHaveLength(3);
    expect(new Set(show.visuals!.map(v => v.id)).size).toBe(3);
    show = editTimelineClip(show, first.id, 'lock');
    expect(editTimelineClip(show, first.id, 'delete')).toBe(show);
    show = editTimelineClip(show, first.id, 'lock');
    expect(editTimelineClip(show, first.id, 'delete').visuals).toHaveLength(2);
  });
  it('orders visual tracks independently of audio tracks', () => {
    let show = fixture(); show = addVisualTrack(show, [{ sceneID: show.activeSceneId }]);
    const last = show.tracks!.at(-1)!;
    const moved = reorderTimelineTrack(show, last.id, -1);
    expect(moved.tracks![0].id).toBe(last.id);
    expect(moved.tracks![1].kind).toBe('audio');
  });
});
it('audio has one voice per clip, no projected geometry, correct trim/loop clock, mute, solo and persistence', () => {
  let show = fixture();
  show.media = [{ id: 'sound', file: 'sound.wav', name: 'Sound', kind: 'audio', duration: 4, width: 1, height: 1, bytes: 64 }];
  show = normalizeMediaPool(show);
  const asset = show.pool!.find(a => a.source.mediaId === 'sound')!, audio = show.tracks!.find(t => t.kind === 'audio')!;
  show = placePoolAsset(show, asset.id, audio.id, 2);
  const clip = show.visuals!.at(-1)!; expect(clip.durationS).toBe(4);
  clip.targets = [{ sceneID: show.activeSceneId }, { sceneID: show.activeSceneId, surfaceID: 'a' }];
  clip.inS = 1; clip.loop = true;
  expect(timelineAudio(show, 1)).toEqual([]);
  expect(timelineAudio(show, 5)).toMatchObject([{ id: clip.id, timeS: 0, volume: 1 }]);
  expect(sceneVisuals(show, show.scenes[0], 3)).toHaveLength(1);
  audio.enabled = false; expect(timelineAudio(show, 3)).toEqual([]);
  audio.enabled = true; audio.volume = .4;
  show = addVisualTrack(show, [{ sceneID: show.activeSceneId }], undefined, 'audio');
  const other = show.tracks!.at(-1)!; other.solo = true;
  expect(timelineAudio(show, 3)).toEqual([]);
  other.solo = false;
  expect(timelineAudio(parseShow(serializeShow(show)), 3)).toMatchObject([{ timeS: 2, volume: .4 }]);
});

it('pastes independent clip uses with targets intact and rejects locked/incompatible tracks', () => {
  const show = fixture(), copy = structuredClone(show.visuals![0]), video = show.tracks![0], audio = show.tracks![1];
  const next = pasteTimelineClip(show, copy, video.id, 10);
  expect(next.visuals).toHaveLength(2);
  const pasted = next.visuals![1];
  expect(pasted.id).not.toBe(copy.id);
  expect(pasted).toMatchObject({ assetID:copy.assetID, targets:copy.targets, startS:10, trackID:video.id });
  expect(canPasteTimelineClip(show, copy, audio.id)).toBe(false);
  expect(pasteTimelineClip(show, copy, audio.id, 10)).toBe(show);
  video.locked = true; expect(pasteTimelineClip(show, copy, video.id, 10)).toBe(show);
  video.locked = false; show.pool = []; expect(canPasteTimelineClip(show, copy, video.id)).toBe(false);
});

it('trims at the playhead without losing source identity or offsets and respects locks', () => {
  let show = fixture();
  const clip = show.visuals![0]; clip.startS = 2; clip.durationS = 12; clip.inS = 3; clip.continuous = false;
  show = editTimelineClip(show, clip.id, 'trim-start', 5);
  expect(show.visuals![0]).toMatchObject({ startS:5, durationS:9, inS:6, assetID:clip.assetID, targets:clip.targets });
  show = editTimelineClip(show, clip.id, 'trim-end', 10);
  expect(show.visuals![0]).toMatchObject({ startS:5, durationS:5, inS:6 });
  expect(editTimelineClip(show, clip.id, 'trim-start', 40)).toBe(show);
  show.visuals![0].locked = true;
  expect(editTimelineClip(show, clip.id, 'trim-end', 8)).toBe(show);
});

it('master fader, DIM and mute multiply all soundtrack voices once and survive saving', () => {
  let show = fixture();
  show.media = [{ id:'sound', file:'sound.wav', name:'Sound', kind:'audio', duration:20, width:1, height:1, bytes:64 }];
  show = normalizeMediaPool(show);
  const source = show.pool!.find(a => a.source.mediaId === 'sound')!, track = show.tracks!.find(t => t.kind === 'audio')!;
  track.volume = .5;
  show = placePoolAsset(show, source.id, track.id, 0);
  show.audioOutput = { volume:.4, muted:false, dimmed:false };
  expect(timelineAudio(show, 1)[0].volume).toBeCloseTo(.2);
  show.audioOutput.dimmed = true;
  expect(timelineAudio(parseShow(serializeShow(show)), 1)[0].volume).toBeCloseTo(.02);
  show.audioOutput.muted = true;
  expect(timelineAudio(parseShow(serializeShow(show)), 1)[0].volume).toBe(0);
  delete show.audioOutput;
  expect(timelineAudio(show, 1)[0].volume).toBe(.5);
});
