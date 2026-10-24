// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PerformanceView } from './PerformanceView';
import { emptyShow, type MapShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addSimpleVisual } from '../simple-visuals';
import { newShader } from '../features/shader-catalog';
import { newVisualEffect } from '../visual-effects';
import { visualSource } from '../media-pool';
import { useDocumentHistory } from '../history';
import { createVisualCommands } from '../visual-commands';
vi.mock('../panels/ShowPreview', () => ({ ShowPreview: () => <div>Live pixels</div> }));
afterEach(cleanup);
function seed(){const show=addSimpleVisual(normalizeDocument(emptyShow()),{mediaId:null,rect:[0,0,1280,720],shader:newShader('neon-beams')},'Neon');return {...show,visuals:show.visuals!.map(v=>({...v,effects:[newVisualEffect('zoom','z')]}))};}
function Harness({initial=seed(),readOnly=false,onClose=vi.fn()}:{initial?:MapShow;readOnly?:boolean;onClose?:()=>void}){
  const history=useDocumentHistory(initial),show=history.present;const [id,setID]=useState(show.visuals![0].id),[time,setTime]=useState(2),[playing,setPlaying]=useState(false);
  const actions=createVisualCommands({show,edit:history.set,select:setID});
  return <><PerformanceView show={show} urls={{}} selectedID={id} timeS={time} playing={playing} onSelect={setID} onScene={id=>history.set(s=>({...s,activeSceneId:id}))}
    onChange={(v,k)=>actions.change(v.id,v,k)} onPlay={()=>setPlaying(p=>!p)} onSeek={setTime} onClose={onClose} onPickMedia={vi.fn()}
    onUndo={history.undo} onRedo={history.redo} canUndo={history.canUndo} canRedo={history.canRedo} onGestureStart={history.beginGesture} onGestureEnd={history.endGesture} readOnly={readOnly}/>
    <output data-testid="show">{JSON.stringify(show)}</output></>;
}
const value=()=>JSON.parse(screen.getByTestId('show').textContent!) as MapShow;
test('fader gestures update the canonical visual, form one undo step, and redo immediately',()=>{
  render(<Harness/>);const slider=screen.getByRole('slider',{name:'Opacity fader'});
  fireEvent.pointerDown(slider);fireEvent.change(slider,{target:{value:'75'}});fireEvent.change(slider,{target:{value:'40'}});fireEvent.pointerUp(window);
  expect(value().visuals![0].opacity).toBe(.4);fireEvent.click(screen.getByRole('button',{name:'Undo'}));expect(value().visuals![0].opacity).toBe(1);
  fireEvent.click(screen.getByRole('button',{name:'Redo'}));expect((slider as HTMLInputElement).value).toBe('40');
  fireEvent.click(screen.getByRole('button',{name:'Play'}));expect(screen.getByRole('button',{name:'Pause'})).toBeTruthy();
});
test('automated faders report live values; deliberate manual takeover and undo preserve keys',()=>{
  const show=seed(),visual=show.visuals![0];visual.effects![0].animation=[{id:'a',timeS:0,value:0,interpolation:'linear'},{id:'b',timeS:4,value:100,interpolation:'linear'}];
  render(<Harness initial={show}/>);const card=screen.getByRole('region',{name:'Zoom 1 control'}),slider=within(card).getByRole('slider');
  expect((slider as HTMLInputElement).value).toBe('50');expect((slider as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(within(card).getByRole('button',{name:'Use manual control'}));expect(value().visuals![0].effects![0]).toMatchObject({amount:50});expect(value().visuals![0].effects![0].animation).toBeUndefined();
  fireEvent.click(screen.getByRole('button',{name:'Undo'}));expect(value().visuals![0].effects![0].animation).toHaveLength(2);expect((slider as HTMLInputElement).disabled).toBe(true);
});
test('shader values, effect toggles, search and switching visuals update their actual targets',()=>{
  const show=addSimpleVisual(seed(),{mediaId:null,rect:[0,0,100,100],fill:'#fff'},'White');render(<Harness initial={show}/>);
  fireEvent.change(screen.getByRole('slider',{name:'Glow fader'}),{target:{value:'1.8'}});expect(visualSource(value(),value().visuals![0]).shader!.parameters.glow).toBe(1.8);
  fireEvent.click(screen.getByRole('button',{name:'Zoom 1 enabled'}));expect(value().visuals![0].effects![0].enabled).toBe(false);
  fireEvent.change(screen.getByRole('textbox',{name:'Find performance control'}),{target:{value:'glow'}});expect(screen.queryByRole('slider',{name:'Opacity fader'})).toBeNull();expect(screen.getByRole('slider',{name:'Glow fader'})).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox',{name:'Find performance control'}),{target:{value:''}});
  fireEvent.change(screen.getByRole('combobox',{name:'Performance visual'}),{target:{value:show.visuals![1].id}});expect(screen.queryByRole('slider',{name:'Glow fader'})).toBeNull();
  fireEvent.change(screen.getByRole('slider',{name:'Opacity fader'}),{target:{value:'20'}});expect(value().visuals![1].opacity).toBe(.2);expect(value().visuals![0].opacity).toBe(1);
});
test('locks and read-only documents prevent edits while keeping playback available',()=>{
  for(const mode of ['track','visual','readonly']){
    const show=seed();if(mode==='track')show.tracks!.find(t=>t.id===show.visuals![0].trackID)!.locked=true;if(mode==='visual')show.visuals![0].locked=true;
    const view=render(<Harness initial={show} readOnly={mode==='readonly'}/>);
    const slider=screen.getByRole('slider',{name:'Opacity fader'});expect(slider.matches(':disabled')).toBe(true);
    fireEvent.change(slider,{target:{value:'20'}});expect(value()).toEqual(show);
    expect(screen.getByRole('button',{name:'Play'}).matches(':disabled')).toBe(false);view.unmount();
  }
});
test('motion detail assigns real effect automation and fullscreen failure remains usable',async()=>{
  render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Zoom 1 motion'}));
  fireEvent.click(screen.getByRole('button',{name:'Add modulation'}));expect(value().visuals![0].effects![0].modulation).toMatchObject({range:{min:-100,max:100}});
  fireEvent.click(screen.getByRole('button',{name:'Full screen'}));expect(await screen.findByText('Full-screen is unavailable in this browser. The performance controls still fill this window.')).toHaveProperty('textContent',expect.stringContaining('Full-screen is unavailable'));
});

test('opacity and placement faders share motion authoring, evaluated takeover and Undo',()=>{
 const show=seed();show.visuals![0].motion={animation:{opacityPercent:[{id:'a',timeS:0,value:0,interpolation:'linear'},{id:'b',timeS:4,value:100,interpolation:'linear'}]}};
 render(<Harness initial={show}/>);const card=screen.getByRole('region',{name:'Opacity control'}),slider=within(card).getByRole('slider');
 expect((slider as HTMLInputElement).value).toBe('50');expect((slider as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(within(card).getByRole('button',{name:'Use manual control'}));expect(value().visuals![0].opacity).toBe(.5);expect(value().visuals![0].motion).toBeUndefined();
 fireEvent.click(screen.getByRole('button',{name:'Undo'}));expect(value().visuals![0].motion?.animation?.opacityPercent).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'Position X motion'}));fireEvent.click(screen.getByRole('button',{name:'Add modulation'}));
 expect(value().visuals![0].motion?.modulation?.xPercent).toMatchObject({range:{min:-100,max:200}});
 expect(value().visuals![0].motion?.animation?.opacityPercent).toHaveLength(2);
});
