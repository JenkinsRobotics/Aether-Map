import { useEffect, useRef, useState } from 'react';
import { Button, FieldRow, NumberField, SelectField } from '@aether/ui';
import { allSurfaces, withSurfaceCollection, type MapShow } from '../document';
import { resolveTreeID } from '../scene-tree';
import { type RegionOperation } from './regions';
export function RegionControls({show,selectedID,selectedIDs,onEdit,onSelect}:{show:MapShow;selectedID:string|null;selectedIDs:readonly string[];onEdit:(change:(show:MapShow)=>MapShow)=>void;onSelect:(id:string)=>void}) {
  const [busy,setBusy]=useState(false),worker=useRef<Worker|null>(null),version=useRef(show);version.current=show;
  useEffect(()=>()=>worker.current?.terminate(),[]);
  const [error,setError]=useState(''),[tolerance,setTolerance]=useState(.25);
  const roots=selectedID?(selectedIDs.includes(selectedID)?selectedIDs:[selectedID]):[];
  const ids=[...new Set(roots.flatMap(id=>{const target=resolveTreeID(show,id);return target?.kind==='folder'?(target.scene?.surfaces??show.unassignedSurfaces).filter(s=>s.folder===target.folder).map(s=>s.id):target?.kind==='surface'?[id]:[];}))];
  const surface=ids.length===1?allSurfaces(show).find(s=>s.id===ids[0]):undefined;
  const run=async(op:RegionOperation)=>{
    const snapshot=show;setBusy(true);setError('');
    try {
      const result=await new Promise<{show:MapShow;selected:string[]}>((resolve,reject)=>{
        const current=new Worker(new URL('./regions-worker.ts',import.meta.url),{type:'module'});worker.current=current;
        const timer=setTimeout(()=>{current.terminate();reject(Error('Operation timed out. Simplify the outlines or increase tolerance.'));},15000);
        const finish=()=>{clearTimeout(timer);current.terminate();worker.current=null;};
        current.onmessage=e=>{finish();e.data.error?reject(Error(e.data.error)):resolve(e.data.result);};
        current.onerror=()=>{finish();reject(Error('Could not combine these surfaces. Originals were kept.'));};
        current.postMessage({show,ids,operation:op,tolerance});
      });
      if(version.current!==snapshot)throw Error('The show changed. Run the operation again on the current surfaces.');
      onEdit(()=>result.show);if(result.selected[0])onSelect(result.selected[0]);setError(result.selected.length?'':'The result is empty. Undo restores the surfaces.');
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <section className="map-properties" aria-label="Combine vector surfaces" aria-busy={busy}><div className="map-section-label">Combine vector surfaces</div>
    <p className="map-hint">Select surfaces in Layers. The backmost surface supplies the content; Subtract cuts the others from it. Undo restores all originals.</p>
    <div className="map-feature-buttons">{(['union','difference','intersection','xor','compound'] as const).map(op=><Button key={op} disabled={busy||ids.length<2} onClick={()=>run(op)}>{({union:'Union',difference:'Subtract front',intersection:'Intersect',xor:'Exclude overlap',compound:'Make compound'})[op]}</Button>)}</div>
    <FieldRow label="Curve tolerance"><NumberField aria-label="Surface Boolean tolerance" value={tolerance} min={.01} max={10} unit="px" onCommit={setTolerance}/></FieldRow>
    <p className="map-hint">Boolean results use polygon edges at this precision. Make compound retains Bézier curves. Edit each contour with the Node tool.</p>
    {surface&&surface.masks.length>1&&<><FieldRow label="Fill rule"><SelectField aria-label="Surface fill rule" disabled={busy||surface.locked} value={surface.maskFillRule??'union'} options={[{value:'union',label:'Independent outlines'},{value:'evenodd',label:'Even-odd (holes)'},{value:'nonzero',label:'Nonzero winding'}]} onChange={e=>{const rule=e.target.value as 'union'|'evenodd'|'nonzero';onEdit(current=>withSurfaceCollection(current,surface.id,list=>list.map(s=>s.id===surface.id?{...s,maskFillRule:rule==='union'?undefined:rule}:s)));}}/></FieldRow><Button disabled={busy||surface.locked} onClick={()=>run('release')}>Release compound</Button></>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
