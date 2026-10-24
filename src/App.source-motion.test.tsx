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
// Motion lives with its category: opacity motion in Appearance, source motion in Properties.
// Clicking the open tab would close the sidebar, so only switch to it.
const rightTab=(name:string)=>{const tab=within(screen.getByRole('toolbar',{name:'Right sidebar tabs'})).getByRole('button',{name});if(tab.getAttribute('aria-pressed')!=='true'&&tab.getAttribute('aria-selected')!=='true')fireEvent.click(tab);};
test('Source motion reaches actual Simple/Performance/Advanced rendering and Undo',()=>{
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:/Workspace:/}));fireEvent.click(screen.getByRole('menuitemradio',{name:'Scene'}));
 fireEvent.click(screen.getByRole('button',{name:'Advanced editor'}));
 fireEvent.click(within(document.querySelector('.map-visual-panel-title') as HTMLElement).getByRole('button',{name:'Add layer'}));fireEvent.click(screen.getByRole('button',{name:'Solid color'}));
 rightTab('Properties');fireEvent.click(screen.getByText('Source motion'));
 field('Fill opacity keyframe time','0');field('Fill opacity keyframe value','25');fireEvent.click(within(screen.getByText('Source motion').closest('details')!).getByRole('button',{name:'Add keyframe'}));
 expect([...document.querySelectorAll<HTMLElement>('.map-fill')].some(node=>node.style.opacity==='0.25')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Performance'}));const performance=screen.getByRole('dialog',{name:'Performance'});
 expect((within(performance).getByRole('slider',{name:'Fill opacity fader'}) as HTMLInputElement).value).toBe('25');
 fireEvent.click(within(screen.getByRole('region',{name:'Fill opacity control'})).getByRole('button',{name:'Use manual control'}));
 fireEvent.click(within(performance).getByRole('button',{name:'Undo'}));expect((within(performance).getByRole('slider',{name:'Fill opacity fader'}) as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(within(performance).getByRole('button',{name:'Close'}));
 rightTab('Properties');
 const section=screen.getByText('Source motion').closest('details');if(section&&!section.open)fireEvent.click(screen.getByText('Source motion'));
 expect(screen.getByRole('button',{name:'Select Fill opacity keyframe at 0s'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Switch to simple editor'}));
 rightTab('Properties');expect(screen.queryByText('Source motion')).toBeNull();
},15000);
