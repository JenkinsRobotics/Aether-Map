import { Fragment,useMemo,useRef,useState } from 'react';
import type { MapShow } from '../document';
import type { Visual } from '../visual-model';
import type { FeatureKeyframe } from '../features/types';
import { performanceParameters,type PerformanceParameter } from '../performance/parameters';
import { visualIsLocked } from '../simple-visuals';
import { automationBounds,automationClock,automationCurve,automationMarks,automationTime,editAutomationKey,removeAutomationKey } from '../timeline-automation';
import './TimelineAutomationRows.css';

export interface AutomationRowsProps {
 show:MapShow;clips:Visual[];durationS:number;pxPerS:number;labelWidth:number;snapping:boolean;
 onSelect:(visual:Visual,parameterID:string,timeS?:number)=>void;
 onEdit:(update:(show:MapShow)=>MapShow)=>void;
}
export function TimelineAutomationRows({clips,...props}:AutomationRowsProps){
 return <>{clips.filter(v=>!v.mask).map(v=><VisualRows key={v.id} {...props} visual={v}/>)}</>;
}
function VisualRows(props:Omit<AutomationRowsProps,'clips'>&{visual:Visual}){
 const parameters=useMemo(()=>performanceParameters(props.show,props.visual,0).filter(p=>p.keys?.length||p.modulation),[props.show,props.visual]);
 return <>{parameters.map(parameter=><AutomationRow key={parameter.id} {...props} parameter={parameter}/>)}</>;
}
interface Drag {key:FeatureKeyframe;timeS:number;value:number;changed:boolean;visual:Visual}
function AutomationRow({show,visual,parameter,durationS,pxPerS,labelWidth,snapping,onSelect,onEdit}:Omit<AutomationRowsProps,'clips'>&{visual:Visual;parameter:PerformanceParameter}){
 const [draft,setDraft]=useState<Drag|null>(null),locked=visualIsLocked(show,visual);
 const suppressClick=useRef(false);
 const {segments,dense:clockDense}=useMemo(()=>automationClock(show,visual,parameter,durationS),[show,visual,parameter,durationS]);
 const dense=clockDense||segments.length*((parameter.keys?.length??0)+24)>65536;
 const marks=useMemo(()=>dense?[]:automationMarks(show,visual,parameter,segments),[show,visual,parameter,segments,dense]);
 const paths=useMemo(()=>dense?[]:automationCurve(parameter,segments),[parameter,segments,dense]);
 const low=Math.min(parameter.min,parameter.base,...(parameter.keys??[]).map(k=>k.value)),high=Math.max(low+.001,parameter.max,parameter.base,...(parameter.keys??[]).map(k=>k.value));
 const y=(value:number)=>48-(value-low)/(high-low)*40;
 const bounds=automationBounds(visual,durationS),title=`${visual.name} · ${parameter.label}`,width=Math.max(1,durationS*pxPerS);
 const change=(operation:(s:MapShow,v:Visual)=>Visual,expected?:Visual)=>onEdit(s=>{
  const v=s.visuals?.find(v=>v.id===visual.id);if(!v||expected&&v!==expected)return s;
  const next=operation(s,v);return next===v?s:{...s,visuals:s.visuals?.map(p=>p.id===v.id?next:p)};
 });
 const point=(event:React.MouseEvent|React.PointerEvent)=>{
  const box=event.currentTarget.getBoundingClientRect();let time=(event.clientX-box.left)/pxPerS;if(snapping&&!event.altKey)time=Math.round(time*10)/10;
  const value=Math.max(low,Math.min(high,low+(48-(event.clientY-box.top))/(40)*(high-low)));
  return {timeS:Math.max(bounds.startS,Math.min(bounds.endS,time)),value:parameter.options?Math.round(value):Math.round(value/parameter.step)*parameter.step};
 };
 const editableAt=(timeS:number)=>{const t=automationTime(show,visual,parameter,timeS);return !locked&&t>=0&&t<=604800;};
 return <Fragment>
  <button type="button" className="map-track-head map-automation-label" aria-label={`Edit ${title} automation`} style={{width:labelWidth}} onClick={()=>onSelect(visual,parameter.id)} title={`${title}. Edit source-time keys and modulation.`}>
   <span>{visual.name}<small>{parameter.group} · {parameter.label}{parameter.modulation?' · modulated':''}{locked?' · locked':''}</small></span>
  </button>
  <div className="map-lane map-automation-lane" role="group" aria-label={`${title} timeline automation`}
   onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setDraft(null);}}}
   onPointerMove={event=>{if(!draft)return;const p=point(event);setDraft({...draft,...p,changed:true});}}
   onPointerUp={()=>{if(draft){suppressClick.current=true;if(draft.changed&&editableAt(draft.timeS))change((s,v)=>editAutomationKey(s,v,parameter.id,draft.timeS,draft.value,draft.key.id),draft.visual);onSelect(visual,parameter.id,draft.timeS);}setDraft(null);}}
   onPointerCancel={()=>{suppressClick.current=true;setDraft(null);}} onLostPointerCapture={()=>setDraft(null)}
   onDoubleClick={event=>{if(event.target instanceof Element&&event.target.closest('button'))return;const p=point(event);if(editableAt(p.timeS)){onSelect(visual,parameter.id,p.timeS);change((s,v)=>editAutomationKey(s,v,parameter.id,p.timeS,p.value));}}}
   onClick={event=>{if(suppressClick.current){suppressClick.current=false;return;}if(event.target instanceof Element&&event.target.closest('button'))return;const p=point(event);onSelect(visual,parameter.id,p.timeS);}}>
   <svg viewBox={`0 0 ${width} 56`} preserveAspectRatio="none" aria-hidden="true">
    <rect x={bounds.startS*pxPerS} y="0" width={Math.max(0,bounds.endS-bounds.startS)*pxPerS} height="56" className="map-automation-span"/>
    {paths.map((path,i)=><polyline key={i} points={path.map(p=>`${p.timeS*pxPerS},${y(p.value)}`).join(' ')} className="map-automation-curve"/>)}
   </svg>
   {marks.map(({key,timeS},i)=><button key={`${key.id}:${i}`} type="button" className="map-automation-key" disabled={locked}
    style={{left:timeS*pxPerS,top:y(key.value)}} aria-label={`${title} key at ${Number(timeS.toFixed(4))}s`} title={`${key.value}${parameter.unit??''} · source ${Number(key.timeS.toFixed(4))}s`}
    onClick={()=>{if(!suppressClick.current)onSelect(visual,parameter.id,timeS);}}
    onPointerDown={event=>{if(event.button!==0||locked)return;event.stopPropagation();event.preventDefault();event.currentTarget.focus({preventScroll:true});suppressClick.current=false;const lane=event.currentTarget.parentElement!;lane.setPointerCapture(event.pointerId);setDraft({key,timeS,value:key.value,changed:false,visual});}}
    onKeyDown={event=>{
     if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','Backspace'].includes(event.key))return;event.preventDefault();event.stopPropagation();if(locked)return;
     if(event.key==='Delete'||event.key==='Backspace')change((s,v)=>removeAutomationKey(s,v,parameter.id,key.id));
     else {const nextTime=Math.max(bounds.startS,Math.min(bounds.endS,timeS+(event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0)*(event.shiftKey?1:.1))),nextValue=key.value+(event.key==='ArrowDown'?-1:event.key==='ArrowUp'?1:0)*parameter.step*(event.shiftKey?10:1);change((s,v)=>editAutomationKey(s,v,parameter.id,nextTime,nextValue,key.id));onSelect(visual,parameter.id,nextTime);}
    }}/>) }
   {draft&&<span className="map-automation-draft" style={{left:draft.timeS*pxPerS,top:y(draft.value)}} aria-hidden="true"/>}
   {dense||marks.length>=4096?<span className="map-automation-note">Dense repeats · edit source keys</span>:segments.length>0&&segments.every(s=>s.rate===0)?<span className="map-automation-note">Held source time · edit keys in inspector</span>:null}
  </div>
 </Fragment>;
}
