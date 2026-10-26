// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { emptyShow } from '../document';
import { createClip } from '../compound-clips';
import { timelineTracks } from '../timelines';
import type { Visual } from '../visual-model';
import { installPointerEvents } from '../test-pointer';
import { ClipBoard } from './ClipBoard';

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
installPointerEvents();

function card() {
  let show = createClip(emptyShow(), 'Card', { widthPx: 1000, heightPx: 500 });
  const clipID = show.activeClipID!, track = timelineTracks(show, clipID).find(t => t.kind === 'video')!;
  const visual: Visual = { id: 'red', name: 'Red', trackID: track.id, startS: 0, durationS: 60, inS: 0, loop: true, continuous: true,
    targets: [], mapping: 'repeat', color: '#f00', opacity: 1, source: { mediaId: null, rect: [0, 0, 1000, 500], fill: '#ff0000' } };
  show = { ...show, visuals: [visual] };
  return { show, clipID, visual };
}

it('draws the clip on its board with the label', () => {
  const { show, clipID } = card();
  const { container } = render(<ClipBoard show={show} clipID={clipID} urls={{}} timeS={0} playing={false} />);
  expect(screen.getByText('Card · 1000 × 500')).toBeTruthy();
  expect(container.querySelectorAll('.map-clip-board .map-surface')).toHaveLength(1);
});

it('dragging a visual updates its placement', () => {
  const { show, clipID, visual } = card();
  const onChange = vi.fn();
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) });
  const { container } = render(<ClipBoard show={show} clipID={clipID} urls={{}} timeS={0} playing={false} placement={{ visual, onChange }} />);
  const svg = container.querySelector('.map-placement-handles')!, box = container.querySelector('.map-placement-box')!;
  (box as Element).setPointerCapture = () => {};
  fireEvent.pointerDown(box, { clientX: 500, clientY: 250, pointerId: 1 });
  // Alt moves without snapping (jsdom's board has no size to measure snap distance by).
  fireEvent.pointerMove(svg, { clientX: 600, clientY: 250, pointerId: 1, altKey: true });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ xPercent: 60 }));
});
