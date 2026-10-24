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
test('Simple curve edits reach Performance and Advanced, and Undo restores motion across modes',()=>{
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:/Workspace:/}));fireEvent.click(screen.getByRole('menuitemradio',{name:'Scene'}));
 fireEvent.click(screen.getByRole('button',{name:'Advanced editor'}));
 fireEvent.click(within(document.querySelector('.map-visual-panel-title') as HTMLElement).getByRole('button',{name:'Add layer'}));fireEvent.click(screen.getByRole('button',{name:'Solid color'}));
 rightTab('Appearance');fireEvent.click(screen.getByText('Visual motion'));
 field('Opacity keyframe time','0');field('Opacity keyframe value','25');fireEvent.click(within(screen.getByText('Visual motion').closest('details')!).getByRole('button',{name:'Add keyframe'}));
 fireEvent.click(screen.getByRole('button',{name:'Performance'}));const performance=screen.getByRole('dialog',{name:'Performance'});
 expect((within(performance).getByRole('slider',{name:'Opacity fader'}) as HTMLInputElement).value).toBe('25');
 fireEvent.click(within(screen.getByRole('region',{name:'Opacity control'})).getByRole('button',{name:'Use manual control'}));
 fireEvent.click(within(performance).getByRole('button',{name:'Undo'}));expect((within(performance).getByRole('slider',{name:'Opacity fader'}) as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(within(performance).getByRole('button',{name:'Close'}));
 rightTab('Appearance');
 const section=screen.getByText('Visual motion').closest('details');if(section&&!section.open)fireEvent.click(screen.getByText('Visual motion'));
 expect(screen.getByRole('button',{name:'Select Opacity keyframe at 0s'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Switch to simple editor'}));
 rightTab('Appearance');expect(screen.queryByText('Visual motion')).toBeNull();
},15000);
