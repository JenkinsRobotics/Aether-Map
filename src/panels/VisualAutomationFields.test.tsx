// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import { emptyShow,type MapShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addSimpleVisual } from '../simple-visuals';
import { useDocumentHistory } from '../history';
import { VisualAutomationFields } from './VisualAutomationFields';
import { CompositionTimeline } from './CompositionTimeline';
import { sceneVisuals } from '../visual-render';
import { newShader } from '../features/shader-catalog';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
beforeEach(()=>vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}}));
const seed=()=>addSimpleVisual(normalizeDocument(emptyShow()),{mediaId:null,rect:[0,0,100,100],shader:newShader('neon-beams')},'White');
function Harness({initial=seed(),timeline=false}:{initial?:MapShow;timeline?:boolean}){
 const h=useDocumentHistory(initial),show=h.present,v=show.visuals![0];
 const change=(visual:typeof v)=>h.set(s=>normalizeDocument({...s,visuals:s.visuals?.map(p=>p.id===visual.id?visual:p)}));
 return <>{timeline?<CompositionTimeline show={show} trackID={v.trackID!} selectedID={v.trackID!} selectedClipID={v.id} timeS={2} playing={false}
   mixerOpen={false} onToggleMixer={()=>{}} onTrack={()=>{}} onEdit={u=>h.set(s=>normalizeDocument(u(s)))} onOpenAudio={()=>{}}
   onSeek={()=>{}} onTogglePlay={()=>{}} onSelectClip={()=>{}} onChangeClip={()=>{}} onRemoveClip={()=>{}} onAddCue={()=>{}} onRemoveCue={()=>{}} onDuration={()=>{}} onMode={()=>{}}/>
   :<VisualAutomationFields show={show} visual={v} onChange={change} timeS={2}/>}
   <button onClick={h.undo}>Undo test</button><button onClick={h.redo}>Redo test</button><output data-testid="show">{JSON.stringify(show)}</output></>;
}
const value=()=>JSON.parse(screen.getByTestId('show').textContent!) as MapShow;
const field=(name:string,value:string)=>{const input=screen.getByRole('textbox',{name});fireEvent.focus(input);fireEvent.change(input,{target:{value}});fireEvent.blur(input);};
test('actual keyframe controls author opacity, manual takeover and Undo preserve the same document',()=>{
 render(<Harness/>);field('Opacity keyframe time','0');field('Opacity keyframe value','0');fireEvent.click(screen.getByRole('button',{name:'Add keyframe'}));
 fireEvent.click(screen.getByRole('button',{name:'New keyframe'}));field('Opacity keyframe time','4');field('Opacity keyframe value','100');fireEvent.click(screen.getByRole('button',{name:'Add keyframe'}));
 expect(value().version).toBe(8);expect(sceneVisuals(value(),value().scenes[0],2)[0].opacity).toBe(.5);
 fireEvent.click(screen.getByRole('button',{name:'Use manual opacity control'}));expect(value().visuals![0].opacity).toBe(.5);expect(value().visuals![0].motion).toBeUndefined();
 fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(value().visuals![0].motion?.animation?.opacityPercent).toHaveLength(2);
 fireEvent.change(screen.getByRole('combobox',{name:'Automated visual parameter'}),{target:{value:'placement:xPercent'}});
 fireEvent.click(screen.getByRole('button',{name:'Add Position X modulation'}));expect(value().visuals![0].motion?.modulation?.xPercent).toMatchObject({range:{min:-100,max:200}});
 expect(value().visuals![0].motion?.animation?.opacityPercent).toHaveLength(2);
});
test('Main timeline automation shares picture/shader controls and Delete cannot remove the containing clip',()=>{
 render(<Harness timeline/>);fireEvent.click(screen.getByRole('button',{name:'Clip automation'}));
 const panel=screen.getByRole('complementary',{name:'Clip automation'});
 expect(within(panel).getByRole('option',{name:'Shader · Glow'})).toBeTruthy();
 field('Opacity keyframe value','40');fireEvent.click(within(panel).getByRole('button',{name:'Add keyframe'}));
 const key=within(panel).getByRole('button',{name:'Select Opacity keyframe at 2s'});fireEvent.keyDown(key,{key:'Delete'});
 expect(value().visuals).toHaveLength(1);expect(value().visuals![0].motion?.animation?.opacityPercent?.[0].value).toBe(40);
 fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(value().visuals![0].motion).toBeUndefined();
 fireEvent.click(screen.getByRole('button',{name:'Redo test'}));expect(value().visuals![0].motion?.animation?.opacityPercent).toHaveLength(1);
});
test('locked visuals and tracks disable automation authoring controls',()=>{
 for(const mode of ['visual','track']){const show=seed();if(mode==='visual')show.visuals![0].locked=true;else show.tracks!.find(t=>t.id===show.visuals![0].trackID)!.locked=true;
 const view=render(<Harness initial={show}/>);expect(screen.getByRole('button',{name:'Add keyframe'}).matches(':disabled')).toBe(true);expect(screen.getByRole('button',{name:'Add Opacity modulation'}).matches(':disabled')).toBe(true);view.unmount();}
});
