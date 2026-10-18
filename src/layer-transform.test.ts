import { describe, expect, it } from 'vitest';
import { emptyShow, newSurface, quadCorners, type Surface } from './document';
import { backdropSurface, editableLayers } from './background-layer';
import { boundsOf, resizeBounds, setLayerBounds, snapBounds, snapVertex, flipLayer, rotateLayer, RESIZE_HANDLES } from './layer-transform';
import { cubeSurfaces } from './features/shape-groups';
import { roundMaskPoint } from './masks';
import { animateSurface } from './features/animation';
import { parseShow, serializeShow } from './show-file';
const surface = (): Surface => ({ ...newSurface({ width: 1920, height: 1080 }, 0), corners: quadCorners([100, 50, 200, 100]), masks: [[[120, 60], [160, 60], [160, 90]]] });
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
describe('common layer geometry', () => {
  it('reflects transformed geometry and masks around a common axis and is reversible', () => {
    const s = surface();
    s.transform = { xPx: 17, yPx: -9, scaleX: 1.7, scaleY: .8, rotationDeg: 32 };
    const before = animateSurface(s, 0), bounds = boundsOf(before.corners);
    for (const axis of [0, 1] as const) {
      const changed = { ...s, ...flipLayer(s, axis, 0) }, after = animateSurface(changed, 0);
      const center = axis === 0 ? bounds.x + bounds.width / 2 : bounds.y + bounds.height / 2;
      [...after.corners, ...after.masks.flat()].forEach((p, i) => {
        const original = [...before.corners, ...before.masks.flat()][i];
        expect(p[axis]).toBeCloseTo(2 * center - original[axis]);
        expect(p[1 - axis]).toBeCloseTo(original[1 - axis]);
      });
      const restored = { ...changed, ...flipLayer(changed, axis, 0) };
      restored.corners.forEach((p, i) => close(p, s.corners[i]));
      expect(changed.source).toBe(s.source);
    }
  });
  it('reflects compound faces about one pivot and persists rounded outlines unchanged', () => {
    const show = emptyShow(), cube = cubeSurfaces(show.output, 0);
    const bounds = boundsOf(cube.flatMap(s => s.corners));
    const pivot: [number, number] = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
    show.scenes[0].surfaces = cube.map(s => ({ ...s, ...flipLayer(s, 0, 0, pivot) }));
    show.scenes[0].surfaces[0].masks = [roundMaskPoint(cube[0].corners, 0, 15)];
    const saved = parseShow(serializeShow(show));
    expect(saved.scenes[0].surfaces).toEqual(show.scenes[0].surfaces);
    show.scenes[0].surfaces.forEach((s, i) => s.corners.forEach((p, j) => close(p, [2 * pivot[0] - cube[i].corners[j][0], cube[i].corners[j][1]])));
  });
  it('snaps to a real nearest vertex only within the radial tolerance', () => {
    expect(snapVertex([9, 10], [[10, 10], [9, 14]], 2)).toEqual([10, 10]);
    expect(snapVertex([9, 10], [[10, 12]], 2)).toBeNull();
    expect(snapVertex([9, 10], [[10, 12]], 3)).toEqual([10, 12]);
  });
  it('resizes all eight handles without moving the opposite anchor or collapsing', () => {
    const b = { x: 100, y: 50, width: 200, height: 100 };
    expect(resizeBounds(b, 'nw', [-20, -10], false)).toEqual({ x: 80, y: 40, width: 220, height: 110 });
    expect(resizeBounds(b, 'e', [50, 0], true)).toEqual({ x: 100, y: 37.5, width: 250, height: 125 });
    for (const handle of RESIZE_HANDLES) {
      const result = resizeBounds(b, handle, [900, 900], true);
      expect(result.width / result.height).toBeCloseTo(2); expect(result.width).toBeGreaterThanOrEqual(1); expect(result.height).toBeGreaterThanOrEqual(1);
    }
  });
  it('scales masks with the quad and preserves animation and generated content', () => {
    const s = surface(); s.transform = { xPx: 15, yPx: -20, scaleX: 1.2, scaleY: .7, rotationDeg: 30 };
    s.animation = { rotationDeg: [{ id: 'k', timeS: 0, value: 42, interpolation: 'hold' }] };
    const before = animateSurface(s, 5), b = boundsOf(before.corners);
    const target = { x: 40, y: -10, width: b.width * 2, height: b.height * 1.5 };
    const changed = { ...s, ...setLayerBounds(s, target, 5) }, after = animateSurface(changed, 5);
    close(Object.values(boundsOf(after.corners)), Object.values(target));
    close(after.masks[0][0], [40 + (before.masks[0][0][0] - b.x) * 2, -10 + (before.masks[0][0][1] - b.y) * 1.5]);
    expect(changed.animation).toBe(s.animation); expect(changed.source).toBe(s.source);
    const restored = { ...changed, ...rotateLayer(changed, 90, 5) };
    expect(boundsOf(animateSurface(restored, 5).corners).width).toBeCloseTo(target.height);
  });
  it('snaps moving edges and centers, resizing only the grabbed edges', () => {
    const targets = [{ x: 0, y: 0, width: 1000, height: 600 }];
    const b = { x: 402, y: 3, width: 200, height: 100 };
    expect(snapBounds(b, targets, 6)).toEqual({ delta: [-2, -3], guides: [{ axis: 0, position: 500 }, { axis: 1, position: 0 }] });
    expect(snapBounds(b, targets, 1).guides).toEqual([]);
    expect(snapBounds({ ...b, width: 594 }, targets, 6, 'e')).toEqual({ delta: [4, 0], guides: [{ axis: 0, position: 1000 }] });
  });
  it('fits legacy backdrops, keeps them outside output surfaces, and persists placement and locks', () => {
    const show = emptyShow(); show.media = [{ id: 'photo', file: 'photo.png', name: 'Wall', kind: 'image', bytes: 1, width: 100, height: 100 }];
    show.scenes[0].setupBackground = { mediaId: 'photo', visible: true, opacity: .6 };
    const back = backdropSurface(show)!;
    expect(boundsOf(back.corners)).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
    expect(back.lockAspectRatio).toBe(true); expect(editableLayers(show)).toHaveLength(1); expect(show.scenes[0].surfaces).toHaveLength(0);
    show.scenes[0].setupBackground = { ...show.scenes[0].setupBackground, corners: quadCorners([-30, 70, 300, 300]), locked: true, lockAspectRatio: false };
    show.scenes[0].surfaces.push({ ...surface(), lockAspectRatio: true });
    const parsed = parseShow(serializeShow(show));
    expect(parsed.scenes[0].setupBackground).toEqual(show.scenes[0].setupBackground);
    expect(parsed.scenes[0].surfaces[0].lockAspectRatio).toBe(true);
  });
});
