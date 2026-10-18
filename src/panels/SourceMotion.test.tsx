// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import { DEFAULT_TEXT,emptyShow,type MapShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addSimpleVisual } from '../simple-visuals';
import { visualSource } from '../media-pool';
import { useDocumentHistory } from '../history';
import { VisualProperties } from './VisualProperties';
import { PerformanceView } from '../performance/PerformanceView';
import { sceneVisuals } from '../visual-render';
import { OutputSurface } from '../output';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
beforeEach(()=>vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}}));
const seed=()=>addSimpleVisual(normalizeDocument(emptyShow()),{mediaId:null,rect:[0,0,320,180],text:{...DEFAULT_TEXT,text:'Live title'}},'Title');
function Harness({initial=seed(),performance=false,simple=true}:{initial?:MapShow;performance?:boolean;simple?:boolean}){
 const h=useDocumentHistory(initial),show=h.present,v=show.visuals![0];
 const change=(visual:typeof v)=>h.set(s=>normalizeDocument({...s,visuals:s.visuals?.map(p=>p.id===visual.id?visual:p)}));
 return <>{performance?<PerformanceView show={show} urls={{}} selectedID={v.id} timeS={2} playing={false} onSelect={()=>{}} onScene={()=>{}} onChange={change} onPlay={()=>{}} onSeek={()=>{}} onClose={()=>{}} onPickMedia={()=>{}} onUndo={h.undo} onRedo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo} onGestureStart={h.beginGesture} onGestureEnd={h.endGesture}/>
 :<VisualProperties show={show} visual={v} onChange={change} onPickMedia={vi.fn()} onDuplicate={vi.fn()} onMove={vi.fn()} simple={simple}/>}
 <button onClick={h.undo}>Undo test</button><output data-testid="show">{JSON.stringify(show)}</output></>;
}
const value=()=>JSON.parse(screen.getByTestId('show').textContent!) as MapShow;
const field=(name:string,value:string)=>{const input=screen.getByRole('textbox',{name});fireEvent.focus(input);fireEvent.change(input,{target:{value}});fireEvent.blur(input);};
test('ordinary text controls take over source keys and Undo restores them in Simple properties',()=>{
 render(<Harness/>);fireEvent.click(screen.getByText('Source motion'));field('Text size keyframe time','0');field('Text size keyframe value','120');
 const section=screen.getByText('Source motion').closest('details')!;fireEvent.click(within(section).getByRole('button',{name:'Add keyframe'}));
 expect(value().version).toBe(9);expect(visualSource(value(),value().visuals![0]).motion!.animation!.textSizePx![0].value).toBe(120);
 field('Size','60');expect(visualSource(value(),value().visuals![0]).text!.sizePx).toBe(60);expect(visualSource(value(),value().visuals![0]).motion).toBeUndefined();
 fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(visualSource(value(),value().visuals![0]).motion!.animation!.textSizePx).toHaveLength(1);
});
test('Performance Source tab exposes evaluated source faders, manual takeover and Undo',()=>{
 const show=seed();show.visuals![0].source={...visualSource(show,show.visuals![0]),motion:{animation:{textSizePx:[{id:'a',timeS:0,value:20,interpolation:'linear'},{id:'b',timeS:4,value:100,interpolation:'linear'}]}}};
 render(<Harness initial={show} performance/>);fireEvent.click(screen.getByRole('tab',{name:'Source'}));
 const card=screen.getByRole('region',{name:'Text size control'}),slider=within(card).getByRole('slider');expect((slider as HTMLInputElement).value).toBe('60');expect(slider.matches(':disabled')).toBe(true);
 fireEvent.click(within(card).getByRole('button',{name:'Use manual control'}));expect(visualSource(value(),value().visuals![0]).text!.sizePx).toBe(60);
 fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(visualSource(value(),value().visuals![0]).motion!.animation!.textSizePx).toHaveLength(2);
 fireEvent.click(within(card).getByRole('button',{name:'Text size motion'}));fireEvent.click(screen.getByRole('button',{name:'Add modulation'}));expect(visualSource(value(),value().visuals![0]).motion!.modulation!.textSizePx).toBeTruthy();
});
test('actual output DOM uses evaluated text typography and imported media stays visible',()=>{
 const show=seed();show.visuals![0].source={...visualSource(show,show.visuals![0]),motion:{animation:{textSizePx:[{id:'a',timeS:0,value:20,interpolation:'linear'},{id:'b',timeS:4,value:100,interpolation:'linear'}]}}};
 const view=render(<OutputSurface show={show} surface={sceneVisuals(show,show.scenes[0],2)[0]} base="/media/" timeS={2} playing={false}/>);
 expect((view.container.querySelector('.map-text') as HTMLElement).style.fontSize).toBe('60px');
 show.media=[{id:'image',file:'image.png',name:'Image',kind:'image',width:320,height:180,bytes:10}];show.visuals![0].source={mediaId:'image',rect:[0,0,320,180],motion:{animation:{cropLeftPx:[{id:'a',timeS:0,value:100,interpolation:'linear'}]}}};
 view.rerender(<OutputSurface show={show} surface={sceneVisuals(show,show.scenes[0],2)[0]} base="/media/" timeS={2} playing={false}/>);
 expect(view.container.querySelector('img')?.getAttribute('src')).toBe('/media/image.png');expect(view.container.querySelector('.map-fill')).toBeNull();expect(view.container.querySelector('img')?.style.clipPath).toContain('100px');
});
test.each([true,false])('Simple=%s edits named held choices, normal control takeover and Undo',simple=>{
 render(<Harness simple={simple}/>);fireEvent.click(screen.getByText('Source motion'));const section=screen.getByText('Source motion').closest('details')!;
 fireEvent.change(within(section).getByRole('combobox',{name:'Automated visual parameter'}),{target:{value:'source:choice:textAlign'}});
 const choice=within(section).getByRole('combobox',{name:'Text alignment keyframe value'});fireEvent.change(choice,{target:{value:'2'}});
 expect(within(section).getByRole('combobox',{name:'Text alignment keyframe curve'}).querySelectorAll('option')).toHaveLength(1);
 fireEvent.click(within(section).getByRole('button',{name:'Add keyframe'}));expect(value().version).toBe(10);
 expect(visualSource(value(),value().visuals![0]).motion!.animation!['choice:textAlign']![0]).toMatchObject({value:2,interpolation:'hold'});
 fireEvent.change(screen.getByRole('combobox',{name:'Text alignment'}),{target:{value:'left'}});
 expect(visualSource(value(),value().visuals![0]).text!.align).toBe('left');expect(visualSource(value(),value().visuals![0]).motion).toBeUndefined();
 fireEvent.click(screen.getByRole('button',{name:'Undo test'}));expect(visualSource(value(),value().visuals![0]).motion!.animation!['choice:textAlign']).toHaveLength(1);
});
test('color animation is visible in actual output text and Performance offers named choices',()=>{
 const show=seed();show.visuals![0].source={...visualSource(show,show.visuals![0]),text:{...DEFAULT_TEXT,text:'Colored title',color:'#ff0000'},motion:{animation:{'color:text:hueDeg':[{id:'a',timeS:0,value:0,interpolation:'linear'},{id:'b',timeS:4,value:240,interpolation:'linear'}],'choice:textAlign':[{id:'a',timeS:0,value:2,interpolation:'hold'}]}}};
 const view=render(<OutputSurface show={show} surface={sceneVisuals(show,show.scenes[0],2)[0]} base="/media/" timeS={2} playing={false}/>);
 const text=view.container.querySelector('.map-text') as HTMLElement;expect(text.style.color).toBe('rgb(0, 255, 0)');expect(text.style.textAlign).toBe('right');view.unmount();
 render(<Harness initial={show} performance/>);fireEvent.click(screen.getByRole('tab',{name:'Source'}));
 const card=screen.getByRole('region',{name:'Text alignment control'}),select=within(card).getByRole('combobox',{name:'Text alignment value'});expect((select as HTMLSelectElement).value).toBe('2');expect(select.matches(':disabled')).toBe(true);expect(within(select).getByRole('option',{name:'Right'})).toBeTruthy();
 fireEvent.click(within(card).getByRole('button',{name:'Use manual control'}));expect(visualSource(value(),value().visuals![0]).text!.align).toBe('right');expect(visualSource(value(),value().visuals![0]).motion!.animation!['color:text:hueDeg']).toHaveLength(2);
});
