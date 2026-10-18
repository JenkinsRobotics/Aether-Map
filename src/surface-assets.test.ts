import { describe, expect, it } from 'vitest';
import { emptyShow, newSurface, type MediaRef } from './document';
import { newFeature } from './features/new-feature';
import { sourceHasContent, sourceKind, appendContent, contentClip, patchAssetSource, sequenceSurface } from './surface-assets';
import { evaluateSurface, evaluateShow } from './playback';
import { parseShow, serializeShow } from './show-file';
import { mediaUsage, removeUnusedMedia } from './media-usage';
import { createSurfaceAssetCommands } from './surface-asset-commands';

const image: MediaRef = { id: 'image', name: 'Wall.png', file: 'wall.png', kind: 'image', width: 640, height: 360, bytes: 1 };
const video: MediaRef = { ...image, id: 'video', name: 'Clip.webm', file: 'clip.webm', kind: 'video', duration: 2.345 };
const source = (mediaId: string) => ({ mediaId, rect: [0, 0, 640, 360] as [number, number, number, number] });

describe('surface tracks and timed content', () => {
  it('uses 30 seconds for still/generated content and the actual video duration', () => {
    expect(contentClip(source('image'), [image]).durationS).toBe(30);
    expect(contentClip(newFeature('text', emptyShow().output, 0).source, []).durationS).toBe(30);
    expect(contentClip(source('video'), [video]).durationS).toBe(2.345);
  });
  it('appends assets to one surface and switches generated content at each clip boundary', () => {
    const s = newSurface(emptyShow().output, 0);
    const text = newFeature('text', emptyShow().output, 0).source;
    const shader = newFeature('shader', emptyShow().output, 0).source;
    const first = appendContent(s, text, [], 0), second = appendContent(first.surface, shader, [], 0);
    expect(second.surface.corners).toEqual(s.corners);
    expect(second.clip.startS).toBe(30);
    expect(evaluateSurface(second.surface, 29).source.text).toEqual(text.text);
    expect(evaluateSurface(second.surface, 30).source.shader).toEqual(shader.shader);
    expect(evaluateSurface(second.surface, 35).mediaTimeS).toBe(5);
    expect(evaluateSurface(second.surface, 60).enabled).toBe(false);
  });
  it('edits an asset source without changing other assets or the parent warp', () => {
    const s = newSurface(emptyShow().output, 0);
    const a = appendContent(s, source('image'), [image], 0), b = appendContent(a.surface, source('video'), [video], 0);
    const edited = patchAssetSource(b.surface, { mediaId: null, rect: s.source.rect, fill: '#123456' }, a.clip.id, [], 0);
    expect(edited.corners).toEqual(s.corners); expect(edited.clips[1]).toEqual(b.clip);
    expect(evaluateSurface(edited, 0).source.fill).toBe('#123456');
  });
  it('preserves continuous old inputs and legacy video clips, and keeps emptied tracks empty', () => {
    const old = newFeature('text', emptyShow().output, 0);
    expect(evaluateSurface(old, 3600).source.text).toEqual(old.source.text);
    expect(evaluateSurface(old, 3600).enabled).toBe(true);
    const show = emptyShow(); show.scenes[0].surfaces = [{ ...old, sequence: true, clips: [] }];
    expect(evaluateShow(show, 0).scenes[0].surfaces[0].enabled).toBe(false);
    old.clips = [{ id: 'legacy', mediaId: video.id, startS: 0, durationS: 6, inS: 0, loop: false }];
    expect(evaluateSurface(old, 5, [video]).mediaTimeS).toBe(video.duration);
  });
  it('persists asset timing, names, generated properties and disabled states', () => {
    const show = emptyShow();
    const asset = appendContent(newSurface(show.output, 0), newFeature('shader', show.output, 0).source, [], 4);
    asset.clip.name = 'Opening effect'; asset.clip.durationS = 17; asset.clip.enabled = false; asset.clip.locked = true;
    show.scenes[0].surfaces = [asset.surface];
    expect(parseShow(serializeShow(show))).toEqual(show);
    expect(evaluateSurface(asset.surface, 5).enabled).toBe(false);
  });
  it('protects image/video files referenced only by child assets', () => {
    const show = emptyShow(); show.media = [image];
    show.scenes[0].surfaces = [appendContent(newSurface(show.output, 0), source(image.id), [image], 0).surface];
    expect(mediaUsage(show, image.id)).toBe(1);
    expect(removeUnusedMedia(show, image.id)).toBe(show);
  });
  it('protects media on a surface parked outside every scene', () => {
    const show = emptyShow(); show.media = [image];
    show.unassignedSurfaces = [{ ...newSurface(show.output, 0), source: source(image.id) }];
    expect(mediaUsage(show, image.id)).toBe(1);
    expect(removeUnusedMedia(show, image.id)).toBe(show);
  });
  it('preserves an old cropped media source when extending its track', () => {
    const old = newSurface(emptyShow().output, 0);
    old.source = { ...source(image.id), rect: [100, 50, 200, 150] };
    old.clips = [{ id: 'old-clip', mediaId: image.id, startS: 0, durationS: 10, inS: 0, loop: false }];
    const extended = appendContent(old, source(video.id), [image, video], 0).surface;
    expect(evaluateSurface(extended, 5, [image, video]).source.rect).toEqual([100, 50, 200, 150]);
    const continuous = { ...old, clips: [] };
    const timed = sequenceSurface(continuous, [image]);
    expect(timed.clips[0].source).toEqual(continuous.source);
    expect(timed.clips[0].durationS).toBe(30);
    expect(sequenceSurface(timed, [image])).toEqual(timed);
  });
  it('moves content between tracks without losing old continuous content or either warp', () => {
    let show = emptyShow(); show.media = [image];
    const a = appendContent(newSurface(show.output, 0), source(image.id), [image], 0);
    const b = newFeature('text', show.output, 1);
    show.scenes[0].surfaces = [a.surface, b];
    const commands = () => createSurfaceAssetCommands({ show, edit: update => { show = update(show); }, select: () => {} });
    commands().drop(a.surface.id, a.clip.id, b.id, null, true);
    const [from, to] = show.scenes[0].surfaces;
    expect(from.corners).toEqual(a.surface.corners); expect(to.corners).toEqual(b.corners);
    expect(evaluateSurface(from, 0, [image]).enabled).toBe(false);
    expect(evaluateSurface(to, 0, [image]).source.text).toEqual(b.source.text);
    expect(evaluateSurface(to, 30, [image]).source.mediaId).toBe(image.id);
    commands().remove(b.id, to.clips[0].id);
    expect(show.scenes[0].surfaces[1].clips.map(c => c.id)).toEqual([a.clip.id]);
  });
  it('locks timing/source edits while permitting unlock and visibility changes', () => {
    let show = emptyShow();
    const a = appendContent(newSurface(show.output, 0), source(image.id), [image], 0);
    a.clip.locked = true; show.scenes[0].surfaces = [a.surface];
    const commands = () => createSurfaceAssetCommands({ show, edit: update => { show = update(show); }, select: () => {} });
    commands().change(a.surface.id, { ...a.clip, durationS: 5 });
    expect(show.scenes[0].surfaces[0].clips[0].durationS).toBe(30);
    expect(patchAssetSource(a.surface, source(video.id), a.clip.id, [image, video], 0)).toBe(a.surface);
    commands().change(a.surface.id, { ...a.clip, locked: false });
    commands().change(a.surface.id, { ...a.clip, locked: false, durationS: 5 });
    expect(show.scenes[0].surfaces[0].clips[0].durationS).toBe(5);
  });
  it('duplicates content after the track without retiming locked neighbours', () => {
    let show = emptyShow();
    const a = appendContent(newSurface(show.output, 0), source(image.id), [image], 0);
    const b = appendContent(a.surface, source(video.id), [video], 0);
    b.clip.locked = true; show.scenes[0].surfaces = [b.surface];
    createSurfaceAssetCommands({ show, edit: update => { show = update(show); }, select: () => {} }).duplicate(b.surface, a.clip);
    const clips = show.scenes[0].surfaces[0].clips;
    expect(clips.slice(0, 2)).toEqual(b.surface.clips);
    expect(clips[2].startS).toBeCloseTo(32.345);
    expect(clips[2].source).toEqual(a.clip.source); expect(clips[2].id).not.toBe(a.clip.id);
  });
});


it('a drawing is selectable content and survives conversion into a timed child', () => {
  const surface = newSurface(emptyShow().output, 0);
  surface.source = { mediaId: null, rect: [0, 0, 100, 100], drawing: { strokes: [] } };
  expect(sourceHasContent(surface.source)).toBe(true);
  expect(sourceKind(surface.source)).toBe('Drawing');
  expect(sequenceSurface(surface, []).clips[0].source?.drawing).toEqual({ strokes: [] });
});
