// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import App from './App';
import { installPointerEvents } from './test-pointer';
vi.mock('./features/ShaderMedia',()=>({ShaderMedia:()=> <span/>}));
vi.mock('./features/ShaderThumbnail',()=>({ShaderThumbnail:()=> <span/>}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
beforeEach(()=>{
 localStorage.clear();installPointerEvents();
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
 vi.stubGlobal('BroadcastChannel',class{onmessage=null;postMessage(){}close(){}});
 window.matchMedia??=(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as unknown as typeof window.matchMedia;
});
const field=(name:string,value:string)=>{const input=screen.getByRole('textbox',{name});fireEvent.focus(input);fireEvent.change(input,{target:{value}});fireEvent.blur(input);};
test('Source motion reaches actual Simple/Performance/Advanced rendering and Undo',()=>{
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:/Workspace:/}));fireEvent.click(screen.getByRole('menuitemradio',{name:'Visualization'}));
 fireEvent.click(screen.getByRole('button',{name:'Browse visual gallery'}));fireEvent.click(screen.getByRole('button',{name:'Solid color'}));
 fireEvent.click(screen.getByRole('tab',{name:'Adjust'}));fireEvent.click(screen.getByText('Source motion'));
 field('Fill opacity keyframe time','0');field('Fill opacity keyframe value','25');fireEvent.click(within(screen.getByText('Source motion').closest('details')!).getByRole('button',{name:'Add keyframe'}));
 expect([...document.querySelectorAll<HTMLElement>('.map-fill')].some(node=>node.style.opacity==='0.25')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Performance'}));const performance=screen.getByRole('dialog',{name:'Performance'});
 expect((within(performance).getByRole('slider',{name:'Fill opacity fader'}) as HTMLInputElement).value).toBe('25');
 fireEvent.click(within(screen.getByRole('region',{name:'Fill opacity control'})).getByRole('button',{name:'Use manual control'}));
 fireEvent.click(within(performance).getByRole('button',{name:'Undo'}));expect((within(performance).getByRole('slider',{name:'Fill opacity fader'}) as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(within(performance).getByRole('button',{name:'Close'}));
 fireEvent.click(screen.getByRole('button',{name:'Advanced editor'}));
 fireEvent.click(screen.getByRole('tab',{name:'Adjust'}));
 const section=screen.getByText('Source motion').closest('details');if(section&&!section.open)fireEvent.click(screen.getByText('Source motion'));
 expect(screen.getByRole('button',{name:'Select Fill opacity keyframe at 0s'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Switch to simple editor'}));
 fireEvent.click(screen.getByRole('tab',{name:'Adjust'}));fireEvent.click(screen.getByText('Source motion'));
 expect(screen.getByRole('button',{name:'Select Fill opacity keyframe at 0s'})).toBeTruthy();
},15000);
