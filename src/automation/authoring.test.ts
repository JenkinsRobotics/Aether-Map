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

describe('agent-built playback features', () => {
  it('assigns a scene hotkey that survives a reopen, moves it between scenes and clears it', () => {
    const show = normalizeDocument(emptyShow());
    let text = runCommand('map.scene.create', encode(show), { name: 'Movie', width_px: 1920, height_px: 1080 }).content!;
    const [main, movie] = parseShow(text).scenes.map(s => s.id);
    text = runCommand('map.scene.hotkey', text, { scene_id: main, hotkey: 'F2' }).content!;
    text = runCommand('map.scene.hotkey', text, { scene_id: movie, hotkey: 'F2' }).content!;
    expect((runCommand('map.show.inspect', text, {}).result.scenes as {hotkey:string|null}[]).map(s => s.hotkey)).toEqual([null, 'F2']);
    text = runCommand('map.scene.hotkey', text, { scene_id: movie, hotkey: 'none' }).content!;
    expect(parseShow(text).scenes.map(s => s.hotkey)).toEqual([undefined, undefined]);
    expect(() => runCommand('map.scene.hotkey', text, { scene_id: movie, hotkey: 'Q' })).toThrow();
  });
  it('creates Cast and Web window visuals that survive a reopen', () => {
    const show = normalizeDocument(emptyShow());
    const scene_id = show.scenes[0].id;
    let text = encode(show);
    text = runCommand('map.visual.create', text, { scene_id, name: 'Phone', source_json: '{"kind":"cast"}' }).content!;
    text = runCommand('map.visual.create', text, { scene_id, name: 'Movie', source_json: '{"kind":"web","url":"https://www.disneyplus.com"}' }).content!;
    const reopened = parseShow(text);
    const sources = reopened.visuals!.slice(-2).map(v => reopened.pool!.find(a => a.id === v.assetID)!.source);
    expect(sources[0].cast).toBe(true);
    expect(sources[1].web).toEqual({ url: 'https://www.disneyplus.com' });
    expect(() => runCommand('map.visual.create', text, { scene_id, name: 'Bad', source_json: '{"kind":"web","url":"http://x.test"}' })).toThrow('https');
  });
  it('creates a static gradient visual that needs no GPU', () => {
    const show = normalizeDocument(emptyShow());
    const scene_id = show.scenes[0].id;
    const text = runCommand('map.visual.create', encode(show), { scene_id, name: 'Dusk', source_json: '{"kind":"gradient","colors":["#ff5500","#6e33cc"],"angle_degrees":90}' }).content!;
    const reopened = parseShow(text);
    const source = reopened.pool!.find(a => a.id === reopened.visuals!.at(-1)!.assetID)!.source;
    expect(source.fillGradient).toEqual({ kind: 'linear', angleDeg: 90, stops: [{ offset: 0, color: '#ff5500', opacity: 1 }, { offset: 1, color: '#6e33cc', opacity: 1 }] });
    expect(source.shader).toBeUndefined();
    expect(() => runCommand('map.visual.create', text, { scene_id, name: 'Bad', source_json: '{"kind":"gradient","colors":["#ff5500"]}' })).toThrow('2');
  });
  it('routes a scene to a player and makes the show loop, ready to deploy', async () => {
    const { deploymentReadiness } = await import('../deployment-readiness');
    const show = normalizeDocument(emptyShow());
    const scene_id = show.scenes[0].id;
    let text = runCommand('map.output.player', encode(show), { scene_id, device_id: 'pi', name: 'Porch' }).content!;
    text = runCommand('map.show.playback', text, { mode: 'loop' }).content!;
    let next = parseShow(text);
    expect(next.outputs.filter(o => o.deviceId === 'pi')).toMatchObject([{ kind: 'edge', name: 'Porch', sceneId: scene_id }]);
    expect(next.playback.mode).toBe('loop');
    expect(deploymentReadiness(next, 'pi').blockers).toEqual([]);
    text = runCommand('map.scene.create', text, { name: 'B', width_px: 10, height_px: 10 }).content!;
    const b = parseShow(text).scenes[1].id;
    next = parseShow(runCommand('map.output.player', text, { scene_id: b, device_id: 'pi', name: 'Porch' }).content!);
    expect(next.outputs.filter(o => o.deviceId === 'pi')).toMatchObject([{ sceneId: b }]);
    expect(() => runCommand('map.show.playback', text, { mode: 'forever' })).toThrow();
  });
});
