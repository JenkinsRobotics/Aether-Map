// @vitest-environment jsdom
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { DEFAULT_TEXT,emptyShow,type MapShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addSimpleVisual } from '../simple-visuals';
import { visualSource } from '../media-pool';
import { useDocumentHistory } from '../history';
import { VisualProperties } from './VisualProperties';
import { PerformanceView } from '../performance/PerformanceView';
import { storeVisualLook } from '../visual-looks';
import { newShader } from '../features/shader-catalog';
import { createVisualCommands } from '../visual-commands';
import { OutputSurface } from '../output';
import { sceneVisuals } from '../visual-render';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
beforeEach(()=>vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}}));
function seed(){const show=addSimpleVisual(normalizeDocument(emptyShow()),{mediaId:null,rect:[0,0,320,180],text:{...DEFAULT_TEXT,text:'Preset title',sizePx:80,color:'#ff0000'},motion:{animation:{textSizePx:[{id:'a',timeS:0,value:120,interpolation:'hold'}],'color:text:hueDeg':[{id:'c',timeS:0,value:120,interpolation:'hold'}]}}},'Title');show.visuals![0].effects=[{id:'b',kind:'blur',amount:30,enabled:true}];return show;}
function Harness({initial=seed(),simple=true,performance=false}:{initial?:MapShow;simple?:boolean;performance?:boolean}){
 const h=useDocumentHistory(initial),show=h.present,v=show.visuals![0];const commands=createVisualCommands({show,edit:(update,key)=>h.set(s=>normalizeDocument(update(s)),key),select:()=>{}});const change=(visual:typeof v,key?:string|null)=>commands.change(visual.id,visual,key);
 return <>{performance?<PerformanceView show={show} urls={{}} selectedID={v.id} timeS={2} playing={false} onSelect={()=>{}} onScene={()=>{}} onChange={change} onPlay={()=>{}} onSeek={()=>{}} onClose={()=>{}} onPickMedia={vi.fn()} onUndo={h.undo} onRedo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo} onGestureStart={h.beginGesture} onGestureEnd={h.endGesture}/>:<VisualProperties show={show} visual={v} onChange={change} onPickMedia={vi.fn()} onDuplicate={vi.fn()} onMove={vi.fn()} simple={simple}/>}
 {/* Effects are the right sidebar's own tab. */}{!performance&&<VisualProperties only="effects" show={show} visual={v} onChange={change} onPickMedia={vi.fn()} onDuplicate={vi.fn()} onMove={vi.fn()}/>}
 <button onClick={h.undo}>Undo test</button><button onClick={h.redo}>Redo test</button><output data-testid="show">{JSON.stringify(show)}</output></>;
}
const value=()=>JSON.parse(screen.getByTestId('show').textContent!) as MapShow;
const field=(name:string,value:string)=>{const input=screen.getByRole('textbox',{name});fireEvent.focus(input);fireEvent.change(input,{target:{value}});fireEvent.blur(input);};
test.each([true,false])('Simple=%s stores and recalls text/effects/motion as one undoable operation',simple=>{
 render(<Harness simple={simple}/>);fireEvent.click(screen.getByRole('button',{name:'Store preset A'}));expect(value().version).toBe(11);const look=structuredClone(value().visuals![0].looks!.A!);
 field('Size','40');expect(visualSource(value(),value().visuals![0]).motion!.animation!.textSizePx).toBeUndefined();
 fireEvent.click(screen.getByRole('button',{name:'Remove effect'}));
 fireEvent.click(screen.getByRole('button',{name:'Recall preset A'}));expect(visualSource(value(),value().visuals![0])).toEqual(look.source);expect(value().visuals![0].effects).toEqual(look.effects);
 const restored=value();fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(visualSource(value(),value().visuals![0]).text!.sizePx).toBe(40);expect(value().visuals![0].effects).toEqual([]);
 fireEvent.click(screen.getByRole('button',{name:'Redo test'}));expect(value()).toEqual(restored);
 cleanup();const view=render(<OutputSurface show={restored} surface={sceneVisuals(restored,restored.scenes[0],2)[0]} base="/media/" timeS={2} playing={false}/>);const text=view.container.querySelector('.map-text') as HTMLElement;expect(text.style.fontSize).toBe('120px');expect(text.style.color).toBe('rgb(0, 255, 0)');
});
test('reusing another visual preset and clearing slots works through actual menus',()=>{
 let show=seed();show.visuals![0]=storeVisualLook(show,show.visuals![0],'A');show=addSimpleVisual(show,{mediaId:null,rect:[0,0,320,180],fill:'#0000ff'},'Blue');show.visuals![1]=storeVisualLook(show,show.visuals![1],'B');
 render(<Harness initial={show}/>);fireEvent.click(screen.getByRole('button',{name:'Use another visual’s preset'}));fireEvent.click(screen.getByRole('menuitem',{name:'Blue · B'}));expect(visualSource(value(),value().visuals![0]).fill).toBe('#0000ff');expect(value().visuals![0].looks!.A!.source.text!.text).toBe('Preset title');
 fireEvent.click(screen.getByRole('button',{name:'Clear a visual preset'}));fireEvent.click(screen.getByRole('menuitem',{name:'Clear preset A'}));expect(screen.getByRole('button',{name:'Recall preset A'}).matches(':disabled')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(screen.getByRole('button',{name:'Recall preset A'}).matches(':disabled')).toBe(false);
});
test('Performance applies complete presets once and Undo restores source controls',()=>{
 render(<Harness performance/>);expect(screen.getAllByRole('button',{name:'Store preset A'})).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'Store preset A'}));const saved=structuredClone(value().visuals![0].looks!.A!);
 fireEvent.click(screen.getByRole('button',{name:'Random'}));const randomized=visualSource(value(),value().visuals![0]);expect(randomized.text!.color).not.toBe(saved.source.text!.color);
 fireEvent.click(screen.getByRole('button',{name:'Recall preset A'}));expect(visualSource(value(),value().visuals![0])).toEqual(saved.source);
 fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(visualSource(value(),value().visuals![0])).toEqual(randomized);
});
test.each([true,false])('Simple=%s shows a single preset bank for shaders and disables it when locked',simple=>{
 const show=addSimpleVisual(normalizeDocument(emptyShow()),{mediaId:null,rect:[0,0,320,180],shader:newShader('tunnel')},'Tunnel');show.visuals![0].locked=true;render(<Harness initial={show} simple={simple}/>);
 expect(screen.getAllByRole('button',{name:'Store preset A'})).toHaveLength(1);expect(screen.getByRole('button',{name:'Store preset A'}).matches(':disabled')).toBe(true);expect(screen.getByRole('button',{name:'Random'}).matches(':disabled')).toBe(true);
});
test('an unavailable preset image reports an error without replacing the current visual',()=>{
 const show=seed();show.visuals![0].looks={A:{source:{mediaId:'missing',rect:[0,0,320,180]},opacity:1,mapping:'repeat'}};render(<Harness initial={show}/>);
 const before=visualSource(value(),value().visuals![0]);fireEvent.click(screen.getByRole('button',{name:'Recall preset A'}));expect(screen.getByText(/This preset’s media is unavailable/)).toBeTruthy();expect(visualSource(value(),value().visuals![0])).toEqual(before);
});
