// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import { emptyShow,newSurface,type MapShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addSimpleVisual } from '../simple-visuals';
import { useDocumentHistory } from '../history';
import { SurfaceComposition } from './SurfaceComposition';
import { installPointerEvents } from '../test-pointer';
import type { FeatureKeyframe } from '../features/types';
vi.mock('../output',()=>({OutputSurface:()=>null}));
const keys=(a:number,b:number):FeatureKeyframe[]=>[{id:'a',timeS:0,value:a,interpolation:'linear'},{id:'b',timeS:4,value:b,interpolation:'linear'}];
function seed(){let show=normalizeDocument(emptyShow());show.scenes[0].surfaces=[{...newSurface({width:100,height:100},0),source:{mediaId:null,rect:[0,0,100,100]}}];
 show=addSimpleVisual(show,{mediaId:null,rect:[0,0,100,100],fill:'#fff'},'Moving');
 show.visuals![0]={...show.visuals![0],targets:[{sceneID:show.activeSceneId,surfaceID:show.scenes[0].surfaces[0].id}],motion:{animation:{xPercent:keys(30,70),yPercent:keys(40,80),widthPercent:keys(20,40),rotationDeg:keys(-10,10),opacityPercent:keys(0,100)}}};return show;}
function Harness(){const h=useDocumentHistory(seed()),show=h.present,v=show.visuals![0];return <>
 <SurfaceComposition show={show} surface={show.scenes[0].surfaces[0]} timeS={2} playing={false} urls={{}} selectedID={v.id} onSelect={()=>{}} onSurfaceChange={()=>{}}
  onChange={visual=>h.set(s=>({...s,visuals:[visual]}))} onGestureStart={h.beginGesture} onGestureEnd={h.endGesture}/>
 <button onClick={h.undo}>Undo test</button><output data-testid="show">{JSON.stringify(show)}</output></>;}
const value=()=>JSON.parse(screen.getByTestId('show').textContent!) as MapShow;
beforeEach(()=>{installPointerEvents();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
test('handles use evaluated placement and keyboard takeover clears only the moved axis',()=>{
 render(<Harness/>);const hit=screen.getByLabelText('Position Moving');
 expect(hit.getAttribute('points')!.split(/[ ,]/).map(Number).map(n=>Math.round(n)).join(',')).toBe('35,10,65,10,65,110,35,110');
 fireEvent.keyDown(screen.getByLabelText('Asset placement canvas'),{key:'ArrowRight'});
 expect(value().visuals![0].placement?.xPercent).toBe(51);expect(value().visuals![0].motion?.animation?.xPercent).toBeUndefined();
 expect(value().visuals![0].motion?.animation?.yPercent).toHaveLength(2);expect(value().visuals![0].motion?.animation?.rotationDeg).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(hit.getAttribute('points')!.split(/[ ,]/).map(Number).map(n=>Math.round(n)).join(',')).toBe('35,10,65,10,65,110,35,110');
});
test('drag starts from the evaluated frame, preserves size/rotation/opacity motion and is one undo step',()=>{
 render(<Harness/>);const canvas=screen.getByLabelText('Asset placement canvas');
 vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:100,height:100,right:100,bottom:100,x:0,y:0,toJSON(){}});
 fireEvent.pointerDown(screen.getByLabelText('Position Moving'),{button:0,clientX:50,clientY:60,pointerId:1});
 fireEvent.pointerMove(canvas,{clientX:55,clientY:65,pointerId:1,altKey:true});fireEvent.pointerMove(canvas,{clientX:60,clientY:70,pointerId:1,altKey:true});fireEvent.pointerUp(canvas,{pointerId:1});
 const visual=value().visuals![0];expect(visual.placement!.xPercent).toBeCloseTo(60);expect(visual.placement!.yPercent).toBeCloseTo(70);
 expect(visual.motion?.animation?.xPercent).toBeUndefined();expect(visual.motion?.animation?.yPercent).toBeUndefined();
 expect(visual.motion?.animation?.widthPercent).toHaveLength(2);expect(visual.motion?.animation?.rotationDeg).toHaveLength(2);expect(visual.motion?.animation?.opacityPercent).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(value().visuals![0].placement).toBeUndefined();expect(value().visuals![0].motion?.animation?.xPercent).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'Reset asset placement'}));expect(value().visuals![0].motion?.animation).toEqual({opacityPercent:keys(0,100)});
});
