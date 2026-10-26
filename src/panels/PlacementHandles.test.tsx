// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PlacementHandles } from './PlacementHandles';
import { installPointerEvents } from '../test-pointer';

installPointerEvents();

// As surfaces and the backdrop in Mapping: a corner resizes from the opposite
// corner keeping proportions (Shift stretches); moves snap to the frame (Alt frees).
it('dragging the box moves the visual and a corner resizes it from the opposite corner', () => {
  const onChange = vi.fn();
  // Frame units equal screen pixels here: the pointer maps straight through.
  const { container } = render(<PlacementHandles value={undefined} frame={[0, 0, 200, 100]} bounds={[0, 0, 200, 100]} unitPx={1}
    toLocal={(x, y) => [x, y]} onChange={onChange} />);
  const svg = container.querySelector('svg')!, box = container.querySelector('.map-placement-box')!;
  box.setPointerCapture = () => {};
  fireEvent.pointerDown(box, { clientX: 100, clientY: 50, pointerId: 1 });
  fireEvent.pointerMove(svg, { clientX: 120, clientY: 60, pointerId: 1 });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ xPercent: 60, yPercent: 60, widthPercent: 100 }));
  fireEvent.pointerUp(svg, { pointerId: 1 });
  const corner = container.querySelectorAll('.map-placement-handle')[2];
  corner.setPointerCapture = () => {};
  fireEvent.pointerDown(corner, { clientX: 200, clientY: 100, pointerId: 2 });
  fireEvent.pointerMove(svg, { clientX: 150, clientY: 60, pointerId: 2 });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ xPercent: 37.5, yPercent: 37.5, widthPercent: 75, heightPercent: 75 }));
  fireEvent.pointerMove(svg, { clientX: 150, clientY: 60, pointerId: 2, shiftKey: true });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ widthPercent: 75, heightPercent: 60 }));
  fireEvent.pointerUp(svg, { pointerId: 2 });
});

it('a move snaps the visual to the frame edges unless Alt is held', () => {
  const onChange = vi.fn();
  const { container } = render(<PlacementHandles value={{ xPercent: 40, yPercent: 50, widthPercent: 50, heightPercent: 50, rotationDeg: 0 }} frame={[0, 0, 200, 100]} bounds={[0, 0, 200, 100]} unitPx={1}
    toLocal={(x, y) => [x, y]} onChange={onChange} />);
  const svg = container.querySelector('svg')!, box = container.querySelector('.map-placement-box')!;
  box.setPointerCapture = () => {};
  // Left edge starts at x=30; moving it to x=3 lands within 6px of the frame's left edge.
  fireEvent.pointerDown(box, { clientX: 80, clientY: 50, pointerId: 1 });
  fireEvent.pointerMove(svg, { clientX: 53, clientY: 50, pointerId: 1 });
  expect(onChange.mock.lastCall![0].xPercent).toBeCloseTo(25);
  fireEvent.pointerMove(svg, { clientX: 53, clientY: 50, pointerId: 1, altKey: true });
  expect(onChange.mock.lastCall![0].xPercent).toBeCloseTo(26.5);
});
