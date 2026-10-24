// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { emptyShow, newSurface, type MapShow } from '../document';
import { useDocumentHistory } from '../history';
import { normalizeDocument } from '../normalize-document';
import { AnimationFields } from './AnimationFields';
import { DEFAULT_LFOS, type AnimatedProperty } from './types';
import { ModulationContext } from './ModulationContext';
import { evaluateSurface } from '../playback';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function seed(locked=false){const show=emptyShow();show.scenes[0].surfaces=[{...newSurface(show.output,0),locked}];return normalizeDocument(show);}
function Harness({locked=false}:{locked?:boolean}){
  const h=useDocumentHistory(seed(locked)),show=h.present,s=show.scenes[0].surfaces[0];
  const [property,onProperty]=useState<AnimatedProperty>('opacity'),[timeS,onSeek]=useState(0);
  return <ModulationContext.Provider value={{lfos:show.lfos??DEFAULT_LFOS,timeS,onLfos:lfos=>h.set(p=>({...p,lfos}))}}>
    <AnimationFields inspector surface={s} property={property} onProperty={onProperty} timeS={timeS} onSeek={onSeek} onPatch={(_,patch)=>h.set(p=>normalizeDocument({...p,scenes:p.scenes.map(scene=>({...scene,surfaces:scene.surfaces.map(surface=>surface.id===s.id?{...surface,...patch}:surface)}))}))}/>
    <button onClick={h.undo}>Undo test</button><button onClick={h.redo}>Redo test</button><output data-testid="show">{JSON.stringify(show)}</output>
  </ModulationContext.Provider>;
}
const state=()=>JSON.parse(screen.getByTestId('show').textContent!) as MapShow;
const surface=()=>state().scenes[0].surfaces[0];
function field(name:string,value:string){const node=screen.getByRole('textbox',{name});fireEvent.focus(node);fireEvent.change(node,{target:{value}});fireEvent.blur(node);}
test('radius/bend keys, axis and evaluated geometry survive ordinary Undo/Redo',()=>{
  render(<Harness/>);
  fireEvent.change(screen.getByRole('combobox',{name:'Animated property'}),{target:{value:'radiusPx'}});
  fireEvent.click(screen.getByRole('button',{name:'Add keyframe'}));field('Keyframe time','4');field('Animated value','40');
  expect(surface().animation?.radiusPx).toHaveLength(2);expect(state().version).toBe(12);expect(evaluateSurface(surface(),2).radiusPx).toBe(20);
  fireEvent.change(screen.getByRole('combobox',{name:'Animated property'}),{target:{value:'bendAngleDeg'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Surface bend axis'}),{target:{value:'vertical'}});field('Animated value','60');
  expect(evaluateSurface(surface(),4).bend).toEqual({axis:'vertical',angleDeg:60});
  fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(surface().animation?.bendAngleDeg).toBeUndefined();
  fireEvent.click(screen.getByRole('button',{name:'Redo test'}));expect(surface().animation?.bendAngleDeg?.[0].value).toBe(60);
});
test('range editing, MIDI assignment, manual takeover and clear preserve independent motion',()=>{
  render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Add Opacity modulation'}));
  fireEvent.click(screen.getByRole('checkbox',{name:'Opacity use range'}));expect(surface().modulation?.opacity?.range).toEqual({min:.75,max:1});
  fireEvent.change(screen.getByRole('combobox',{name:'Opacity source'}),{target:{value:'midi'}});field('Opacity controller','9');field('Opacity minimum','.2');
  expect(evaluateSurface(surface(),0,[],{controls:{9:.5}}).opacity).toBeCloseTo(.6);
  fireEvent.click(screen.getByRole('button',{name:'Use manual opacity control'}));expect(surface().opacity).toBe(.2);expect(surface().modulation).toBeUndefined();
  fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(surface().modulation?.opacity?.control).toBe(9);
  fireEvent.click(screen.getByRole('button',{name:'Clear Opacity modulation'}));expect(surface().modulation).toBeUndefined();
});
test('shared LFO editing changes the actual show bank without replacing the assignment',()=>{
  render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Add Opacity modulation'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Opacity source'}),{target:{value:'lfo'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Opacity LFO'}),{target:{value:'2'}});field('Opacity period','12');
  expect(state().lfos?.[2].periodS).toBe(12);expect(surface().modulation?.opacity).toMatchObject({source:'lfo',lfoIndex:2});
  fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(state().lfos).toBeUndefined();expect(surface().modulation?.opacity?.lfoIndex).toBe(2);
});
test('locked surfaces disable every editing and modulation control',()=>{
  render(<Harness locked/>);
  for(const name of ['Add keyframe','Add Opacity modulation'])expect(screen.getByRole('button',{name}).matches(':disabled')).toBe(true);
  expect(screen.getByRole('textbox',{name:'Animated value'}).matches(':disabled')).toBe(true);
});
