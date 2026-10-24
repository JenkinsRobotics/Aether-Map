import { expect, test } from 'vitest';
import { emptyShow, newSurface, quadCorners } from './document';
import { fittedSourceRect, sourcePictureStyle } from './source-picture';
import { solveHomography, project } from './homography';
import { parseShow, serializeShow } from './show-file';
const fixture = () => ({ ...newSurface({ width: 100, height: 100 }, 0), corners: quadCorners([0, 0, 100, 100]), source: { mediaId: null, rect: [0, 0, 200, 100] as [number, number, number, number] } });
test('fit contains, fill crops, stretch preserves legacy mapping and all retain geometry', () => {
  const surface = fixture(), geometry = structuredClone(surface.corners);
  expect(fittedSourceRect(surface)).toEqual([0, 0, 200, 100]);
  const contain = { ...surface, source: { ...surface.source, fit: 'contain' as const } };
  expect(fittedSourceRect(contain)).toEqual([0, -50, 200, 200]);
  const matrix = solveHomography(quadCorners(fittedSourceRect(contain)), surface.corners);
  expect(project(matrix, [0, 0])).toEqual([0, 25]);
  expect(project(matrix, [200, 100])).toEqual([100, 75]);
  const cover = { ...surface, source: { ...surface.source, fit: 'cover' as const } };
  expect(fittedSourceRect(cover)).toEqual([50, 0, 100, 100]);
  expect(sourcePictureStyle(cover).clipPath).toBe('inset(0px 50px 0px 50px round 0px)');
  expect(sourcePictureStyle(cover, undefined, true)).toEqual(sourcePictureStyle(surface));
  expect(surface.corners).toEqual(geometry);
});
test('cropped inputs keep hidden pixels clipped and placement roundtrips', () => {
  const show = emptyShow(), surface = fixture();
  show.scenes[0].surfaces = [{ ...surface, source: { ...surface.source, rect: [20, 30, 200, 100], fit: 'contain' } }];
  const s = show.scenes[0].surfaces[0];
  expect(fittedSourceRect(s)).toEqual([20, -20, 200, 200]);
  expect(sourcePictureStyle(s).clipPath).toBe('inset(30px 0px 0px 20px round 0px)');
  expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].source).toEqual(s.source);
});

test('keeps Span bitmap masks in each target coordinate system using inverse child projection', async () => {
  const { alphaProjectionStyle } = await import('./source-picture');
  const { newSurface, emptyShow, quadCorners } = await import('./document');
  const { solveHomography, cssMatrix3d, project } = await import('./homography');
  const surface = newSurface(emptyShow().output, 0);
  surface.source.rect = [0, 0, 100, 100];
  surface.corners = [[0, 0], [200, 0], [200, 100], [0, 100]];
  surface.alphaMask = { png: 'data:image/png;base64,test' };
  const target = { corners: [[100, 0], [200, 0], [200, 100], [100, 100]] as typeof surface.corners, rect: [0, 0, 100, 100] as typeof surface.source.rect };
  const style = alphaProjectionStyle({ ...surface, alphaProjection: target });
  expect(style?.outer.maskPosition).toBe('0px 0px');
  expect(style?.outer.transform).toBe(cssMatrix3d(solveHomography(quadCorners(target.rect), target.corners), true));
  const inverse = solveHomography(target.corners, quadCorners(target.rect));
  expect(style?.inner.transform).toBe(cssMatrix3d(solveHomography(quadCorners(surface.source.rect), surface.corners.map(p => project(inverse, p)) as typeof surface.corners), true));
});
