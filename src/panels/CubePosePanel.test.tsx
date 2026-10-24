// @vitest-environment jsdom
import {useLayoutEffect,useState} from 'react';
import {afterEach,beforeEach,expect,test} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {CubePosePanel} from './CubePosePanel';
import {applyCubeGeometry} from '../cube-pose';
import {emptyShow} from '../document';
import {cubeSurfaces} from '../features/shape-groups';
import {initialHistory,pushHistory,undoHistory,beginHistoryGesture,endHistoryGesture} from '../history';
import {installPointerEvents} from '../test-pointer';

afterEach(cleanup);beforeEach(installPointerEvents);
function setup(readOnly=false,locked=false){
 const show=emptyShow();show.scenes[0].surfaces=cubeSurfaces(show.output,0);show.scenes[0].surfaces[1].locked=locked;
 let latest=initialHistory(show);
 function Harness(){
  const [state,setState]=useState(latest);useLayoutEffect(()=>{latest=state;},[state]);
  return <><CubePosePanel show={state.present} memberID={show.scenes[0].surfaces[0].id} readOnly={readOnly}
   onChange={changes=>setState(s=>pushHistory(s,applyCubeGeometry(s.present,show.scenes[0].surfaces[0].id,changes),null,Date.now()))}
   onGestureStart={()=>setState(beginHistoryGesture)} onGestureEnd={cancel=>setState(s=>endHistoryGesture(s,cancel))}/>
   <button onClick={()=>setState(undoHistory)}>Undo</button></>;
 }
 render(<Harness/>);return {show,history:()=>latest,pad:()=>screen.getByRole('group',{name:'Drag cube pose'})};
}
test('drag changes actual three-face geometry as one history step; Escape restores the whole gesture',()=>{
 const f=setup(),pad=f.pad();
 fireEvent.pointerDown(pad,{button:0,clientX:20,clientY:20});
 fireEvent.pointerMove(pad,{clientX:36,clientY:24});fireEvent.pointerMove(pad,{clientX:44,clientY:30});fireEvent.pointerUp(pad);
 expect(f.history().past).toHaveLength(1);expect(f.history().present.scenes[0].surfaces[0].corners).not.toEqual(f.show.scenes[0].surfaces[0].corners);
 fireEvent.click(screen.getByRole('button',{name:'Undo'}));expect(f.history().present).toBe(f.show);
 fireEvent.pointerDown(pad,{button:0,clientX:20,clientY:20});fireEvent.pointerMove(pad,{clientX:44,clientY:28});
 fireEvent.keyDown(pad,{key:'Escape'});expect(f.history().present).toBe(f.show);expect(f.history().past).toHaveLength(0);
});
test('angle, keyboard and inside-out controls edit the same model and preserve invalid numeric drafts',()=>{
 const f=setup(),field=screen.getByRole('textbox',{name:'Cube X angle'});
 fireEvent.change(field,{target:{value:'12'}});fireEvent.blur(field);
 fireEvent.click(screen.getByRole('button',{name:'Apply pose angles'}));expect(f.history().past).toHaveLength(1);expect(Number((field as HTMLInputElement).value)).toBe(0);
 fireEvent.keyDown(f.pad(),{key:'ArrowLeft',shiftKey:true});expect(f.history().past).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'Turn inside out'}));expect(f.history().past).toHaveLength(3);
 fireEvent.change(field,{target:{value:'90'}});fireEvent.blur(field);fireEvent.click(screen.getByRole('button',{name:'Apply pose angles'}));
 expect(screen.getByRole('status').textContent).toMatch(/hides|folds/);expect(Number((field as HTMLInputElement).value)).toBe(90);expect(f.history().past).toHaveLength(3);
});
test.each([[true,false],[false,true]])('read-only %s or face lock %s prevents all pose controls', (readOnly,locked)=>{
 const f=setup(readOnly,locked);expect(f.pad().getAttribute('aria-disabled')).toBe('true');
 expect((screen.getByRole('button',{name:'Turn inside out'}).closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
 fireEvent.keyDown(f.pad(),{key:'ArrowLeft'});fireEvent.pointerDown(f.pad(),{button:0,clientX:20,clientY:20});fireEvent.pointerMove(f.pad(),{clientX:44,clientY:30});
 expect(f.history().present).toBe(f.show);expect(f.history().past).toHaveLength(0);
});
test('pointer cancellation also restores geometry and history',()=>{
 const f=setup();fireEvent.pointerDown(f.pad(),{button:0,clientX:0,clientY:0});fireEvent.pointerMove(f.pad(),{clientX:10,clientY:8});fireEvent.pointerCancel(f.pad());expect(f.history().present).toBe(f.show);expect(f.history().past).toHaveLength(0);
});
