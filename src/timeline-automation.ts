import type { MapShow } from './document';
import { nextId } from './document';
import type { Visual } from './visual-model';
import type { FeatureKeyframe } from './features/types';
import { keyframeValue,putKeyframe } from './features/animation';
import { MAX_PARAMETER_KEYS,MAX_PARAMETER_TIME_S } from './features/parameter-animation';
import { performanceParameters,setPerformanceMotion,type PerformanceParameter } from './performance/parameters';
import { visualSource } from './media-pool';
import { visualSourceTime } from './visual-clock';
import { sourceParameterTime } from './source-motion';
import { shaderTimeS } from './features/shader-motion';
import { visualIsLocked } from './simple-visuals';

export interface ClockSegment { startS:number;endS:number;sourceStartS:number;rate:number }
export interface AutomationMark { key:FeatureKeyframe;timeS:number }
const MAX_SEGMENTS=2048,EPS=1e-7;
export function automationBounds(visual:Visual,durationS:number){return {startS:visual.continuous?0:Math.max(0,visual.startS),endS:visual.continuous?durationS:Math.min(durationS,visual.startS+visual.durationS)};}
/** Use precisely the same source clocks as the evaluator and Performance. */
export function automationTime(show:MapShow,visual:Visual,parameter:PerformanceParameter,timeS:number){
 const local=visualSourceTime(show,visual,timeS),source=visualSource(show,visual);
 return parameter.shaderKey?shaderTimeS(source.shader?.time,local):parameter.sourceKey?sourceParameterTime(source,parameter.sourceKey,local):local;
}
function cuts(start:number,end:number,period:number,offset:number,values:Set<number>){
 if(!(period>0)||!Number.isFinite(period))return true;
 const first=Math.floor((start+offset)/period)+1,last=Math.ceil((end+offset)/period)-1;
 if(last-first>MAX_SEGMENTS)return false;
 for(let n=first;n<=last;n++){const t=n*period-offset;if(t>start+EPS&&t<end-EPS)values.add(t);}
 return values.size<=MAX_SEGMENTS;
}
/** Exact affine pieces, split at media wraps/holds and shader wraps/turns.
 * Extremely dense loops remain editable in source time without an unbounded DOM. */
export function automationClock(show:MapShow,visual:Visual,parameter:PerformanceParameter,durationS:number):{segments:ClockSegment[];dense:boolean}{
 const {startS,endS}=automationBounds(visual,durationS);if(!(endS>startS))return {segments:[],dense:false};
 const source=visualSource(show,visual),length=visual.timelineRefID?show.timelines?.find(t=>t.id===visual.timelineRefID)?.durationS:show.media.find(m=>m.id===source.mediaId)?.duration;
 const boundaries=new Set([startS,endS]);
 if(!visual.continuous&&length&&length>0){
  if(visual.loop){if(!cuts(startS,endS,length,visual.inS-visual.startS,boundaries))return {segments:[],dense:true};}
  else {const at=visual.startS+length-(visual.timelineRefID?.length ? .000001:0)-visual.inS;if(at>startS&&at<endS)boundaries.add(at);}
 }
 const shaderClock=!!parameter.shaderKey||!!parameter.sourceKey&&(parameter.sourceKey.startsWith('color:shader:')||parameter.sourceKey.startsWith('choice:shader:'));
 const shader=shaderClock?source.shader?.time:undefined;
 if(shader&&!shader.frozen&&shader.loopS>0){
  const original=[...boundaries].sort((a,b)=>a-b);
  for(let i=1;i<original.length;i++){
   const a=original[i-1],b=original[i],mid=(a+b)/2,t=visualSourceTime(show,visual,mid),delta=Math.min((b-a)/4,.001);
   if(Math.abs(visualSourceTime(show,visual,mid+delta)-t)<delta/2)continue;
   // The source clock has unit slope on this piece; reverse shares wrap boundaries.
   if(!cuts(a,b,shader.loopS,t-mid+shader.offsetS,boundaries))return {segments:[],dense:true};
  }
 }
 const ordered=[...boundaries].sort((a,b)=>a-b),segments:ClockSegment[]=[];
 for(let i=1;i<ordered.length;i++){
  const a=ordered[i-1],b=ordered[i],mid=(a+b)/2,delta=Math.min((b-a)/4,.001),value=automationTime(show,visual,parameter,mid);
  const rate=Math.round((automationTime(show,visual,parameter,mid+delta)-value)/delta);
  segments.push({startS:a,endS:b,sourceStartS:value-rate*(mid-a),rate});
 }
 return {segments,dense:false};
}
export function automationMarks(show:MapShow,visual:Visual,parameter:PerformanceParameter,segments:ClockSegment[]):AutomationMark[]{
 const marks:AutomationMark[]=[],seen=new Set<string>();
 for(const segment of segments)if(segment.rate!==0)for(const key of parameter.keys??[]){
  const timeS=segment.startS+(key.timeS-segment.sourceStartS)/segment.rate;
  if(timeS<segment.startS-EPS||timeS>segment.endS+EPS||Math.abs(automationTime(show,visual,parameter,timeS)-key.timeS)>1e-5)continue;
  const id=`${key.id}:${timeS.toFixed(6)}`;if(seen.has(id))continue;seen.add(id);marks.push({key,timeS});
  if(marks.length>=4096)return marks;
 }
 return marks.sort((a,b)=>a.timeS-b.timeS);
}
/** Base curve, before live modulation. Separate paths never bridge clock resets. */
export function automationCurve(parameter:PerformanceParameter,segments:ClockSegment[]){
 const keys=parameter.options?(parameter.keys??[]).map(k=>({...k,interpolation:'hold' as const})):parameter.keys??[];
 return segments.map(segment=>{
  const times=new Set([segment.startS,segment.endS]);
  for(let i=1;i<24;i++)times.add(segment.startS+(segment.endS-segment.startS)*i/24);
  if(segment.rate)for(const key of keys){const t=segment.startS+(key.timeS-segment.sourceStartS)/segment.rate;if(t>segment.startS&&t<segment.endS){times.add(t);times.add(Math.max(segment.startS,t-1e-6));times.add(Math.min(segment.endS,t+1e-6));}}
  return [...times].sort((a,b)=>a-b).map(timeS=>({timeS,value:keyframeValue(keys,segment.sourceStartS+(timeS-segment.startS)*segment.rate,parameter.base)}));
 });
}
/** A timeline interaction writes the existing source-time channel; no lane state is saved. */
export function editAutomationKey(show:MapShow,visual:Visual,parameterID:string,sceneTimeS:number,value:number,keyID?:string):Visual{
 if(visualIsLocked(show,visual)||!Number.isFinite(sceneTimeS)||!Number.isFinite(value))return visual;
 if(!visual.continuous&&(sceneTimeS<visual.startS-EPS||sceneTimeS>visual.startS+visual.durationS+EPS))return visual;
 const parameter=performanceParameters(show,visual,sceneTimeS).find(p=>p.id===parameterID);if(!parameter)return visual;
 const timeS=automationTime(show,visual,parameter,sceneTimeS),keys=parameter.keys??[],key=keys.find(k=>k.id===keyID);
 if(timeS<0||timeS>MAX_PARAMETER_TIME_S||parameter.motionFull||keyID&&!key||!key&&keys.length>=MAX_PARAMETER_KEYS)return visual;
 const min=parameter.domainMin??(parameter.effectID?parameter.min:-1e6),max=parameter.domainMax??(parameter.effectID?parameter.max:1e6);
 const bounded=Math.max(min,Math.min(max,parameter.options?Math.round(value):value));
 if(key&&Math.abs(key.timeS-timeS)<1e-8&&key.value===bounded)return visual;
 return setPerformanceMotion(show,visual,parameter,{keys:putKeyframe(keys,{id:key?.id??nextId('parameter-key'),timeS:Math.max(0,timeS),value:bounded,interpolation:parameter.options?'hold':key?.interpolation??'linear'}),modulation:parameter.modulation});
}
export function removeAutomationKey(show:MapShow,visual:Visual,parameterID:string,keyID:string):Visual{
 const parameter=performanceParameters(show,visual,0).find(p=>p.id===parameterID);if(!parameter?.keys?.some(k=>k.id===keyID)||visualIsLocked(show,visual))return visual;
 const keys=parameter.keys.filter(k=>k.id!==keyID);return setPerformanceMotion(show,visual,parameter,{keys:keys.length?keys:undefined,modulation:parameter.modulation});
}
