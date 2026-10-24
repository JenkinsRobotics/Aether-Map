import { describe, expect, it } from 'vitest';
import { emptyShow } from '../document';
import { newFeature } from '../features/new-feature';
import { normalizeDocument } from '../normalize-document';
import { parseShow, serializeShow } from '../show-file';
import { createInShow } from './authoring';
import { runCommand } from './commands';

const encode = (show: ReturnType<typeof emptyShow>) => new TextDecoder().decode(serializeShow(show));
describe('saved scene and surface creation', () => {
  it('creates a scene, reopens it and preserves existing output/focus/content', () => {
    const show = normalizeDocument(emptyShow());
    const changed = runCommand('map.scene.create', encode(show), { name: ' Side ', width_px: 720, height_px: 1280 });
    const next = parseShow(changed.content!);
    expect(next.scenes).toHaveLength(2);
    expect(next.scenes[1]).toMatchObject({ name: 'Side', artboard: { widthPx: 720, heightPx: 1280 }, surfaces: [] });
    expect(changed.result).toMatchObject({ created: { scene_id: next.scenes[1].id } });
    expect(next.scenes[0]).toEqual(show.scenes[0]);
    expect(next.activeSceneId).toBe(show.activeSceneId);
    expect(next.outputs).toEqual(show.outputs);
    expect(normalizeDocument(next)).toBe(next);
  });
  it('uses the target artboard and editor surface constructor, with no per-surface timeline', () => {
    const show = normalizeDocument(emptyShow());
    const added = createInShow('map.scene.create', show, { name: 'Portrait', width_px: 720, height_px: 1280 });
    const scene = added.show.scenes[1];
    const changed = runCommand('map.surface.create', encode(added.show), { scene_id: scene.id, name: 'Wall' });
    const next = parseShow(changed.content!);
    const surface = next.scenes[1].surfaces[0];
    const expected = newFeature('surface', { width: 720, height: 1280 }, 0);
    expect(surface).toMatchObject({ name: 'Wall', kind: expected.kind, corners: expected.corners, source: expected.source });
    // New surfaces join Main; no per-surface timeline is created.
    expect(next.timelines?.some(t => t.surfaceID === surface.id) ?? false).toBe(false);
    expect(changed.result).toMatchObject({ created: { scene_id: scene.id, surface_id: surface.id } });
    expect(next.outputs).toEqual(show.outputs);
    expect(next.activeSceneId).toBe(show.activeSceneId);
    expect(normalizeDocument(next)).toBe(next);
    expect(added.show.scenes[1].surfaces).toHaveLength(0);
  });
  it.each(['', '  ', 'x'.repeat(201), 'Bad\nname'])('rejects invalid names %j', name => {
    expect(() => createInShow('map.scene.create', emptyShow(), { name, width_px: 100, height_px: 100 })).toThrow('Name');
  });
  it.each([0, -1, 1.5, 16385, NaN, Infinity])('rejects invalid dimensions %s without mutation', width_px => {
    const show = emptyShow(), before = encode(show);
    expect(() => createInShow('map.scene.create', show, { name: 'Side', width_px, height_px: 100 })).toThrow('dimensions');
    expect(encode(show)).toBe(before);
  });
  it('rejects unknown scenes and bounded creation limits', () => {
    const show = emptyShow();
    expect(() => createInShow('map.surface.create', show, { name: 'Wall', scene_id: 'missing' })).toThrow('not found');
    show.scenes[0].surfaces = Array.from({ length: 1024 }, (_, i) => newFeature('surface', show.output, i));
    expect(() => createInShow('map.surface.create', show, { name: 'Wall', scene_id: show.activeSceneId })).toThrow('limit');
    show.scenes = Array(256).fill(show.scenes[0]);
    expect(() => createInShow('map.scene.create', show, { name: 'Side', width_px: 100, height_px: 100 })).toThrow('limit');
  });
});
