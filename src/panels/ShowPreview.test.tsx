// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { emptyShow } from '../document';
import { ShowPreview } from './ShowPreview';

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

it('the scene render shows the backdrop image while it is toggled on', () => {
  const show = emptyShow();
  show.media = [{ id: 'photo', name: 'Wall', file: 'wall.png', width: 1920, height: 1080, kind: 'image', bytes: 1 }];
  show.scenes[0].setupBackground = { mediaId: 'photo', visible: true, opacity: .6 };
  const props = { urls: { photo: '/wall.png' }, timeS: 0, playing: false };
  const { container, rerender } = render(<ShowPreview scenePreview show={show} {...props} />);
  expect(container.querySelector('.map-setup-background')?.getAttribute('src')).toBe('/wall.png');
  rerender(<ShowPreview show={show} {...props} />);
  expect(container.querySelector('.map-setup-background')).toBeNull(); // output previews never show it
  show.scenes[0].setupBackground = { ...show.scenes[0].setupBackground!, visible: false };
  rerender(<ShowPreview scenePreview show={{ ...show }} {...props} />);
  expect(container.querySelector('.map-setup-background')).toBeNull();
});

it("a clip use's handles frame the clip's board as it lands on the surface", async () => {
  const { newSurface, quadCorners } = await import('../document');
  const { createClip, ensureSurfaceTracks, assignClip, surfaceTrack } = await import('../compound-clips');
  const { MAIN_TIMELINE } = await import('../timelines');
  let show = emptyShow();
  const tall = { ...newSurface(show.output, 0), id: 'tall', corners: quadCorners([0, 0, 300, 600]) };
  tall.source = { ...tall.source, rect: [0, 0, 300, 600] };
  show.scenes[0].surfaces = [tall];
  show = createClip(show, 'Card', { widthPx: 1920, heightPx: 1080 });
  const clip = show.activeClipID!;
  show = ensureSurfaceTracks(show, MAIN_TIMELINE);
  show = assignClip(show, clip, surfaceTrack(show, MAIN_TIMELINE, 'tall')!.id, 0);
  const use = show.visuals!.find(v => v.timelineRefID === clip)!;
  const { container } = render(<ShowPreview scenePreview show={show} urls={{}} timeS={0} playing={false} placement={{ visual: use, onChange: vi.fn() }} />);
  // Cover: the board's full height fits the surface, its width overflows centred.
  const w = 1920 * 600 / 1080, x = (300 - w) / 2;
  const points = container.querySelector('[aria-label="Move visual"]')!.getAttribute('points')!.split(' ').map(p => p.split(',').map(Number));
  expect(points[0][0]).toBeCloseTo(x); expect(points[2][0]).toBeCloseTo(x + w); expect(points[2][1]).toBeCloseTo(600);
});
