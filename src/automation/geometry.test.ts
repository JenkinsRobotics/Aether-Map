import { describe, expect, it } from 'vitest';
import { emptyShow, newSurface, quadCorners } from '../document';
import { normalizeDocument } from '../normalize-document';
import { parseShow, serializeShow } from '../show-file';
import { joinCorners } from '../corner-welds';
import { animateSurface } from '../features/animation';
import { boundsOf } from '../layer-transform';
import { editGeometry } from './geometry';
import { runCommand } from './commands';
function fixture() {
  const show = emptyShow();
  const surface = { ...newSurface(show.output, 0), corners: quadCorners([100, 50, 200, 100]),
    masks: [[[120, 60], [160, 60], [160, 90]]] as [number, number][][],
    maskCurves: [[{ c1: [130, 55] as [number, number], c2: [140, 55] as [number, number] }, null, null]] };
  show.scenes[0].surfaces = [surface];
  return { show: normalizeDocument(show), surface, args: { scene_id: show.activeSceneId, surface_id: surface.id } };
}
const encode = (show: ReturnType<typeof emptyShow>) => new TextDecoder().decode(serializeShow(show));
describe('saved mapping geometry commands', () => {
  it('resizes positions, masks and curve handles and preserves content on reopen', () => {
    const { show, surface, args } = fixture();
    const result = runCommand('map.surface.bounds', encode(show), { ...args, x_px: 10, y_px: 20, width_px: 400, height_px: 200 });
    const next = parseShow(result.content!), moved = next.scenes[0].surfaces[0];
    expect(moved.corners).toEqual(quadCorners([10, 20, 400, 200]));
    expect(moved.masks[0][0]).toEqual([50, 40]);
    expect(moved.maskCurves![0][0]).toEqual({ c1: [70, 30], c2: [90, 30] });
    expect(moved.source).toEqual(surface.source);
    expect(next.outputs).toEqual(show.outputs);
    expect(next.timelines).toEqual(show.timelines);
    expect(result.result).toMatchObject({ changed_surface_ids: [surface.id] });
    expect(normalizeDocument(next)).toBe(next);
  });
  it('rotates around visible center and reverses without editing animation keys', () => {
    const { show, surface, args } = fixture();
    surface.transform = { xPx: 20, yPx: -10, scaleX: 1.2, scaleY: .7, rotationDeg: 0 };
    surface.animation = { rotationDeg: [{ id: 'rotation', timeS: 0, value: 30, interpolation: 'linear' }] };
    // Normalization may retain or copy the original surface; install the animated fixture explicitly.
    show.scenes[0].surfaces[0] = surface;
    const initial = boundsOf(animateSurface(surface, 0).corners);
    const next = editGeometry('map.surface.rotate', show, { ...args, delta_degrees: 90 }).show;
    const moved = next.scenes[0].surfaces[0], after = boundsOf(animateSurface(moved, 0).corners);
    expect(after.width).toBeCloseTo(initial.height);
    expect(after.height).toBeCloseTo(initial.width);
    expect(after.x + after.width / 2).toBeCloseTo(initial.x + initial.width / 2);
    expect(moved.animation).toEqual(surface.animation);
    const restored = editGeometry('map.surface.rotate', next, { ...args, delta_degrees: -90 }).show.scenes[0].surfaces[0];
    restored.corners.forEach((point, i) => point.forEach((n, axis) => expect(n).toBeCloseTo(surface.corners[i][axis], 6)));
  });
  it('propagates welds and refuses the entire transaction with a locked peer', () => {
    const { show, surface, args } = fixture();
    const peer = newSurface(show.output, 1); show.scenes[0].surfaces.push(peer);
    const joined = joinCorners(show, { surfaceID: surface.id, index: 1 }, { surfaceID: peer.id, index: 0 });
    const result = editGeometry('map.surface.rotate', joined, { ...args, delta_degrees: 30 });
    expect(result.changedIDs).toEqual([surface.id, peer.id]);
    expect(result.show.scenes[0].surfaces[0].corners[1]).toEqual(result.show.scenes[0].surfaces[1].corners[0]);
    joined.scenes[0].surfaces[1].locked = true;
    const original = encode(joined);
    expect(() => editGeometry('map.surface.rotate', joined, { ...args, delta_degrees: 30 })).toThrow('locked neighbour');
    expect(encode(joined)).toBe(original);
  });
  it('respects surface and aspect-ratio locks, degenerate geometry and no-ops', () => {
    const { show, args } = fixture(); const surface = show.scenes[0].surfaces[0];
    surface.locked = true;
    expect(() => editGeometry('map.surface.rotate', show, { ...args, delta_degrees: 5 })).toThrow('locked');
    surface.locked = false; surface.lockAspectRatio = true;
    expect(() => editGeometry('map.surface.bounds', show, { ...args, x_px: 0, y_px: 0, width_px: 100, height_px: 100 })).toThrow('aspect ratio');
    for (const delta_degrees of [0, 360, -360])
      expect(() => editGeometry('map.surface.rotate', show, { ...args, delta_degrees })).toThrow('unchanged');
    surface.corners = quadCorners([0, 0, 0, 100]);
    expect(() => editGeometry('map.surface.rotate', show, { ...args, delta_degrees: 5 })).toThrow('degenerate');
  });
  it.each([NaN, Infinity, -361, 361])('rejects invalid rotation %s without mutation', delta_degrees => {
    const { show, args } = fixture(), before = encode(show);
    expect(() => editGeometry('map.surface.rotate', show, { ...args, delta_degrees })).toThrow('finite');
    expect(encode(show)).toBe(before);
  });
  it('leaves unrelated out-of-range legacy geometry untouched', () => {
    const { show, args } = fixture();
    const peer = { ...newSurface(show.output, 1), corners: quadCorners([2000000, 0, 100, 100]) };
    show.scenes[0].surfaces.push(peer);
    const result = editGeometry('map.surface.rotate', show, { ...args, delta_degrees: 90 });
    expect(result.show.scenes[0].surfaces[1]).toBe(peer);
    expect(result.changedIDs).toEqual([args.surface_id]);
  });
  it('rejects mismatched scene identity and coordinate overflow', () => {
    const { show, args } = fixture();
    expect(() => editGeometry('map.surface.rotate', show, { ...args, scene_id: 'missing', delta_degrees: 5 })).toThrow('not found');
    expect(() => editGeometry('map.surface.bounds', show, { ...args, x_px: 1000000, y_px: 0, width_px: 100, height_px: 100 })).toThrow('finite');
  });
});
