// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SurfaceMedia } from './SurfaceMedia';
vi.mock('./features/effect-warp', () => ({effectWarpMap: () => []}));
afterEach(cleanup);
test('image alpha masks clip the final effected picture once, rather than warping with its source', () => {
  const {container} = render(<SurfaceMedia url="data:image/png;base64,fixture" kind="image" source={{mediaId:'image',rect:[10,20,960,540],effects:[{id:'tile',kind:'tile',amount:3,enabled:true}]}}
    alphaMask={{png:'data:image/png;base64,mask',name:'Cutout'}} timeS={0} playing={false} style={{position:'absolute',width:960,height:540}}/>);
  expect(container.querySelectorAll('img')).toHaveLength(1);
  expect((container.firstElementChild as HTMLElement).style.maskImage).toContain('mask');
  expect(container.querySelector('img')!.style.maskImage).toBe('');
  expect(container.querySelector('[data-visual-effect]')).toBeTruthy();
  expect((container.firstElementChild as HTMLElement).style.maskPosition).toBe('10px 20px');
});
