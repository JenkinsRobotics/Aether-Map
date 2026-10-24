import { expect, test } from 'vitest';
import { emptyShow, newSurface, newScene, quadCorners } from '../document';
import { mappingSvg, sceneSvg, outlinePaths, sourceBoundary } from './geometry';
import { projectionManifest, projectionPrompt } from './package';
import { projectionZip } from './archive';

test('SVG retains closing cubics and compound holes without exposing markup from names', () => {
  const show = emptyShow(), scene = show.scenes[0], s = newSurface(show.output, 0);
  s.name = '<script x="bad">&'; s.id = '"bad';
  s.corners = quadCorners([0, 0, 100, 100]);
  s.masks = [s.corners, quadCorners([20, 20, 20, 20])]; s.maskFillRule = 'evenodd';
  s.maskCurves = [[null, null, null, { c1: [0, 80], c2: [0, 20] }], []];
  scene.surfaces = [s];
  const svg = sceneSvg(show, scene);
  expect(svg).toContain('C0,80 0,20 0,0Z'); expect(svg).toContain('fill-rule="evenodd"');
  expect(svg).toContain('&lt;script x=&quot;bad&quot;&gt;&amp;'); expect(svg).not.toContain('<script');
  expect(svg).toContain('data-surface-id="&quot;bad"');
  expect(outlinePaths(s)).toHaveLength(2);
  delete s.maskFillRule;
  expect(sceneSvg(show, scene, true).match(/fill="#ffffff"/g)).toHaveLength(2); // old independent rings union
});
test('overview separates scene artboards and uses the same time-zero transform as Mapping', () => {
  const show = emptyShow(), a = show.scenes[0], b = newScene('Second');
  a.artboard = { widthPx: 100, heightPx: 100 }; b.artboard = { widthPx: 50, heightPx: 200 }; show.scenes.push(b);
  const s = newSurface(show.output, 0); s.corners = quadCorners([0, 0, 10, 10]); s.transform = { xPx: 20, yPx: 30, scaleX: 1, scaleY: 1, rotationDeg: 0 }; a.surfaces = [s];
  const svg = mappingSvg(show);
  expect(svg).toContain('viewBox="0 0 100 348"'); expect(svg).toContain('translate(0 148)');
  expect(svg).toContain('M20,30L30,30L30,40L20,40');
});
test('projected source boundaries retain ellipse and rounded-corner silhouettes', () => {
  const s = newSurface({ width: 100, height: 100 }, 0);
  s.corners = quadCorners([0, 0, 100, 100]); s.source.rect = [0, 0, 100, 100];
  s.shape = 'ellipse'; expect(sourceBoundary(s)).toMatch(/^M100,50L/); expect(outlinePaths(s)[0]).toBe(sourceBoundary(s));
  s.shape = 'rectangle'; s.radiusPx = 10; expect(sourceBoundary(s)).toMatch(/^M90,0L/);
});
test('manifest captures target identity, editable timing, masks and only linked outputs', () => {
  const show = emptyShow(), scene = show.scenes[0]; const s = newSurface(show.output, 0); scene.surfaces = [s];
  show.outputs.push({ id: 'other', name: 'Other scene', kind: 'monitor', sceneId: 'elsewhere' });
  const brief = { prompt: 'Glowing architecture', durationS: 23, surfaceIDs: [s.id] };
  const manifest = projectionManifest(show, scene, brief);
  expect(manifest.targetSurfaceIDs).toEqual([s.id]); expect(manifest.durationS).toBe(23);
  expect(manifest.outputs).not.toContainEqual(expect.objectContaining({ id: 'other' }));
  expect(projectionPrompt(scene, brief)).toContain('23 seconds');
});
test('ZIP stores UTF-8 filenames with CRC and rejects traversal', async () => {
  const archive = await projectionZip([{ name: 'prompt.txt', data: '123456789' }, { name: 'référence.svg', data: '<svg/>' }]);
  const bytes = new Uint8Array(await archive.arrayBuffer()), view = new DataView(bytes.buffer);
  expect(view.getUint32(0, true)).toBe(0x04034b50); expect(view.getUint32(14, true)).toBe(0xcbf43926);
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50); expect(view.getUint16(bytes.length - 12, true)).toBe(2);
  await expect(projectionZip([{ name: '../bad', data: '' }])).rejects.toThrow('filename');
});
