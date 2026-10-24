import type { MapShow } from './document';
import type { Visual } from './visual-model';
import type { FeatureKeyframe, ShaderModulation, Lfo } from './features/types';
import { keyframeValue } from './features/animation';
import { modulatedValue } from './features/shader-motion';
import { readModulation } from './features/read-features';
import { readParameterKeys } from './features/parameter-animation';
import { readVisualPlacement } from './visual-placement';

export const VISUAL_MOTION_PARAMETERS = [
 {key:'opacityPercent',label:'Opacity',group:'Visual',unit:'%',min:0,max:100,step:.1,sliderMin:0,sliderMax:100},
 {key:'xPercent',label:'Position X',group:'Position',unit:'%',min:-1000,max:1000,step:.1,sliderMin:-100,sliderMax:200},
 {key:'yPercent',label:'Position Y',group:'Position',unit:'%',min:-1000,max:1000,step:.1,sliderMin:-100,sliderMax:200},
 {key:'widthPercent',label:'Width',group:'Position',unit:'%',min:.1,max:2000,step:.1,sliderMin:.1,sliderMax:200},
 {key:'heightPercent',label:'Height',group:'Position',unit:'%',min:.1,max:2000,step:.1,sliderMin:.1,sliderMax:200},
 {key:'rotationDeg',label:'Rotation',group:'Position',unit:'°',min:-3600,max:3600,step:.1,sliderMin:-180,sliderMax:180},
] as const;
export type VisualMotionKey = typeof VISUAL_MOTION_PARAMETERS[number]['key'];
export interface VisualMotion {
 animation?: Partial<Record<VisualMotionKey,FeatureKeyframe[]>>;
 modulation?: Partial<Record<VisualMotionKey,ShaderModulation>>;
}
export interface VisualMotionInputs { levels?:Record<string,number>; controls?:Record<number,number> }
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const bounded=(value:number,min:number,max:number,fallback:number)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export function visualMotionBase(visual:Visual):Record<VisualMotionKey,number>{return {...readVisualPlacement(visual.placement),opacityPercent:visual.opacity*100};}
export function hasVisualMotion(visual:Visual){return !!(Object.keys(visual.motion?.animation??{}).length||Object.keys(visual.motion?.modulation??{}).length);}
export function visualMotionVersion(show:MapShow):MapShow{return show.version<8&&show.visuals?.some(hasVisualMotion)?{...show,version:8}:show;}

/** Recover only supported numeric channels; malformed files cannot invent controls. */
export function readVisualMotion(value:unknown,opacityOnly=false):VisualMotion|undefined {
 const raw=record(value),curves=record(raw.animation),assignments=record(raw.modulation);
 const animation:NonNullable<VisualMotion['animation']>={},modulation:NonNullable<VisualMotion['modulation']>={};
 for(const spec of VISUAL_MOTION_PARAMETERS){
  if(opacityOnly&&spec.key!=='opacityPercent')continue;
  const keys=readParameterKeys(curves[spec.key],spec.min,spec.max);if(keys.length)animation[spec.key]=keys;
  const entry=assignments[spec.key];if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;
  const m=readModulation({value:entry}).value;if(!m)continue;
  modulation[spec.key]={...m,...(m.range?{range:{min:bounded(m.range.min,spec.min,spec.max,spec.min),max:bounded(m.range.max,spec.min,spec.max,spec.max)}}:{})};
 }
 return Object.keys(animation).length||Object.keys(modulation).length?{
  ...(Object.keys(animation).length?{animation}:{}),...(Object.keys(modulation).length?{modulation}:{}),
 }:undefined;
}

/** Source-time curves precede live/scene-time modulation. Authored bases stay unchanged. */
export function visualMotionAt(visual:Visual,sourceTimeS:number,sceneTimeS:number,inputs:VisualMotionInputs={},lfos?:readonly Lfo[]):Visual {
 if(!hasVisualMotion(visual))return visual;
 const values=visualMotionBase(visual),placement=readVisualPlacement(visual.placement);let opacity=visual.opacity,positionChanged=false;
 for(const spec of VISUAL_MOTION_PARAMETERS){
  if(visual.timelineRefID&&spec.key!=='opacityPercent')continue;
  const keys=visual.motion?.animation?.[spec.key],m=visual.motion?.modulation?.[spec.key];if(!keys?.length&&!m)continue;
  const base=values[spec.key],keyed=keyframeValue(keys??[],sourceTimeS,base);
  const evaluated=m?modulatedValue(keyed,m,m.source==='lfo'||m.clock==='scene'?sceneTimeS:sourceTimeS,inputs.levels,inputs.controls,lfos):keyed;
  const value=bounded(evaluated,spec.min,spec.max,base);
  if(spec.key==='opacityPercent')opacity=value/100;else{placement[spec.key]=value;positionChanged=true;}
 }
 return {...visual,opacity,...(positionChanged?{placement}:{})};
}

export function setVisualMotion(visual:Visual,key:VisualMotionKey,value:{keys?:FeatureKeyframe[];modulation?:ShaderModulation}):Visual {
 const animation={...visual.motion?.animation},modulation={...visual.motion?.modulation};
 if(value.keys?.length)animation[key]=value.keys;else delete animation[key];
 if(value.modulation)modulation[key]=value.modulation;else delete modulation[key];
 return {...visual,motion:readVisualMotion({animation,modulation},!!visual.timelineRefID)};
}
/** A deliberate manual edit takes over only the properties the operator touches. */
export function setVisualMotionBase(visual:Visual,values:Partial<Record<VisualMotionKey,number>>,manual=false):Visual {
 let next=visual;const placement=readVisualPlacement(visual.placement);let changedPlacement=false;
 for(const spec of VISUAL_MOTION_PARAMETERS){
  const raw=values[spec.key];if(raw===undefined||!Number.isFinite(raw)||visual.timelineRefID&&spec.key!=='opacityPercent')continue;
  const value=bounded(raw,spec.min,spec.max,0);
  if(manual)next=setVisualMotion(next,spec.key,{});
  if(spec.key==='opacityPercent')next={...next,opacity:value/100};else{placement[spec.key]=value;changedPlacement=true;}
 }
 return changedPlacement?{...next,placement}:next;
}
