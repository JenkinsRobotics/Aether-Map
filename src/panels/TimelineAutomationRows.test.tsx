// @vitest-environment jsdom
import { useState } from 'react';
import { act,cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import { emptyShow,type MapShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addSimpleVisual } from '../simple-visuals';
import { useDocumentHistory } from '../history';
import { CompositionTimeline } from './CompositionTimeline';
import { installPointerEvents } from '../test-pointer';
import { newShader } from '../features/shader-catalog';
import { DEFAULT_SHADER_TIME } from '../features/types';
let resized:Array<()=>void>=[];
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
beforeEach(()=>{
 resized=[];installPointerEvents();vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){resized.push(callback);}observe(){}disconnect(){}});
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(function(this:HTMLElement){const percent=this.classList.contains('map-ruler')?Number(this.parentElement?.style.gridTemplateColumns.match(/calc\(([\d.]+)%/)?.[1]??100):100;return 600*percent/100;});
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({x:100,y:100,left:100,top:100,right:700,bottom:156,width:600,height:56,toJSON(){}});
});
function seed():MapShow{
 let show=addSimpleVisual(normalizeDocument(emptyShow()),{mediaId:null,rect:[0,0,100,100],fill:'#ff0000'},'Red');show.scenes[0].durationS=10;
 show.visuals![0]={...show.visuals![0],continuous:false,startS:2,durationS:6,inS:1,motion:{animation:{opacityPercent:[{id:'a',timeS:1,value:0,interpolation:'linear'},{id:'b',timeS:3,value:100,interpolation:'linear'}]}}};
 show=addSimpleVisual(show,{mediaId:null,rect:[0,0,100,100],fill:'#0000ff'},'Blue');show.visuals![1]={...show.visuals![1],continuous:false,startS:4,durationS:4,inS:0,motion:{animation:{opacityPercent:[{id:'c',timeS:0,value:50,interpolation:'linear'}]}}};return show;
}
function Harness({initial=seed()}:{initial?:MapShow}){
 const h=useDocumentHistory(initial),show=h.present,[id,setID]=useState(show.visuals![0].id),[time,setTime]=useState(0),v=show.visuals!.find(v=>v.id===id)!;
 return <><CompositionTimeline show={show} trackID={v.trackID!} selectedID={v.trackID!} selectedClipID={v.id} timeS={time} playing={false}
   mixerOpen={false} onToggleMixer={()=>{}} onTrack={()=>{}} onEdit={u=>h.set(s=>normalizeDocument(u(s)))} onOpenAudio={()=>{}}
   onSeek={setTime} onTogglePlay={()=>{}} onSelectClip={(_,id)=>{if(id)setID(id);}} onChangeClip={()=>{}} onRemoveClip={()=>{}} onAddCue={()=>{}} onRemoveCue={()=>{}} onDuration={()=>{}} onMode={()=>{}}/>
 <button onClick={h.undo}>Undo test</button><button onClick={h.redo}>Redo test</button><button onClick={()=>h.set(s=>({...s,tracks:s.tracks?.map(t=>t.id===s.visuals![0].trackID?{...t,locked:true}:t)}))}>Lock first track</button><output data-testid="show">{JSON.stringify(show)}</output><output data-testid="time">{time}</output></>;
}
const value=()=>JSON.parse(screen.getByTestId('show').textContent!) as MapShow;
const key=()=>screen.getByRole('button',{name:'Red · Opacity key at 4s'});
const lane=()=>screen.getByRole('group',{name:'Red · Opacity timeline automation'});
const open=()=>fireEvent.click(screen.getByRole('button',{name:'Automation tracks'}));
test('different clips share the actual ruler scale, scroll grid and parameter inspector',()=>{
 render(<Harness/>);open();const red=key(),blue=screen.getByRole('button',{name:'Blue · Opacity key at 4s'});
 expect(red.style.left).toBe('240px');expect(blue.style.left).toBe(red.style.left);expect(lane().parentElement?.classList.contains('map-tracks')).toBe(true);
 fireEvent.click(blue);expect(screen.getByRole('complementary',{name:'Clip automation'}).textContent).toContain('Blue · Automation');expect(screen.getByTestId('time').textContent).toBe('4');
 expect((screen.getByRole('combobox',{name:'Automated visual parameter'}) as HTMLSelectElement).value).toBe('opacity');
 fireEvent.click(screen.getByRole('button',{name:'Zoom in'}));act(()=>resized.forEach(f=>f()));expect(key().style.left).toBe('360px');expect(screen.getByRole('button',{name:'Blue · Opacity key at 4s'}).style.left).toBe('360px');
});
test('pointer drag previews without writes, commits once, and Undo/Redo restore the original key',()=>{
 render(<Harness/>);open();const before=value(),button=key();
 fireEvent.pointerDown(button,{button:0,pointerId:1,clientX:340,clientY:108});fireEvent.pointerMove(lane(),{pointerId:1,clientX:400,clientY:128});expect(value()).toEqual(before);
 fireEvent.pointerUp(lane(),{pointerId:1,clientX:400,clientY:128});expect(value().visuals![0].motion!.animation!.opacityPercent![1]).toMatchObject({id:'b',timeS:4,value:50});expect(value().visuals).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(value()).toEqual(before);fireEvent.click(screen.getByRole('button',{name:'Redo test'}));expect(value().visuals![0].motion!.animation!.opacityPercent![1].timeS).toBe(4);
});
test.each(['Escape','cancel','capture'] as const)('%s discards a key drag without any document changes',how=>{
 render(<Harness/>);open();const before=value();fireEvent.pointerDown(key(),{button:0,pointerId:1,clientX:340,clientY:108});fireEvent.pointerMove(lane(),{pointerId:1,clientX:400,clientY:128});
 if(how==='Escape')fireEvent.keyDown(lane(),{key:'Escape'});else if(how==='cancel')fireEvent.pointerCancel(lane(),{pointerId:1});else fireEvent.lostPointerCapture(lane(),{pointerId:1});
 fireEvent.pointerUp(lane(),{pointerId:1});expect(value()).toEqual(before);
});
test('double-click adds a key in source time; keyboard edits/deletes the key without deleting its clip',()=>{
 render(<Harness/>);open();fireEvent.doubleClick(lane(),{clientX:400,clientY:128});expect(value().visuals![0].motion!.animation!.opacityPercent!.at(-1)).toMatchObject({timeS:4,value:50});
 fireEvent.keyDown(screen.getByRole('button',{name:'Red · Opacity key at 5s'}),{key:'ArrowRight',shiftKey:true});expect(value().visuals![0].motion!.animation!.opacityPercent!.at(-1)!.timeS).toBe(5);
 fireEvent.keyDown(screen.getByRole('button',{name:'Red · Opacity key at 6s'}),{key:'Delete'});expect(value().visuals).toHaveLength(2);expect(value().visuals![0].motion!.animation!.opacityPercent).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(value().visuals![0].motion!.animation!.opacityPercent).toHaveLength(3);
});
test('locked track allows viewing but prevents pointer, keyboard and insertion writes',()=>{
 const initial=seed();initial.tracks!.find(t=>t.id===initial.visuals![0].trackID)!.locked=true;render(<Harness initial={initial}/>);open();const before=value();expect(key().matches(':disabled')).toBe(true);
 fireEvent.doubleClick(lane(),{clientX:400,clientY:128});fireEvent.keyDown(key(),{key:'Delete'});expect(value()).toEqual(before);
 fireEvent.click(screen.getByRole('button',{name:'Edit Red · Opacity automation'}));expect(within(screen.getByRole('complementary',{name:'Clip automation'})).getByRole('button',{name:'Add keyframe'}).matches(':disabled')).toBe(true);
});
test('a track locked during a drag rejects the pending key change',()=>{
 render(<Harness/>);open();const before=value().visuals;fireEvent.pointerDown(key(),{button:0,pointerId:1,clientX:340,clientY:108});fireEvent.pointerMove(lane(),{pointerId:1,clientX:400,clientY:128});fireEvent.click(screen.getByRole('button',{name:'Lock first track'}));fireEvent.pointerUp(lane(),{pointerId:1});expect(value().visuals).toEqual(before);expect(key().matches(':disabled')).toBe(true);
});
test('editing a repeated shader key updates every occurrence of the same source key',()=>{
 const initial=seed(),v=initial.visuals![0],shader=newShader('neon-beams');shader.time={...DEFAULT_SHADER_TIME,loopS:4};shader.animation={glow:[{id:'start',timeS:0,value:0,interpolation:'linear'},{id:'high',timeS:2,value:2,interpolation:'linear'}]};v.continuous=true;v.motion=undefined;v.source={mediaId:null,rect:[0,0,100,100],shader};render(<Harness initial={initial}/>);open();
 expect(screen.getByRole('button',{name:'Red · Glow key at 6s'})).toBeTruthy();fireEvent.keyDown(screen.getByRole('button',{name:'Red · Glow key at 2s'}),{key:'ArrowRight'});
 expect(value().visuals![0].source!.shader!.animation!.glow!.at(-1)!.id).toBe('high');expect(value().visuals![0].source!.shader!.animation!.glow!.at(-1)!.timeS).toBeCloseTo(2.1,8);expect(screen.getByRole('button',{name:'Red · Glow key at 6.1s'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Red · Glow key at 6s'})).toBeNull();
});
