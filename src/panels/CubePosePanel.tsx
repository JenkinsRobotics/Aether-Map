import { useEffect,useLayoutEffect,useRef,useState } from 'react';
import { AetherIcon,Button,FieldRow,InspectorSection,NumberField } from '@aether/ui';
import { surfaceCollection,type MapShow,type Surface } from '../document';
import { boundsOf } from '../layer-transform';
import { animateSurface } from '../features/animation';
import { applyCubeGeometry,cubeFaces,cubePoseGeometry,type CubePoseDelta } from '../cube-pose';
import type { GroupGeometryChange } from '../group-interaction';
import './CubePosePanel.css';

interface Drag { x:number;y:number;members:Surface[] }
export function CubePosePanel({show,memberID,readOnly=false,onChange,onGestureStart,onGestureEnd}:{
 show:MapShow;memberID:string;readOnly?:boolean;onChange:(changes:GroupGeometryChange[])=>void;
 onGestureStart:()=>void;onGestureEnd:(cancel:boolean)=>void;
}){
 const collection=surfaceCollection(show,memberID),list=collection?.scene?.surfaces??show.unassignedSurfaces;
 const member=list.find(s=>s.id===memberID),members=list.filter(s=>s.folder&&s.folder===member?.folder),faces=cubeFaces(members);
 const [delta,setDelta]=useState<CubePoseDelta>({}),[notice,setNotice]=useState('');
 const drag=useRef<Drag|null>(null),end=useRef(onGestureEnd);
 useLayoutEffect(()=>{end.current=onGestureEnd;},[onGestureEnd]);
 useEffect(()=>()=>{if(drag.current)end.current(true);},[]);
 if(!faces)return <p className="map-hint">Cube pose needs all three joined cube faces. Rejoin separated corner pins to adjust the pose.</p>;
 const locked=readOnly||faces.some(s=>s.locked),visible=faces.map(s=>animateSurface(s,0));
 const bounds=boundsOf(visible.flatMap(s=>s.corners)),pad=Math.max(bounds.width,bounds.height)*.12;
 const apply=(pose:CubePoseDelta,base:readonly Surface[]=faces)=>{
  if(locked)return false;
  try{const changes=cubePoseGeometry(base,pose);applyCubeGeometry(show,memberID,changes);onChange(changes);setNotice('');return true;}
  catch(error){setNotice((error as Error).message);return false;}
 };
 const finish=(cancel:boolean)=>{if(!drag.current)return;drag.current=null;onGestureEnd(cancel);if(cancel)setNotice('Pose cancelled.');};
 return <section className="map-properties map-cube-pose" aria-label="Cube pose">
  <h3>{member?.folder}</h3>
  <InspectorSection title="Cube & room corner">
   <p className="map-hint">Drag to turn and tilt the three faces together. Use corner pins afterward to refine the fit.</p>
   <svg className="map-cube-pose-pad" role="group" aria-label="Drag cube pose" aria-disabled={locked} tabIndex={locked?-1:0}
    viewBox={`${bounds.x-pad} ${bounds.y-pad} ${bounds.width+2*pad} ${bounds.height+2*pad}`}
    onPointerDown={e=>{if(e.button!==0||locked)return;e.preventDefault();e.currentTarget.focus();drag.current={x:e.clientX,y:e.clientY,members:structuredClone(faces)};onGestureStart();e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{const d=drag.current;if(!d)return;const step=e.shiftKey ? .06 : .25;apply({zDegrees:Math.max(-45,Math.min(45,(e.clientX-d.x)*step)),xDegrees:Math.max(-45,Math.min(45,(e.clientY-d.y)*step))},d.members);}}
    onPointerUp={()=>finish(false)} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish(false)}
    onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(true);return;}if(locked)return;const step=e.shiftKey ? .5 : 3;
     const keys:Record<string,CubePoseDelta>={ArrowLeft:{zDegrees:-step},ArrowRight:{zDegrees:step},ArrowUp:{xDegrees:-step},ArrowDown:{xDegrees:step}};
     if(keys[e.key]){e.preventDefault();e.stopPropagation();apply(keys[e.key]);}}}>
    {visible.map(s=><polygon key={s.id} points={s.corners.map(p=>p.join(',')).join(' ')} fill={s.color} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke"/>)}
   </svg>
   <p className="map-hint">Arrow keys adjust the pose. Hold Shift for fine control; Escape cancels a drag.</p>
   <fieldset disabled={locked}>
    <Button onClick={()=>apply({insideOut:true})}><AetherIcon name="flip-horizontal"/>Turn inside out</Button>
    <p className="map-hint">Switch between an outside box and the three opposite faces of a room corner. Your face assignments stay attached.</p>
    {(['x','y','z'] as const).map(axis=>{const key=`${axis}Degrees` as const;return <FieldRow key={axis} label={`${axis==='z'?'Turn':'Tilt'} ${axis.toUpperCase()}`}>
     <NumberField aria-label={`Cube ${axis.toUpperCase()} angle`} value={delta[key]??0} min={-180} max={180} step={1} precision={1} unit="°" onValueChange={value=>value!==null&&setDelta(d=>({...d,[key]:value}))}/>
    </FieldRow>;})}
    <Button disabled={!Object.values(delta).some(Boolean)} onClick={()=>{if(apply(delta))setDelta({});}}>Apply pose angles</Button>
    <p className="map-hint">Angles are relative to the current pose. Use the regular mapping handles to move, size or rotate the whole outline.</p>
   </fieldset>
   {notice&&<p className="map-cube-pose-notice" role="status">{notice}</p>}
  </InspectorSection>
 </section>;
}
