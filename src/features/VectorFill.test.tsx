// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { emptyShow, newSurface } from '../document';
import { parseShow, serializeShow } from '../show-file';
import { placeContent } from '../content-placement';
import { evaluateSurface } from '../playback';
import { SurfaceMedia } from '../SurfaceMedia';
import { SourceFields } from './SourceFields';
import { sourceKind } from '../surface-assets';
import { usesMediaPixels } from '../source-picture';
import type { VectorGradient } from '@aether/sketch';
afterEach(cleanup);
const gradient: VectorGradient = { kind: 'linear', angleDeg: 90, stops: [{ offset: 0, color: '#ff0000', opacity: 1 }, { offset: 1, color: '#0000ff', opacity: .25 }] };
it('preserves paint on surface and scene content, including timeline sources and geometry', () => {
  const show = emptyShow(), surface = newSurface(show.output, 0); show.scenes[0].surfaces = [surface];
  const source = { ...surface.source, fillGradient: gradient, fillOpacity: .75 };
  const placed = placeContent(show, source, { sceneID: show.scenes[0].id, target: 'surface', surfaceID: surface.id, placement: 'replace', timeS: 0 });
  const loaded = parseShow(serializeShow(placed)), s = loaded.scenes[0].surfaces[0];
  expect(evaluateSurface(s, 0).source).toMatchObject({ fillGradient: gradient, fillOpacity: .75 });
  expect(s.corners).toEqual(surface.corners); expect(s.masks).toEqual(surface.masks);
  const scene = placeContent(loaded, source, { sceneID: show.scenes[0].id, target: 'scene', placement: 'replace', timeS: 0 });
  expect(evaluateSurface(parseShow(serializeShow(scene)).scenes[0].surfaces.find(s => s.sceneCanvas)!, 0).source.fillGradient).toEqual(gradient);
  expect(sourceKind(source)).toBe('Colour'); expect(usesMediaPixels({ ...source, mediaId: 'old-image' })).toBe(false);
});
it('renders independent SVG paint in preview and output with stop alpha and source crop', () => {
  const source = { mediaId: null, rect: [20, 30, 100, 80] as const, fillGradient: gradient, fillOpacity: .75 };
  const { container } = render(<>{[0, 1].map(key => <SurfaceMedia key={key} source={{ ...source, rect: [...source.rect] }} timeS={0} playing={false} style={{ width: 120, height: 110 }} />)}</>);
  const gradients = container.querySelectorAll('linearGradient'); expect(gradients).toHaveLength(2); expect(gradients[0].id).not.toBe(gradients[1].id);
  expect(container.querySelector('stop:last-child')?.getAttribute('stop-opacity')).toBe('0.25');
  expect(container.querySelector('.map-fill rect')?.getAttribute('x')).toBe('20');
  expect(container.querySelector('.map-fill rect')?.getAttribute('fill-opacity')).toBe('0.75');
});
it('clears vector paint when changing source to a shader without replacing boundary geometry', () => {
  const show = emptyShow(), surface = newSurface(show.output, 0), onPatch = vi.fn(); surface.source = { ...surface.source, fill: '#ffffff', fillGradient: gradient };
  render(<SourceFields surface={surface} show={show} onPatch={onPatch} onPickMedia={() => {}} />);
  fireEvent.change(screen.getByLabelText('Surface content'), { target: { value: 'shader' } });
  const patch = onPatch.mock.calls[0][1]; expect(patch.source.shader).toBeDefined(); expect(patch.source.fillGradient).toBeUndefined(); expect(patch.corners).toBeUndefined();
});
it('drops malformed gradient metadata on show import', () => {
  const show = emptyShow(), surface = newSurface(show.output, 0); show.scenes[0].surfaces = [surface];
  surface.source.fillGradient = { ...gradient, stops: [{ ...gradient.stops[0], opacity: 20 }, gradient.stops[1]] };
  expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].source.fillGradient).toBeUndefined();
});
