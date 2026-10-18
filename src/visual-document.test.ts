import { describe, expect, it } from 'vitest';
import { emptyShow, newSurface } from './document';
import { normalizeVisuals, duplicateVisual } from './visual-document';
import { sceneVisuals } from './visual-render';
import { parseShow, serializeShow } from './show-file';
import { contentClip } from './surface-assets';
import { mediaUsage } from './media-usage';

function fixture() {
  const show = emptyShow();
  const a = newSurface(show.output, 0), b = newSurface(show.output, 1);
  a.corners = [[0, 0], [100, 0], [100, 100], [0, 100]];
  b.corners = [[100, 0], [200, 0], [200, 100], [100, 100]];
  a.source = { mediaId: null, rect: [0, 0, 100, 100], fill: '#ff0000' };
  a.clips = [{ ...contentClip(a.source, [], 2, 'visual-1'), durationS: 5, inS: 1 }];
  a.sequence = true;
  show.scenes[0].surfaces = [a, b];
  return { show, a, b };
}
describe('shared visuals', () => {
  it('migrates once, preserves identity/timing, removes source ownership from geometry', () => {
    const { show, a } = fixture(); const next = normalizeVisuals(show);
    expect(next.version).toBe(4);
    expect(next.visuals).toHaveLength(1);
    expect(next.visuals![0]).toMatchObject({ id: 'visual-1', startS: 2, durationS: 5, inS: 1, targets: [{ sceneID: show.activeSceneId, surfaceID: a.id }] });
    expect(next.scenes[0].surfaces[0].clips).toEqual([]);
    expect(next.scenes[0].surfaces[0].source.fill).toBeUndefined();
    expect(normalizeVisuals(next)).toBe(next);
    expect(sceneVisuals(next, next.scenes[0], 1)).toEqual([]);
    expect(sceneVisuals(next, next.scenes[0], 3)[0].mediaTimeS).toBe(2);
    expect(sceneVisuals(next, next.scenes[0], 7)).toEqual([]);
    expect(show.scenes[0].surfaces[0].clips).toHaveLength(1);
  });
  it('repeats one source onto each face, then spans the shared window with separate masks', () => {
    const { show, a, b } = fixture(); const next = normalizeVisuals(show), v = next.visuals![0];
    v.targets.push({ sceneID: show.activeSceneId, surfaceID: b.id });
    const repeated = sceneVisuals(next, next.scenes[0], 3);
    expect(repeated.map(s => s.corners)).toEqual([a.corners, b.corners]);
    expect(repeated.map(s => s.mediaTimeS)).toEqual([2, 2]);
    v.mapping = 'span';
    const spanning = sceneVisuals(next, next.scenes[0], 3);
    expect(spanning[0].corners).toEqual([[0, 0], [200, 0], [200, 100], [0, 100]]);
    expect(spanning).toHaveLength(1);
    expect(spanning[0].masks).toEqual([a.corners, b.corners]);
  });
  it('treats entire scene as an ordinary ordered target, shares across scenes, roundtrips', () => {
    const { show } = fixture(); const next = normalizeVisuals(show), v = next.visuals![0];
    next.scenes.push({ ...next.scenes[0], id: 'second', surfaces: [], artboard: { widthPx: 300, heightPx: 200 } });
    v.targets = [{ sceneID: show.activeSceneId }, { sceneID: 'second' }];
    v.mapping = 'span'; v.effects = [{ id: 'fx', kind: 'blur', enabled: true, amount: 12 }];
    expect(sceneVisuals(next, next.scenes[1], 3)[0].corners).toEqual([[0, 0], [300, 0], [300, 200], [0, 200]]);
    const loaded = parseShow(serializeShow(next));
    expect(loaded.visuals).toEqual(next.visuals);
    expect(loaded.version).toBe(4);
  });
  it('duplicates independently at the same time and keeps referenced media in use', () => {
    const { show } = fixture(); const next = normalizeVisuals(show); next.visuals![0].source!.mediaId = 'movie';
    const copy = duplicateVisual(next, 'visual-1');
    expect(copy.visuals).toHaveLength(2);
    expect(copy.visuals![1].startS).toBe(2);
    expect(copy.visuals![1].legacyTrack).toBeUndefined();
    copy.visuals![1].source!.fill = '#0000ff';
    expect(next.visuals![0].source!.fill).toBe('#ff0000');
    expect(mediaUsage(copy, 'movie')).toBe(2);
  });
  it('preserves legacy continuous content and first-wins overlapping clips', () => {
    const { show, a, b } = fixture(); b.source.fill = '#00ff00';
    a.clips.push({ ...a.clips[0], id: 'overlap' });
    const next = normalizeVisuals(show);
    expect(next.visuals).toHaveLength(3);
    expect(next.visuals![2].continuous).toBe(true);
    expect(sceneVisuals(next, next.scenes[0], 3)).toHaveLength(2);
    expect(sceneVisuals(next, next.scenes[0], 90)).toHaveLength(1);
  });
});
