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
function begin(){render(<App/>);fireEvent.click(screen.getByRole('button',{name:/Workspace:/}));fireEvent.click(screen.getByRole('menuitemradio',{name:'Scene'}));}
async function chooseLoop(name:string,action='Add visual to scene'){
 fireEvent.click(screen.getByRole('button',{name:'Video loops'}));fireEvent.click(screen.getByRole('button',{name:`Preview ${name}`}));
 fireEvent.click(screen.getByRole('button',{name:action}));
 await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Visual gallery'})).toBeNull());
}
function undo(){fireEvent.click(screen.getAllByRole('button',{name:'Document controls'})[0]);fireEvent.click(screen.getAllByRole('menuitem',{name:/^Undo/})[0]);}
const order = () => within(screen.getByRole('list', { name: 'Visuals' })).queryAllByRole('button', { name: /^Select / }).map(b => b.getAttribute('aria-label')).filter(l => !/^Select Surface \d/.test(l ?? ''));
test('real app imports and replaces Simple loops with layer ordering, cross-mode state and Undo',async()=>{
 begin();fireEvent.click(screen.getByRole('button',{name:'Browse visual gallery'}));await chooseLoop('Prismatic Flow');
 expect(order()).toEqual(['Select Prismatic Flow.mp4']);
 fireEvent.click(within(document.querySelector('.map-visual-panel-title') as HTMLElement).getByRole('button', { name: 'Add layer' }));await chooseLoop('Orbital Lights');
 expect(order()).toEqual(['Select Orbital Lights.mp4','Select Prismatic Flow.mp4']);
 fireEvent.click(screen.getByRole('button',{name:'Send to back'}));expect(order()).toEqual(['Select Prismatic Flow.mp4','Select Orbital Lights.mp4']);
 fireEvent.click(within(screen.getByRole('region',{name:'Layer properties'})).getByRole('button',{name:/^Options for /}));fireEvent.click(screen.getByRole('menuitem',{name:'Replace layer'}));await chooseLoop('Golden Confetti','Replace selected visual');
 expect(order()).toEqual(['Select Prismatic Flow.mp4','Select Golden Confetti.mp4']);
 undo();expect(order()).toEqual(['Select Prismatic Flow.mp4','Select Orbital Lights.mp4']);
 fireEvent.click(screen.getByRole('button',{name:'Advanced editor'}));fireEvent.click(screen.getByRole('button',{name:'Switch to simple editor'}));
 expect(order()).toEqual(['Select Prismatic Flow.mp4','Select Orbital Lights.mp4']);
},15000);
test('Advanced + opens the same gallery and Undo removes that import',async()=>{
 begin();fireEvent.click(screen.getByRole('button',{name:'Advanced editor'}));
 fireEvent.click(within(document.querySelector('.map-visual-panel-title') as HTMLElement).getByRole('button', { name: 'Add layer' }));await chooseLoop('Liquid Caustics');
 expect(order()).toEqual(['Select Liquid Caustics.mp4']);
 undo();expect(order()).toEqual([]);
},15000);
test('a timeline is added from the gallery like any asset and listed with the media',async()=>{
 begin();fireEvent.click(screen.getByRole('button',{name:'Advanced editor'}));
 const timelines=within(screen.getByRole('group',{name:'Scene controls'}));
 fireEvent.click(timelines.getByRole('button',{name:'New scene'}));
 fireEvent.click(within(screen.getByRole('tree',{name:'Scenes'})).getByRole('treeitem',{name:/Main/}));
 fireEvent.click(within(document.querySelector('.map-visual-panel-title') as HTMLElement).getByRole('button',{name:'Add layer'}));
 fireEvent.click(screen.getByRole('button',{name:'Scenes'}));fireEvent.click(screen.getByRole('button',{name:'Preview Scene 1'}));
 fireEvent.click(screen.getByRole('button',{name:'Add visual to scene'}));
 expect(order()).toEqual(['Select Scene 1']);
},15000);
test('Scene tool row adds visuals beside the surface row; several files import at once; Add to project only pools them',async()=>{
 begin();
 const tools=screen.getByRole('toolbar',{name:'Add visual'});
 expect(within(tools).getAllByRole('button').map(b=>b.textContent?.trim())).toEqual(['Image','Video','Camera','Colour','Text','Drawing','Generator']);
 expect(screen.getByRole('region',{name:'Apply to surfaces'})).toBeTruthy();
 fireEvent.click(within(tools).getByRole('button',{name:'Camera'}));
 expect(order()).toEqual(['Select Webcam']);
 const picker=document.querySelector<HTMLInputElement>('input[type=file][multiple]')!;
 const click=vi.spyOn(picker,'click').mockImplementation(()=>{});
 fireEvent.click(within(tools).getByRole('button',{name:'Image'}));
 expect(click).toHaveBeenCalled();expect(picker.accept).toBe('image/*');
 fireEvent.change(picker,{target:{files:[new File(['a'],'a.png',{type:'image/png'}),new File(['b'],'b.png',{type:'image/png'})]}});
 await waitFor(()=>expect(order()).toEqual(['Select b.png','Select a.png','Select Webcam']));
 fireEvent.click(within(tools).getByRole('button',{name:'Generator'}));
 fireEvent.click(within(screen.getByRole('dialog',{name:'Visual gallery'})).getByRole('button',{name:'Add to project'}));
 fireEvent.change(picker,{target:{files:[new File(['c'],'c.png',{type:'image/png'})]}});
 fireEvent.click(within(tools).getByRole('button',{name:'Generator'}));
 fireEvent.click(within(screen.getByRole('dialog',{name:'Visual gallery'})).getByRole('button',{name:'In this show'}));
 await waitFor(()=>expect(within(screen.getByRole('dialog',{name:'Visual gallery'})).getByText('c.png')).toBeTruthy());
 expect(order()).toEqual(['Select b.png','Select a.png','Select Webcam']); // pooled, not applied
},20000);
test('the Scene transport end time sets the scene length',()=>{
 begin();
 const length=screen.getByRole('textbox',{name:'Scene duration'});
 fireEvent.change(length,{target:{value:'45'}});fireEvent.blur(length);
 expect((screen.getByRole('textbox',{name:'Scene duration'}) as HTMLInputElement).value).toMatch(/^45/);
 expect(screen.getByRole('slider',{name:'Preview position'}).outerHTML).toMatch(/max="45"|valuemax="45"/);
});
