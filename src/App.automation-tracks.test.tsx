// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import App from './App';
import { installPointerEvents } from './test-pointer';
vi.mock('./features/ShaderMedia',()=>({ShaderMedia:()=> <span/>}));
vi.mock('./features/ShaderThumbnail',()=>({ShaderThumbnail:()=> <span/>}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
beforeEach(()=>{
 localStorage.clear();installPointerEvents();vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
 vi.stubGlobal('BroadcastChannel',class{onmessage=null;postMessage(){}close(){}});
 window.matchMedia??=(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as unknown as typeof window.matchMedia;
});
const field=(name:string,value:string)=>{const input=screen.getByRole('textbox',{name});fireEvent.focus(input);fireEvent.change(input,{target:{value}});fireEvent.blur(input);};
const undo=()=>{fireEvent.click(screen.getAllByRole('button',{name:'Document controls'})[0]);fireEvent.click(screen.getAllByRole('menuitem',{name:/^Undo/})[0]);};
test('Main rows edit the same Simple/Advanced motion with real App Undo and clip-safe Delete',()=>{
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:/Workspace:/}));fireEvent.click(screen.getByRole('menuitemradio',{name:'Visualization'}));
 fireEvent.click(screen.getByRole('button',{name:'Browse visual gallery'}));fireEvent.click(screen.getByRole('button',{name:'Solid color'}));
 fireEvent.click(screen.getByRole('tab',{name:'Adjust'}));fireEvent.click(screen.getByText('Visual motion'));
 const opacity=()=>within(screen.getByRole('region',{name:'Opacity keyframes'}));
 field('Opacity keyframe time','0');field('Opacity keyframe value','20');fireEvent.click(opacity().getByRole('button',{name:'Add keyframe'}));
 fireEvent.click(opacity().getByRole('button',{name:'New keyframe'}));field('Opacity keyframe time','4');field('Opacity keyframe value','80');fireEvent.click(opacity().getByRole('button',{name:'Add keyframe'}));
 fireEvent.click(screen.getByRole('button',{name:'Advanced editor'}));
 const timeline=within(screen.getByRole('toolbar',{name:'Map workspace dock tabs'})).getByRole('button',{name:'Timeline'});if(timeline.getAttribute('aria-pressed')!=='true')fireEvent.click(timeline);
 fireEvent.click(screen.getByRole('button',{name:'Automation tracks'}));
 const key=screen.getByRole('button',{name:/· Opacity key at 4s$/});fireEvent.keyDown(key,{key:'ArrowRight',shiftKey:true});expect(screen.getByRole('button',{name:/· Opacity key at 5s$/})).toBeTruthy();
 undo();expect(screen.getByRole('button',{name:/· Opacity key at 4s$/})).toBeTruthy();
 const clips=document.querySelectorAll('.map-clip').length;fireEvent.keyDown(screen.getByRole('button',{name:/· Opacity key at 4s$/}),{key:'Delete'});expect(document.querySelectorAll('.map-clip')).toHaveLength(clips);expect(screen.queryByRole('button',{name:/· Opacity key at 4s$/})).toBeNull();
 undo();fireEvent.click(screen.getByRole('button',{name:'Switch to simple editor'}));fireEvent.click(screen.getByRole('tab',{name:'Adjust'}));fireEvent.click(screen.getByText('Visual motion'));expect(screen.getByRole('button',{name:'Select Opacity keyframe at 4s'})).toBeTruthy();
},15000);
