import { describe, expect, it } from 'vitest';
import { emptyShow, newScene, newSurface } from './document';
import { sceneSize } from './scene-size';
import { sceneCrop } from './output-crop';
import { parseShow, serializeShow } from './show-file';
import { showTime, playbackEnded } from './playback';
import { timelineRange } from './timeline-range';
import { placeClip } from './clips';
describe('scene artboards', () => {
  it('keeps scene sizes separate from devices and does not transform existing layers', () => {
    const show = emptyShow(), layer = newSurface(show.output, 0);
    show.scenes[0].surfaces.push(layer);
    show.scenes[0].artboard = { widthPx: 1000, heightPx: 1000 };
    show.scenes.push(newScene('Portrait', { widthPx: 720, heightPx: 1280 }));
    show.output = { width: 3840, height: 2160 };
    expect(sceneSize(show)).toEqual({ width: 1000, height: 1000 });
    expect(sceneCrop(show.output, sceneSize(show))).toMatchObject({ widthPx: 1000, heightPx: 1000 });
    show.activeSceneId = show.scenes[1].id;
    expect(sceneSize(show)).toEqual({ width: 720, height: 1280 });
    expect(show.scenes[0].surfaces[0]).toBe(layer);
    expect(parseShow(serializeShow(show))).toEqual(show);
  });
  it('opens old shows at their old output dimensions and preserves explicit playback', () => {
    const show = parseShow(JSON.stringify({ version: 2, output: { width: 800, height: 600 }, scenes: [{ id: 'old', name: 'Old', durationS: 45, surfaces: [] }], playback: { mode: 'loop' } }));
    expect(sceneSize(show)).toEqual({ width: 800, height: 600 });
    show.output.width = 1920;
    expect(sceneSize(show).width).toBe(800);
    expect(show.playback.mode).toBe('loop'); expect(showTime(show, 90)).toBe(0);
  });
  it('allows continuous playback and timeline content beyond the initial view range', () => {
    const show = emptyShow(), scene = show.scenes[0], surface = newSurface(show.output, 0);
    show.playback.mode = 'continuous';
    expect(showTime(show, 3600)).toBe(3600); expect(playbackEnded(show, 3600)).toBe(false);
    const media = { id: 'image', kind: 'image' as const, name: 'Image', file: 'image.png', width: 100, height: 100, bytes: 1 };
    surface.clips.push(placeClip('late', media, 121, Infinity)); scene.surfaces.push(surface);
    expect(surface.clips[0].startS).toBe(121); expect(surface.clips[0].durationS).toBe(30);
    expect(timelineRange(scene, 0)).toBe(180); expect(timelineRange(scene, 3600)).toBeGreaterThan(3600);
    show.playback.mode = 'once'; expect(showTime(show, 3600)).toBe(60); expect(playbackEnded(show, 3600)).toBe(true);
  });
});
