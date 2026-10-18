import { NATIVE_SHADER_IDS } from './features/original-shader-presets';
import type { Surface,MediaRef } from './document';
import { shaderOptions } from './features/shader-options';
import { sourceColor,sourceColorHex,type SourceColor } from './source-color';
type Source=Surface['source'];
export const COLOR_CHANNELS=[
 {key:'hueDeg',label:'Hue',min:0,max:360,unit:'°',step:.1},
 {key:'saturationPercent',label:'Saturation',min:0,max:100,unit:'%',step:.1},
 {key:'brightnessPercent',label:'Brightness',min:0,max:100,unit:'%',step:.1},
 {key:'alphaPercent',label:'Alpha',min:0,max:100,unit:'%',step:.1},
] as const;
export type ExtendedSourceKey=`color:${string}:${keyof SourceColor}`|`choice:${string}`;
export interface ExtendedSourceParameter {key:ExtendedSourceKey;label:string;min:number;max:number;step:number;unit:string;base:number;options?:readonly string[];binding?:string}
interface ColorBinding {id:string;label:string;color:string;opacity?:number;opaque?:boolean;write:(source:Source,color:string,opacity:number)=>Source}
interface ChoiceBinding {id:string;label:string;value:string|number|boolean;values:readonly (string|number|boolean)[];write:(source:Source,value:string|number|boolean)=>Source}
const label=(key:string)=>key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
const parameterName=(name:string)=>/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name)&&!['constructor','prototype','__proto__','style','children','ref','image','frame'].includes(name);
/** Strict syntax bounds storage recovery; active source bindings bound actual values. */
export function extendedSourceSpec(key:string){
 const color=/^color:(fill|text|textBackground|tracker|chroma|gradient:(?:[0-9]|1[0-5])|shader:palette:[0-9]|shader:parameter:([a-zA-Z][a-zA-Z0-9_]{0,63})):(hueDeg|saturationPercent|brightnessPercent|alphaPercent)$/.exec(key);
 if(color&&(!color[2]||parameterName(color[2]))){const channel=COLOR_CHANNELS.find(c=>c.key===color[3])!;return {...channel,key:key as ExtendedSourceKey};}
 const choice=/^choice:(textAlign|textItalic|fit|testPattern|gradientKind|drawingLoop|cameraMirror|cameraFlip|trackerStyle|trackerHand|shader:([a-zA-Z][a-zA-Z0-9_]{0,63}))$/.exec(key);
 if(choice&&(!choice[2]||parameterName(choice[2])))return {key:key as ExtendedSourceKey,label:key,min:0,max:63,unit:'',step:1,discrete:true};
}
function bindings(source:Source,media?:MediaRef):{colors:ColorBinding[];choices:ChoiceBinding[]}{
 const colors:ColorBinding[]=[],choices:ChoiceBinding[]=[];
 const color=(id:string,name:string,value:string,write:ColorBinding['write'],opacity?:number,opaque=false)=>{if(sourceColor(value))colors.push({id,label:name,color:value,write,opacity,opaque});};
 const choice=(id:string,name:string,value:ChoiceBinding['value'],values:ChoiceBinding['values'],write:ChoiceBinding['write'])=>{if(values.includes(value))choices.push({id,label:name,value,values,write});};
 if(source.tracker||source.webcam){
  const camera=source.tracker??source.webcam!;
  for(const [id,name,key] of [['cameraMirror','Camera mirror','mirror'],['cameraFlip','Camera flip','flipY']] as const)choice(id,name,camera[key],[false,true],(s,v)=>source.tracker?{...s,tracker:{...s.tracker!,[key]:v}}:{...s,webcam:{...s.webcam!,[key]:v}});
  if(source.tracker){
   color('tracker','Tracker color',source.tracker.color,(s,c)=>({...s,tracker:{...s.tracker!,color:c}}));
   choice('trackerStyle','Tracker style',source.tracker.style,['skin','silhouette','wire','metal'],(s,v)=>({...s,tracker:{...s.tracker!,style:v as NonNullable<Source['tracker']>['style']}}));
   choice('trackerHand','Tracker hand',source.tracker.hand,['both','left','right'],(s,v)=>({...s,tracker:{...s.tracker!,hand:v as NonNullable<Source['tracker']>['hand']}}));
  }
 }else if(source.shader){
  const shader=source.shader;
  shader.colors.slice(0,10).forEach((c,i)=>color(`shader:palette:${i}`,`Palette ${i+1}`,c,(s,c)=>({...s,shader:{...s.shader!,colors:s.shader!.colors.map((old,n)=>n===i?c:old)}}),undefined,NATIVE_SHADER_IDS.has(shader.preset)));
  for(const [key,v] of Object.entries(shader.parameters).slice(0,256)){
   if(!parameterName(key))continue;const options=shaderOptions(shader.preset,key);
   const write=(s:Source,v:string|number|boolean)=>({...s,shader:{...s.shader!,parameters:{...s.shader!.parameters,[key]:v}}});
   if(options)choice(`shader:${key}`,`Shader ${label(key)}`,String(v),options,(s,v)=>write(s,typeof shader.parameters[key]==='number'?Number(v):v));
   else if(typeof v==='boolean')choice(`shader:${key}`,`Shader ${label(key)}`,v,[false,true],write);
   else if(typeof v==='string')color(`shader:parameter:${key}`,`Shader ${label(key)}`,v,(s,c)=>write(s,c));
  }
 }else if(source.drawing){
  if(source.drawing.replay)choice('drawingLoop','Drawing loop',source.drawing.replay.loop,[false,true],(s,v)=>({...s,drawing:{...s.drawing!,replay:{...s.drawing!.replay!,loop:v as boolean}}}));
 }else if(source.testPattern)choice('testPattern','Test pattern',source.testPattern,['grid','bars'],(s,v)=>({...s,testPattern:v as Source['testPattern']}));
 else if(source.text){
  color('text','Text color',source.text.color,(s,c)=>({...s,text:{...s.text!,color:c}}));
  color('textBackground','Text background',source.text.background,(s,c)=>({...s,text:{...s.text!,background:c}}));
  choice('textAlign','Text alignment',source.text.align,['left','center','right','justify'],(s,v)=>({...s,text:{...s.text!,align:v as NonNullable<Source['text']>['align']}}));
  choice('textItalic','Text italic',source.text.italic??false,[false,true],(s,v)=>({...s,text:{...s.text!,italic:v as boolean}}));
 }else if(source.fill||source.fillGradient){
  if(source.fillGradient){
   source.fillGradient.stops.slice(0,16).forEach((stop,i)=>color(`gradient:${i}`,`Gradient stop ${i+1}`,stop.color,(s,c,a)=>({...s,fillGradient:{...s.fillGradient!,stops:s.fillGradient!.stops.map((old,n)=>n===i?{...old,color:c,opacity:a}:old)}}),stop.opacity));
   choice('gradientKind','Gradient type',source.fillGradient.kind,['linear','radial'],(s,v)=>({...s,fillGradient:{...s.fillGradient!,kind:v as 'linear'|'radial'}}));
  }else if(source.fill)color('fill','Fill color',source.fill,(s,c)=>({...s,fill:c}));
 }else if(source.mediaId&&media?.kind!=='audio'){
  choice('fit','Media fit',source.fit??'stretch',['contain','cover','stretch'],(s,v)=>({...s,fit:v as Source['fit']}));
  if(source.chromaKey?.enabled)color('chroma','Key color',source.chromaKey.color,(s,c)=>({...s,chromaKey:{...s.chromaKey!,color:c}}),undefined,true);
 }
 return {colors,choices};
}
export function extendedSourceParameters(source:Source,media?:MediaRef):ExtendedSourceParameter[]{
 const {colors,choices}=bindings(source,media);
 return [...colors.flatMap(b=>{const c=sourceColor(b.color)!;if(b.opacity!==undefined)c.alphaPercent=b.opacity*100;return COLOR_CHANNELS.filter(ch=>!b.opaque||ch.key!=='alphaPercent').map(ch=>({...ch,key:`color:${b.id}:${ch.key}` as ExtendedSourceKey,label:`${b.label} · ${ch.label}`,base:c[ch.key],binding:b.id}));}),
  ...choices.map(b=>({key:`choice:${b.id}` as ExtendedSourceKey,label:b.label,min:0,max:b.values.length-1,step:1,unit:'',base:b.values.indexOf(b.value),options:b.values.map(v=>typeof v==='boolean'?(v?'On':'Off'):label(String(v)))}))].slice(0,242);
}
export function writeExtendedSourceValues(source:Source,values:Partial<Record<ExtendedSourceKey,number>>,media?:MediaRef):Source {
 let next=source;const {colors,choices}=bindings(source,media);
 for(const b of colors){
  const c=sourceColor(b.color)!;if(b.opacity!==undefined)c.alphaPercent=b.opacity*100;let changed=false;
  for(const ch of COLOR_CHANNELS){if(b.opaque&&ch.key==='alphaPercent')continue;const v=values[`color:${b.id}:${ch.key}`];if(v===undefined||!Number.isFinite(v))continue;c[ch.key]=Math.min(ch.max,Math.max(ch.min,v));changed=true;}
  if(changed)next=b.write(next,sourceColorHex(c,!b.opaque&&b.opacity===undefined),c.alphaPercent/100);
 }
 for(const b of choices){const v=values[`choice:${b.id}`];if(v!==undefined&&Number.isFinite(v))next=b.write(next,b.values[Math.min(b.values.length-1,Math.max(0,Math.round(v)))]);}
 return next;
}
