// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VisualEffects } from './VisualEffects';
vi.mock('./effect-warp', () => ({ effectWarpMap: () => [{url:'data:image/png;base64,fixture',scale:.1,x:0,y:0,width:1,height:1,imageX:0,imageY:0,imageSize:1,dx:0,dy:0}] }));
afterEach(cleanup);
it('applies source effects top-to-bottom without duplicating the source', () => {
  const { container } = render(<VisualEffects timeS={2} effects={[
    { id:'blur', kind:'blur', enabled:true, amount:25 },
    { id:'gray', kind:'grayscale', enabled:false, amount:100 },
    { id:'hue', kind:'hue', enabled:true, amount:50 },
  ]}><canvas aria-label="One source" /></VisualEffects>);
  expect(container.querySelectorAll('canvas')).toHaveLength(1);
  expect((container.firstElementChild as HTMLElement).style.filter).toBe('hue-rotate(360deg)');
  expect((container.firstElementChild?.firstElementChild as HTMLElement).style.filter).toBe('blur(5px)');
});
it('uses deterministic source time for continuous slide and rotation; zoom is independent', () => {
  const { container, rerender } = render(<VisualEffects timeS={0} effects={[{ id:'slide', kind:'slide', enabled:true, amount:25 }]}><canvas /></VisualEffects>);
  expect(container.querySelector('filter')).toBeNull();
  rerender(<VisualEffects timeS={1} effects={[{ id:'slide', kind:'slide', enabled:true, amount:25 }]}><canvas /></VisualEffects>);
  expect(container.querySelectorAll('feOffset')[0].getAttribute('dx')).toBe('0.25');
  expect(container.querySelectorAll('feOffset')[1].getAttribute('dx')).toBe('-0.75');
  rerender(<VisualEffects timeS={1} effects={[{ id:'rotate', kind:'rotate', enabled:true, amount:25 }, { id:'zoom', kind:'zoom', enabled:true, amount:50 }]}><canvas /></VisualEffects>);
  expect((container.firstElementChild as HTMLElement).style.transform).toBe('scale(1.5)');
  expect((container.firstElementChild?.firstElementChild as HTMLElement).style.transform).toBe('rotate(90deg)');
});

it('processes live content once, gives each instance unique filters, and keeps zero strength unchanged', () => {
  const { container, rerender } = render(<><VisualEffects timeS={3} effects={[{id:'same',kind:'tile',enabled:true,amount:3}]}><video /></VisualEffects>
    <VisualEffects timeS={3} effects={[{id:'same',kind:'kaleido',enabled:true,amount:6}]}><canvas /></VisualEffects></>);
  expect(container.querySelectorAll('video')).toHaveLength(1); expect(container.querySelectorAll('canvas')).toHaveLength(1);
  const ids = [...container.querySelectorAll('filter')].map(e => e.id); expect(new Set(ids).size).toBe(2);
  expect(container.querySelector('feTile')).toBeTruthy(); expect(container.querySelector('feDisplacementMap')).toBeTruthy();
  rerender(<VisualEffects timeS={3} effects={[{id:'v',kind:'vintage',enabled:true,amount:0}]}><video /></VisualEffects>);
  expect(container.querySelector('filter')).toBeNull(); expect(container.querySelectorAll('video')).toHaveLength(1);
});
it('vintage grain follows source time exactly and restores original alpha after processing', () => {
  const { container, rerender } = render(<VisualEffects timeS={2} effects={[{id:'v',kind:'vintage',enabled:true,amount:70}]}><span>Text</span></VisualEffects>);
  expect(container.querySelector('feTurbulence')!.getAttribute('seed')).toBe('24');
  expect(container.querySelector('filter')!.lastElementChild!.getAttribute('in2')).toBe('SourceAlpha');
  rerender(<VisualEffects timeS={1} effects={[{id:'v',kind:'vintage',enabled:true,amount:70}]}><span>Text</span></VisualEffects>);
  expect(container.querySelector('feTurbulence')!.getAttribute('seed')).toBe('12');
});
