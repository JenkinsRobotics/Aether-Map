// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import App from './App';
import { installPointerEvents } from './test-pointer';

// The footer widgets toggle from the aux toolbar, like the aux sidebar panels.
// The Timeline toggle only exists outside the Mapping workspace.
const openTimelineDock = () => {
  const rail = document.querySelector(".aui-studio-aux-toolbar") as HTMLElement;
  const timeline = within(rail).getByRole("button", { name: "Timeline" });
  if (timeline.getAttribute("aria-pressed") !== "true") fireEvent.click(timeline);
};

vi.mock('./features/ShaderMedia',()=>({ShaderMedia:()=> <span/>}));
vi.mock('./features/ShaderThumbnail',()=>({ShaderThumbnail:()=> <span/>}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
beforeEach(()=>{
 localStorage.clear();installPointerEvents();vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
 vi.stubGlobal('BroadcastChannel',class{onmessage=null;postMessage(){}close(){}});
 window.matchMedia??=(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as unknown as typeof window.matchMedia;
});
const field=(name:string,value:string)=>{const input=screen.getByRole('textbox',{name});fireEvent.focus(input);fireEvent.change(input,{target:{value}});fireEvent.blur(input);};
// Real App Undo through the Studio tool bar's Undo chip (always mounted).
const undo=()=>{fireEvent.click(screen.getAllByRole('button',{name:'Undo'}).find(b=>!(b as HTMLButtonElement).disabled)!);};
// Motion lives with its category: opacity motion in Appearance, source motion in Properties.
// Clicking the open tab would close the sidebar, so only switch to it.
const rightTab=(name:string)=>{const tab=within(screen.getByRole('toolbar',{name:'Right sidebar tabs'})).getByRole('button',{name});if(tab.getAttribute('aria-pressed')!=='true'&&tab.getAttribute('aria-selected')!=='true')fireEvent.click(tab);};
test('Advanced motion rows edit keyframes with real App Undo and clip-safe Delete',()=>{
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:/Workspace:/}));fireEvent.click(screen.getByRole('menuitemradio',{name:'Scene'}));
 fireEvent.click(screen.getByRole('button',{name:'Advanced editor'}));
 fireEvent.click(within(document.querySelector('.map-visual-panel-title') as HTMLElement).getByRole('button',{name:'Add layer'}));fireEvent.click(screen.getByRole('button',{name:'Solid color'}));
 rightTab('Appearance');fireEvent.click(screen.getByText('Visual motion'));
 const opacity=()=>within(screen.getByRole('region',{name:'Opacity keyframes'}));
 field('Opacity keyframe time','0');field('Opacity keyframe value','20');fireEvent.click(opacity().getByRole('button',{name:'Add keyframe'}));
 fireEvent.click(opacity().getByRole('button',{name:'New keyframe'}));field('Opacity keyframe time','4');field('Opacity keyframe value','80');fireEvent.click(opacity().getByRole('button',{name:'Add keyframe'}));
 const timeline=within((openTimelineDock(), document.querySelector('.aui-studio-aux-toolbar') as HTMLElement)).getByRole('button',{name:'Timeline'});if(timeline.getAttribute('aria-pressed')!=='true')fireEvent.click(timeline);
 fireEvent.click(screen.getByRole('button',{name:'Automation tracks'}));
 const key=screen.getByRole('button',{name:/· Opacity key at 4s$/});fireEvent.keyDown(key,{key:'ArrowRight',shiftKey:true});expect(screen.getByRole('button',{name:/· Opacity key at 5s$/})).toBeTruthy();
 undo();expect(screen.getByRole('button',{name:/· Opacity key at 4s$/})).toBeTruthy();
 const clips=document.querySelectorAll('.map-clip').length;fireEvent.keyDown(screen.getByRole('button',{name:/· Opacity key at 4s$/}),{key:'Delete'});expect(document.querySelectorAll('.map-clip')).toHaveLength(clips);expect(screen.queryByRole('button',{name:/· Opacity key at 4s$/})).toBeNull();
 undo();fireEvent.click(screen.getByRole('button',{name:'Switch to simple editor'}));rightTab('Appearance');expect(screen.queryByText('Visual motion')).toBeNull();
},15000);
