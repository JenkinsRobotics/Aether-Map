import { extendedSourceParameters, extendedSourceSpec, writeExtendedSourceValues, type ExtendedSourceKey } from './source-controls';
import type { MapShow, MediaRef, Rect, Surface } from './document';
import type { FeatureKeyframe, Lfo, ShaderModulation } from './features/types';
import type { VisualMotionInputs } from './visual-motion';
import { keyframeValue } from './features/animation';
import { modulatedValue,shaderTimeS } from './features/shader-motion';
import { readModulation } from './features/read-features';
import { readParameterKeys } from './features/parameter-animation';

type Source = Surface['source'];
export const SOURCE_MOTION_PARAMETERS = [
 {key:'cropLeftPx',label:'Crop left',unit:'px',min:0,max:1e6,step:.1},
 {key:'cropTopPx',label:'Crop top',unit:'px',min:0,max:1e6,step:.1},
 {key:'cropWidthPx',label:'Crop width',unit:'px',min:1,max:1e6,step:.1},
 {key:'cropHeightPx',label:'Crop height',unit:'px',min:1,max:1e6,step:.1},
 {key:'textSizePx',label:'Text size',unit:'px',min:1,max:10000,step:.1},
 {key:'textLineHeight',label:'Line height',unit:'',min:.1,max:20,step:.01},
 {key:'textLetterSpacingPx',label:'Letter spacing',unit:'px',min:-1000,max:1000,step:.1},
 {key:'fillOpacityPercent',label:'Fill opacity',unit:'%',min:0,max:100,step:.1},
 {key:'gradientAngleDeg',label:'Gradient angle',unit:'°',min:-3600,max:3600,step:.1},
 {key:'trackerScale',label:'Tracker size',unit:'',min:.1,max:5,step:.01},
 {key:'drawingDurationS',label:'Drawing duration',unit:'s',min:.1,max:3600,step:.1},
 {key:'keySimilarityPercent',label:'Key tolerance',unit:'%',min:0,max:100,step:.1},
 {key:'keySoftnessPercent',label:'Key softness',unit:'%',min:0,max:100,step:.1},
 {key:'keySpillPercent',label:'Key spill suppression',unit:'%',min:0,max:100,step:.1},
] as const;
export type SourceMotionKey = typeof SOURCE_MOTION_PARAMETERS[number]['key'] | ExtendedSourceKey;
export interface SourceParameter { key:SourceMotionKey; label:string;unit:string;min:number;max:number;step:number;base:number;options?:readonly string[];binding?:string }
export interface SourceMotion {
 animation?: Partial<Record<SourceMotionKey,FeatureKeyframe[]>>;
 modulation?: Partial<Record<SourceMotionKey,ShaderModulation>>;
}
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const bound=(value:number,min:number,max:number,fallback:number)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export const MAX_SOURCE_MOTION_CHANNELS=256;
export function sourceMotionIsFull(source:Source,key:SourceMotionKey){const keys=new Set([...Object.keys(source.motion?.animation??{}),...Object.keys(source.motion?.modulation??{})]);return keys.size>=MAX_SOURCE_MOTION_CHANNELS&&!keys.has(key);}
export function hasSourceMotion(source:Source){return !!(Object.keys(source.motion?.animation??{}).length||Object.keys(source.motion?.modulation??{}).length);}
export function sourceMotionVersion(show:MapShow):MapShow {
 if(show.version>=10)return show;
 const surfaces=[...(show.unassignedSurfaces??[]),...(show.scenes??[]).flatMap(s=>s.surfaces??[])];
 const sources=[...(show.pool??[]).map(a=>a.source),...(show.visuals??[]).flatMap(v=>v.source?[v.source]:[]),
  ...surfaces.flatMap(s=>[s.source,...(s.clips??[]).flatMap(c=>c.source?[c.source]:[])])];
 const extended=sources.some(s=>s&&[...Object.keys(s.motion?.animation??{}),...Object.keys(s.motion?.modulation??{})].some(key=>extendedSourceSpec(key)));
 return extended?{...show,version:10}:show.version<9&&sources.some(s=>s&&hasSourceMotion(s))?{...show,version:9}:show;
}
export function readSourceMotion(value:unknown):SourceMotion|undefined {
 const raw=record(value),curves=record(raw.animation),assignments=record(raw.modulation);
 const animation:NonNullable<SourceMotion['animation']>={},modulation:NonNullable<SourceMotion['modulation']>={};
 const specs=[...SOURCE_MOTION_PARAMETERS,...[...new Set([...Object.keys(curves),...Object.keys(assignments)])].filter(k=>extendedSourceSpec(k)).slice(0,MAX_SOURCE_MOTION_CHANNELS).map(k=>extendedSourceSpec(k)!)];
 for(const spec of specs){
  if(new Set([...Object.keys(animation),...Object.keys(modulation)]).size>=MAX_SOURCE_MOTION_CHANNELS)break;
  const parsed=readParameterKeys(curves[spec.key],spec.min,spec.max);
  const keys=spec.key.startsWith('choice:')?parsed.map(k=>({...k,value:Math.round(k.value),interpolation:'hold' as const})):parsed;if(keys.length)animation[spec.key]=keys;
  const entry=assignments[spec.key];if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;
  const m=readModulation({value:entry}).value;if(!m)continue;
  modulation[spec.key]={...m,...(m.range?{range:{min:bound(m.range.min,spec.min,spec.max,spec.min),max:bound(m.range.max,spec.min,spec.max,spec.max)}}:{})};
 }
 return Object.keys(animation).length||Object.keys(modulation).length?{
  ...(Object.keys(animation).length?{animation}:{}),...(Object.keys(modulation).length?{modulation}:{}),
 }:undefined;
}
/** Only controls used by the active renderer are offered. Inactive assignments survive toggles. */
export function sourceParameters(source:Source,media?:MediaRef):SourceParameter[] {
 const values:Partial<Record<SourceMotionKey,number>>={};
 if(source.tracker)values.trackerScale=source.tracker.scale;
 else if(source.webcam||source.shader) { /* Their existing source controls own motion. */ }
 else if(source.drawing){if(source.drawing.replay)values.drawingDurationS=source.drawing.replay.durationS;}
 else if(source.testPattern) { /* No continuous controls. */ }
 else if(source.text)Object.assign(values,{textSizePx:source.text.sizePx,textLineHeight:source.text.lineHeight??1.2,textLetterSpacingPx:source.text.letterSpacingPx??0});
 else if(source.fill||source.fillGradient){values.fillOpacityPercent=(source.fillOpacity??1)*100;if(source.fillGradient?.kind==='linear')values.gradientAngleDeg=source.fillGradient.angleDeg;}
 else if(source.mediaId&&media?.kind!=='audio'){
  Object.assign(values,{cropLeftPx:source.rect[0],cropTopPx:source.rect[1],cropWidthPx:source.rect[2],cropHeightPx:source.rect[3]});
  if(source.chromaKey?.enabled)Object.assign(values,{keySimilarityPercent:source.chromaKey.similarity*100,keySoftnessPercent:source.chromaKey.softness*100,keySpillPercent:source.chromaKey.spill*100});
 }
 return [...SOURCE_MOTION_PARAMETERS.flatMap(spec=>{
  const base=values[spec.key];if(base===undefined)return [];
  const dimension=spec.key==='cropLeftPx'||spec.key==='cropWidthPx'?media?.width:spec.key==='cropTopPx'||spec.key==='cropHeightPx'?media?.height:undefined;
  const max=dimension&&Number.isFinite(dimension)?Math.min(spec.max,Math.max(spec.min,dimension-(spec.min===0?1:0))):spec.max;
  return [{...spec,max,base}];
 }),...extendedSourceParameters(source,media)];
}
function writeValues(source:Source,values:Partial<Record<SourceMotionKey,number>>,media?:MediaRef):Source {
 let next=source;let rect:Rect|undefined;
 for(const spec of sourceParameters(source,media)){
  const raw=values[spec.key];if(raw===undefined||!Number.isFinite(raw))continue;
  const v=bound(raw,spec.min,spec.max,spec.base);
  switch(spec.key){
   case 'cropLeftPx':case 'cropTopPx':case 'cropWidthPx':case 'cropHeightPx':
    rect??=[...source.rect];rect[['cropLeftPx','cropTopPx','cropWidthPx','cropHeightPx'].indexOf(spec.key)]=v;break;
   case 'textSizePx':next={...next,text:{...next.text!,sizePx:v}};break;
   case 'textLineHeight':next={...next,text:{...next.text!,lineHeight:v}};break;
   case 'textLetterSpacingPx':next={...next,text:{...next.text!,letterSpacingPx:v}};break;
   case 'fillOpacityPercent':next={...next,fillOpacity:v/100};break;
   case 'gradientAngleDeg':next={...next,fillGradient:{...next.fillGradient!,angleDeg:v}};break;
   case 'trackerScale':next={...next,tracker:{...next.tracker!,scale:v}};break;
   case 'drawingDurationS':next={...next,drawing:{...next.drawing!,replay:{...next.drawing!.replay!,durationS:v}}};break;
   case 'keySimilarityPercent':next={...next,chromaKey:{...next.chromaKey!,similarity:v/100}};break;
   case 'keySoftnessPercent':next={...next,chromaKey:{...next.chromaKey!,softness:v/100}};break;
   case 'keySpillPercent':next={...next,chromaKey:{...next.chromaKey!,spill:v/100}};break;
  }
 }
 // Evaluate all four channels first, then constrain their joint crop to real media.
 if(rect){if(media){const w=Math.max(1,media.width),h=Math.max(1,media.height);rect=[Math.min(w-1,rect[0]),Math.min(h-1,rect[1]),rect[2],rect[3]];rect[2]=Math.min(w-rect[0],rect[2]);rect[3]=Math.min(h-rect[1],rect[3]);}next={...next,rect};}
 return writeExtendedSourceValues(next,values,media);
}
/** Shader colors/choices share its trim/reverse/loop/freeze clock with numeric controls. */
export function sourceParameterTime(source:Source,key:SourceMotionKey,timeS:number){return source.shader&&(key.startsWith('color:shader:')||key.startsWith('choice:shader:'))?shaderTimeS(source.shader.time,timeS):timeS;}
export function sourceMotionAt(source:Source,sourceTimeS:number,sceneTimeS:number,inputs:VisualMotionInputs={},lfos?:readonly Lfo[],media?:MediaRef):Source {
 if(!hasSourceMotion(source))return source;
 const values:Partial<Record<SourceMotionKey,number>>={};
 for(const spec of sourceParameters(source,media)){
  const keys=source.motion?.animation?.[spec.key],m=source.motion?.modulation?.[spec.key];if(!keys?.length&&!m)continue;
  const parameterTime=sourceParameterTime(source,spec.key,sourceTimeS);
  const keyed=keyframeValue(spec.options?(keys??[]).map(k=>({...k,interpolation:'hold'})):keys??[],parameterTime,spec.base);
  values[spec.key]=bound(m?modulatedValue(keyed,m,m.source==='lfo'||m.clock==='scene'?sceneTimeS:parameterTime,inputs.levels,inputs.controls,lfos):keyed,spec.min,spec.max,spec.base);
 }
 return writeValues(source,values,media);
}
export function setSourceMotion(source:Source,key:SourceMotionKey,value:{keys?:FeatureKeyframe[];modulation?:ShaderModulation}):Source {
 if((value.keys?.length||value.modulation)&&sourceMotionIsFull(source,key))return source;
 const animation={...source.motion?.animation},modulation={...source.motion?.modulation};
 if(value.keys?.length)animation[key]=value.keys;else delete animation[key];
 if(value.modulation)modulation[key]=value.modulation;else delete modulation[key];
 return {...source,motion:readSourceMotion({animation,modulation})};
}
export function setSourceMotionBases(source:Source,values:Partial<Record<SourceMotionKey,number>>,media?:MediaRef):Source{return writeValues(source,values,media);}
export function setSourceMotionBase(source:Source,key:SourceMotionKey,value:number,media?:MediaRef,manual=false):Source {
 if(!Number.isFinite(value))return source;
 return writeValues(manual?setSourceMotion(source,key,{}):source,{[key]:value},media);
}
/** Ordinary inspector edits take over touched channels, leaving all other motion intact. */
export function manualSourceEdit(before:Source,after:Source):Source {
 let next=after;
 const values=new Map(sourceParameters(after).map(p=>[p.key,p.base]));
 const specs=sourceParameters(before),changedColors=new Set(specs.filter(p=>p.binding&&values.has(p.key)&&values.get(p.key)!==p.base).map(p=>p.binding));
 for(const spec of specs)if(values.has(spec.key)&&(values.get(spec.key)!==spec.base||spec.binding&&changedColors.has(spec.binding)))next=setSourceMotion(next,spec.key,{});
 return next;
}
