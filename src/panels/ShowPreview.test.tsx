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
