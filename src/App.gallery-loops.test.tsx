// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,within,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import App from './App';
import { installPointerEvents } from './test-pointer';
vi.mock('./features/ShaderMedia',()=>({ShaderMedia:()=> <span/>}));
vi.mock('./features/ShaderThumbnail',()=>({ShaderThumbnail:()=> <span/>}));
vi.mock('./media-import',()=>({naturalSize:async()=>({width:1280,height:720,duration:8})}));
vi.mock('./features/bundled-loops',async original=>({...await original<object>(),loadBundledLoop:async(loop:{name:string})=>new File(['verified bytes'],`${loop.name}.mp4`,{type:'video/mp4'})}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
beforeEach(()=>{
 localStorage.clear();installPointerEvents();
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
 vi.stubGlobal('BroadcastChannel',class{onmessage=null;postMessage(){}close(){}});
 vi.stubGlobal('URL',class extends URL{static createObjectURL(){return 'blob:fixture-video';}static revokeObjectURL(){}});
 vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 window.matchMedia??=(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as unknown as typeof window.matchMedia;
});
function begin(){render(<App/>);fireEvent.click(screen.getByRole('button',{name:/Workspace:/}));fireEvent.click(screen.getByRole('menuitemradio',{name:'Visualization'}));}
async function chooseLoop(name:string,action='Add visual to scene'){
 fireEvent.click(screen.getByRole('button',{name:'Video loops'}));fireEvent.click(screen.getByRole('button',{name:`Preview ${name}`}));
 fireEvent.click(screen.getByRole('button',{name:action}));
 await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Visual gallery'})).toBeNull());
}
function undo(){fireEvent.click(screen.getAllByRole('button',{name:'Document controls'})[0]);fireEvent.click(screen.getAllByRole('menuitem',{name:/^Undo/})[0]);}
const order=()=>within(screen.getByRole('group',{name:'Layers, front to back'})).getAllByRole('button').map(b=>b.getAttribute('aria-label'));
test('real app imports and replaces Simple loops with layer ordering, cross-mode state and Undo',async()=>{
 begin();fireEvent.click(screen.getByRole('button',{name:'Browse visual gallery'}));await chooseLoop('Prismatic Flow');
 expect(order()).toEqual(['Select Prismatic Flow.mp4']);
 fireEvent.click(screen.getByRole('button',{name:'Add visual'}));await chooseLoop('Orbital Lights');
 expect(order()).toEqual(['Select Orbital Lights.mp4','Select Prismatic Flow.mp4']);
 fireEvent.click(screen.getByRole('button',{name:'Send to back'}));expect(order()).toEqual(['Select Prismatic Flow.mp4','Select Orbital Lights.mp4']);
 fireEvent.click(screen.getByRole('button',{name:'Replace visual'}));await chooseLoop('Golden Confetti','Replace selected visual');
 expect(order()).toEqual(['Select Prismatic Flow.mp4','Select Golden Confetti.mp4']);
 undo();expect(order()).toEqual(['Select Prismatic Flow.mp4','Select Orbital Lights.mp4']);
 fireEvent.click(screen.getByRole('button',{name:'Advanced editor'}));fireEvent.click(screen.getByRole('button',{name:'Switch to simple editor'}));
 expect(order()).toEqual(['Select Prismatic Flow.mp4','Select Orbital Lights.mp4']);
},15000);
test('Advanced gallery imports into the selected Media Pool and Undo removes that import',async()=>{
 begin();fireEvent.click(screen.getByRole('button',{name:'Advanced editor'}));
 const pool=screen.getAllByRole('region',{name:'Media Pool'})[0];
 fireEvent.click(within(pool).getByRole('button',{name:'Gallery'}));await chooseLoop('Liquid Caustics','Add to Media Pool');
 const item=within(pool).getByRole('button',{name:'Liquid Caustics.mp4'});expect(item.getAttribute('aria-pressed')).toBe('true');
 expect((screen.getByRole('textbox',{name:'Pool asset name'}) as HTMLInputElement).value).toBe('Liquid Caustics.mp4');
 undo();expect(within(pool).queryByRole('button',{name:'Liquid Caustics.mp4'})).toBeNull();
},15000);
