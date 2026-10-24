import { setVisualMotionBase } from '../visual-motion';
import { DEFAULT_PLACEMENT } from '../visual-placement';
import { useVisualMotionInputs } from '../live/use-visual-motion-inputs';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AetherIcon, Button, IconButton, NumberField, SelectField, useContextCommands } from '@aether/ui';
import type { MapShow, Point, Rect, Surface } from '../document';
import { quadCorners } from '../document';
import type { Visual } from '../visual-model';
import { OutputSurface } from '../output';
import { surfaceComposition } from '../surface-composition';
import { project, solveHomography, type Homography } from '../homography';
import { placementCorners, contentPlacementCorners, readVisualPlacement, resizeContentPlacement, snapContentPlacement, visualPlacementFrame, type VisualPlacement } from '../visual-placement';
import { scheduledVisuals } from '../timelines';
import { contentBounds, measureTextBounds, clearTextMeasurements } from '../content-bounds';
import { PreviewQuality } from '../features/PreviewQuality';
import './SurfaceComposition.css';

interface Drag { bounds:Rect; targets:Point[][]; start:VisualPlacement; point:Point; frame:Rect; inverse:Homography; visual:Visual; kind:'move'|'rotate'|number }
export function SurfaceComposition({show,surface,timeS,playing,urls,selectedID,onSelect,onChange,onSurfaceChange,onGestureStart,onGestureEnd}:{
  show:MapShow;surface:Surface;timeS:number;playing:boolean;urls:Record<string,string>;selectedID:string|null;
  onSurfaceChange:(patch:Partial<Surface>)=>void;onSelect:(id:string)=>void;onChange:(visual:Visual)=>void;onGestureStart:()=>void;onGestureEnd:(cancel:boolean)=>void;
}) {
  const motionInputs=useVisualMotionInputs();
  const host=useRef<HTMLDivElement>(null), overlay=useRef<SVGSVGElement>(null), drag=useRef<Drag|null>(null);
  const endRef=useRef(onGestureEnd);
  useLayoutEffect(()=>{endRef.current=onGestureEnd;},[onGestureEnd]);
  const [normalized,setNormalized]=useState(true);
  const [snap,setSnap]=useState(true),[guides,setGuides]=useState<{axis:0|1;value:number}[]>([]);
  const [,refreshFonts]=useState(0);
  useEffect(()=>{const refresh=()=>{clearTextMeasurements();refreshFonts(n=>n+1);};document.fonts?.addEventListener('loadingdone',refresh);return()=>document.fonts?.removeEventListener('loadingdone',refresh);},[]);
  const [size,setSize]=useState({width:1,height:1}), [zoom,setZoom]=useState(1);
  useEffect(()=>{ const node=host.current;if(!node)return;const observer=new ResizeObserver(()=>setSize({width:node.clientWidth,height:node.clientHeight}));observer.observe(node);return()=>observer.disconnect();},[surface.corners]);
  useEffect(()=>()=>{if(drag.current)endRef.current(true);},[]);
  useContextCommands([{id:'surface-fit',label:'Fit surface',heading:'Surface view',separatorBefore:true,run:()=>setZoom(1)},
    {id:'surface-zoom-in',label:'Zoom in',run:()=>setZoom(z=>Math.min(4,z*1.25))},{id:'surface-zoom-out',label:'Zoom out',run:()=>setZoom(z=>Math.max(.25,z/1.25))}],host);
  let composition:ReturnType<typeof surfaceComposition>;
  try {composition=surfaceComposition(show,surface,timeS,normalized,motionInputs);} catch {return <p className="map-hint">This surface has collapsed corners. Adjust its geometry in Mapping.</p>;}
  const {frame,pictures}=composition, [, ,w,h]=frame;
  const scale=Math.max(.001,Math.min((size.width-80)/w,(size.height-80)/h))*zoom;
  const items=scheduledVisuals(show,timeS,undefined,motionInputs).flatMap(({visual:use})=>{
    const visual=show.visuals?.find(v=>v.id===use.id.split('/').at(-1));
    if(!visual||visual.timelineRefID||visual.mask)return [];
    const picture=pictures.find(p=>p.id===`${use.id}:${surface.id}`);
    if(!picture)return [];
    const local=picture.contentFrame ?? (visual.mapping==='span' ? visualPlacementFrame(show,visual) : surface.source.rect), matrix=solveHomography(quadCorners(local),picture.corners);
    const displayPlacement=readVisualPlacement(picture.visualPlacement ?? visual.placement);
    const bounds=contentBounds(picture.source,local,measureTextBounds(picture.source),picture.visualPlacement?placementCorners(displayPlacement,local):picture.corners);
    const localPoints=contentPlacementCorners(displayPlacement,local,bounds);
    return [{visual,displayPlacement,key:picture.id,local,bounds,matrix,localPoints,points:localPoints.map(p=>project(matrix,p)),locked:visual.locked||show.tracks?.find(t=>t.id===visual.trackID)?.locked}];
  });
  const selected=items.find(i=>i.visual.id===selectedID);
  const point=(event:React.PointerEvent):Point=>{const b=overlay.current!.getBoundingClientRect();return [(event.clientX-b.left)/b.width*w,(event.clientY-b.top)/b.height*h];};
  const begin=(event:React.PointerEvent,item:typeof items[number],kind:Drag['kind'])=>{
    if(event.button!==0)return;event.stopPropagation();onSelect(item.visual.id);if(item.locked)return;
    event.preventDefault();overlay.current!.focus();const inverse=solveHomography(pictures.find(p=>p.id===item.key)!.corners,quadCorners(item.local));
    drag.current={bounds:item.bounds,targets:items.filter(i=>i.key!==item.key).map(i=>i.points.map(p=>project(inverse,p))),start:item.displayPlacement,point:project(inverse,point(event)),frame:item.local,inverse,visual:item.visual,kind};
    onGestureStart();overlay.current!.setPointerCapture(event.pointerId);
  };
  const finish=(cancel:boolean)=>{if(!drag.current)return;drag.current=null;setGuides([]);onGestureEnd(cancel);};
  const fileUrls=Object.fromEntries(show.media.map(m=>[m.file,urls[m.id]]));
  return <div className="map-surface-composition" aria-label={`${surface.name} composition`}>
    <div className="map-surface-composition-tools"><span>{selected?.visual.name??'Select an asset'}</span>
      <SelectField aria-label="Surface view proportions" value={surface.compositionAspectRatio===undefined?'auto':[1,4/3,16/9,9/16].includes(surface.compositionAspectRatio)?String(surface.compositionAspectRatio):'custom'} options={[{value:'auto',label:surface.groupShape==='cube'?'Cube · square':'Source ratio'},{value:'1',label:'1:1'},{value:String(4/3),label:'4:3'},{value:String(16/9),label:'16:9'},{value:String(9/16),label:'9:16'},{value:'custom',label:'Custom'}]} onChange={e=>onSurfaceChange({compositionAspectRatio:e.target.value==='auto'?undefined:e.target.value==='custom'?w/h:Number(e.target.value)})}/>
      {surface.compositionAspectRatio!==undefined&&<NumberField aria-label="Surface view aspect ratio" value={surface.compositionAspectRatio} min={.05} max={20} step={.1} precision={3} onValueChange={v=>v!==null&&onSurfaceChange({compositionAspectRatio:v})}/>}

    </div>
    <div ref={host} className="map-surface-composition-viewport">
      <div className="map-surface-composition-stage" style={{width:Math.max(size.width,w*scale+80),height:Math.max(size.height,h*scale+80)}}>
        <div className="map-surface-composition-frame" style={{width:w*scale,height:h*scale}}><div className="map-surface-composition-board" style={{width:w,height:h,zoom:scale}}>
          {pictures.map(p=><PreviewQuality.Provider key={p.id} value={{scale:scale*Math.max(w/p.source.rect[2],h/p.source.rect[3]),maxPixelCount:4096*2160}}><OutputSurface surface={p} show={show} base="" urls={fileUrls} timeS={timeS} playing={playing}/></PreviewQuality.Provider>)}
          <svg ref={overlay} width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="map-placement-overlay" aria-label="Asset placement canvas" tabIndex={0}
            onKeyDown={event=>{if(event.key==='Escape'){finish(true);return;}if(!selected||selected.locked)return;
              const deltas:Record<string,Point>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}, delta=deltas[event.key];if(!delta)return;
              event.preventDefault();event.stopPropagation();const p=selected.displayPlacement,step=event.shiftKey?10:1;
              onChange(setVisualMotionBase(selected.visual,delta[0]?{xPercent:p.xPercent+delta[0]*step/selected.local[2]*100}:{yPercent:p.yPercent+delta[1]*step/selected.local[3]*100},true));
            }}
            onPointerMove={event=>{const d=drag.current;if(!d)return;const p=project(d.inverse,point(event));let placement=d.start;
              if(typeof d.kind==='number')placement=resizeContentPlacement(d.start,d.kind,p,d.frame,d.bounds);
              else if(d.kind==='move')placement=readVisualPlacement({...d.start,xPercent:d.start.xPercent+(p[0]-d.point[0])/d.frame[2]*100,yPercent:d.start.yPercent+(p[1]-d.point[1])/d.frame[3]*100});
              else {const cx=d.frame[0]+d.frame[2]*d.start.xPercent/100,cy=d.frame[1]+d.frame[3]*d.start.yPercent/100;
                placement={...d.start,rotationDeg:d.start.rotationDeg+(Math.atan2(p[1]-cy,p[0]-cx)-Math.atan2(d.point[1]-cy,d.point[0]-cx))*180/Math.PI};}
              if(d.kind==='move'&&snap&&!event.altKey){const result=snapContentPlacement(placement,d.frame,d.bounds,d.targets,[6/scale*d.frame[2]/w,6/scale*d.frame[3]/h]);placement=result.placement;setGuides(result.guides);}else setGuides([]);
              const changed=d.kind==='rotate'?{rotationDeg:placement.rotationDeg}:d.kind==='move'?{xPercent:placement.xPercent,yPercent:placement.yPercent}:{xPercent:placement.xPercent,yPercent:placement.yPercent,widthPercent:placement.widthPercent,heightPercent:placement.heightPercent};
              onChange(setVisualMotionBase(d.visual,changed,true));
            }} onPointerUp={()=>finish(false)} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish(false)}>
            {items.map(item=><polygon key={item.key} points={item.points.map(p=>p.join(',')).join(' ')} className="map-placement-hit" aria-label={`Position ${item.visual.name}`} onPointerDown={event=>begin(event,item,'move')}/>)}
            {selected&&guides.map(g=>{const start=project(selected.matrix,g.axis===0?[g.value,selected.local[1]]:[selected.local[0],g.value]),end=project(selected.matrix,g.axis===0?[g.value,selected.local[1]+selected.local[3]]:[selected.local[0]+selected.local[2],g.value]);return <line className="map-placement-guide" key={g.axis} x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} strokeWidth={1/scale}/>;})}
            {selected&&<g className="map-placement-handles">
              <polygon points={selected.points.map(p=>p.join(',')).join(' ')} fill="none" strokeWidth={1.5/scale}/>
              {!selected.locked&&selected.points.map((p,i)=><rect key={i} data-placement-corner={i} aria-label={`Resize asset corner ${i+1}`} x={p[0]-4/scale} y={p[1]-4/scale} width={8/scale} height={8/scale} strokeWidth={1/scale} onPointerDown={event=>begin(event,selected,i)}/>)}
              {!selected.locked&&(()=>{const p=selected.displayPlacement,local=selected.local,corners=contentPlacementCorners(p,local,selected.bounds),r=p.rotationDeg*Math.PI/180,rotate=project(selected.matrix,[(corners[0][0]+corners[1][0])/2+Math.sin(r)*24/scale,(corners[0][1]+corners[1][1])/2-Math.cos(r)*24/scale]);return <circle aria-label="Rotate asset" cx={rotate[0]} cy={rotate[1]} r={5/scale} strokeWidth={1/scale} onPointerDown={event=>begin(event,selected,'rotate')}/>;})()}
            </g>}
          </svg>
        </div></div>
      </div>
    </div>
    <div className="map-surface-view-hud" role="toolbar" aria-label="Surface preview controls">
      <Button primary={normalized} aria-pressed={normalized} onClick={()=>setNormalized(true)}>Normalized</Button><Button primary={!normalized} aria-pressed={!normalized} onClick={()=>setNormalized(false)}>Raw</Button>
      <IconButton appearance="plain" label="Snap assets" aria-pressed={snap} onClick={()=>setSnap(v=>!v)}><AetherIcon name="timeline-snap"/></IconButton>
      <IconButton appearance="plain" label="Zoom out of surface" onClick={()=>setZoom(z=>Math.max(.25,z/1.25))}><AetherIcon name="zoom-out"/></IconButton>
      <IconButton appearance="plain" label="Zoom into surface" onClick={()=>setZoom(z=>Math.min(4,z*1.25))}><AetherIcon name="zoom-in"/></IconButton>
      <IconButton appearance="plain" label="Fit surface" onClick={()=>setZoom(1)}><AetherIcon name="fit"/></IconButton>
      <IconButton appearance="plain" label="Reset asset placement" disabled={!selected||selected.locked} onClick={()=>selected&&onChange(setVisualMotionBase(selected.visual,DEFAULT_PLACEMENT,true))}><AetherIcon name="undo"/></IconButton>
    </div>
  </div>;
}
