// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PlacementHandles } from './PlacementHandles';
import { installPointerEvents } from '../test-pointer';

installPointerEvents();

it('dragging the box moves the visual and a corner resizes it about its centre', () => {
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
  fireEvent.pointerMove(svg, { clientX: 150, clientY: 75, pointerId: 2 });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ xPercent: 50, widthPercent: 50, heightPercent: 50 }));
});
