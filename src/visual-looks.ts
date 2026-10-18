import type { MapShow,Surface } from './document';
import type { Visual,VisualLook,VisualLookSlot } from './visual-model';
import { visualSource } from './media-pool';
import { visualIsLocked } from './simple-visuals';
import { manualSourceEdit,setSourceMotionBases,sourceParameters } from './source-motion';
import { recallShaderLook,randomShaderLook } from './features/shader-looks';
import { effectAmount,effectDefinition } from './visual-effects';
export const VISUAL_LOOK_SLOTS=['A','B','C'] as const;
export function visualLookVersion(show:MapShow):MapShow {
 return show.version<11&&show.visuals?.some(v=>VISUAL_LOOK_SLOTS.some(slot=>v.looks?.[slot]))?{...show,version:11}:show;
}
function picture(show:MapShow,visual:Visual){
 if(visual.mask||visual.timelineRefID||show.tracks?.find(t=>t.id===visual.trackID)?.kind==='audio')throw Error('Choose a picture visual for appearance presets.');
}
function editable(show:MapShow,visual:Visual){if(visualIsLocked(show,visual))throw Error('The visual or its track is locked.');picture(show,visual);}
function usable(show:MapShow,source:Surface['source']){
 if(source.mediaId&&!show.media.some(m=>m.id===source.mediaId))throw Error('This preset’s media is unavailable. Restore that media before recalling the preset.');
 if(source.mediaId&&show.media.find(m=>m.id===source.mediaId)?.kind==='audio')throw Error('A picture preset cannot use an audio-only source.');
}
/** Capture authored bases and motion, never the evaluated frame or a pool pointer. */
export function captureVisualLook(show:MapShow,visual:Visual):VisualLook {
 if((visual.effects?.length??0)>12)throw Error('Use at most 12 effects before storing a visual preset.');
 const source=structuredClone(visualSource(show,visual));usable(show,source);
 if(source.shader){const {looks:_looks,...shader}=source.shader;source.shader=shader;}
 return structuredClone({source,opacity:visual.opacity,mapping:visual.mapping,placement:visual.placement,motion:visual.motion,effects:visual.effects??[]});
}
/** Older shader slots keep their original, shader-only recall semantics. */
export function visualLook(show:MapShow,visual:Visual,slot:VisualLookSlot):VisualLook|undefined {
 if(visual.looks?.[slot])return visual.looks[slot];
 const source=visualSource(show,visual);if(!source.shader?.looks?.[slot])return;
 const legacy=manualSourceEdit(source,{...source,shader:recallShaderLook(source.shader,slot)});const {looks:_looks,...shader}=legacy.shader!;
 return {...captureVisualLook(show,visual),shaderOnly:true,source:structuredClone({...legacy,shader})};
}
export function hasVisualLook(show:MapShow,visual:Visual,slot:VisualLookSlot){return !!(visual.looks?.[slot]||visualSource(show,visual).shader?.looks?.[slot]);}
function retainedLooks(show:MapShow,visual:Visual){return Object.fromEntries(VISUAL_LOOK_SLOTS.flatMap(slot=>{const look=visualLook(show,visual,slot);return look?[[slot,structuredClone(look)]]:[];})) as NonNullable<Visual['looks']>;}
export function storeVisualLook(show:MapShow,visual:Visual,slot:VisualLookSlot):Visual {
 editable(show,visual);return {...visual,looks:{...retainedLooks(show,visual),[slot]:captureVisualLook(show,visual)}};
}
export function recallVisualLook(show:MapShow,visual:Visual,slot:VisualLookSlot,from=visual):Visual {
 editable(show,visual);picture(show,from);const look=visualLook(show,from,slot);if(!look)throw Error(`Preset ${slot} has not been stored.`);usable(show,look.source);
 const copy=structuredClone(look),current=visualSource(show,visual),legacyBank=current.shader?.looks,looks=retainedLooks(show,visual);
 if(copy.shaderOnly){
  const source=current.shader?manualSourceEdit(current,{...current,shader:{...copy.source.shader!,...(legacyBank?{looks:structuredClone(legacyBank)}:{})}}):copy.source;
  return {...visual,looks,source};
 }
 // Full preset slots never nest themselves. Retain the destination's historical bank.
 if(copy.source.shader){const {looks:_looks,...shader}=copy.source.shader;copy.source.shader={...shader,...(legacyBank?{looks:structuredClone(legacyBank)}:{})};}
 return {...visual,looks,source:copy.source,opacity:copy.opacity,mapping:copy.mapping,placement:copy.placement,motion:copy.motion,effects:copy.effects};
}
export function clearVisualLook(show:MapShow,visual:Visual,slot:VisualLookSlot):Visual {
 editable(show,visual);const looks=retainedLooks(show,visual);delete looks[slot];let source=visualSource(show,visual);
 if(source.shader?.looks?.[slot]){const bank={...source.shader.looks};delete bank[slot];source={...source,shader:{...source.shader,looks:Object.keys(bank).length?bank:undefined}};}
 return {...visual,looks:Object.keys(looks).length?looks:undefined,...(source!==visualSource(show,visual)?{source}:{})};
}
/** Seeded randomization changes appearance, never media, device connections or scheduling. */
export function randomVisualLook(show:MapShow,visual:Visual,seed:number):Visual {
 editable(show,visual);if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Random preset seed must be an integer from 0 to 4294967295.');
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/0x100000000;};
 const before=visualSource(show,visual);let source=before;
 if(before.shader){
  const shader=randomShaderLook(before.shader,random),animation={...shader.animation},modulation={...shader.modulation};
  for(const key of new Set([...Object.keys(before.shader.parameters),...Object.keys(shader.parameters)]))if(before.shader.parameters[key]!==shader.parameters[key]){delete animation[key];delete modulation[key];}
  source={...source,shader:{...shader,animation:Object.keys(animation).length?animation:undefined,modulation:Object.keys(modulation).length?modulation:undefined}};
 }else{
  const values=Object.fromEntries(sourceParameters(source).filter(p=>p.binding&&p.binding!=='chroma'&&p.binding!=='textBackground'&&!p.key.endsWith(':alphaPercent')).map(p=>[p.key,p.key.endsWith(':hueDeg')?random()*360:p.key.endsWith(':saturationPercent')?55+random()*40:75+random()*25]));
  source=setSourceMotionBases(source,values);
  if(source.drawing)source={...source,drawing:{...source.drawing,strokes:source.drawing.strokes.map(stroke=>({...stroke,color:`hsl(${Math.floor(random()*360)}, 80%, 65%)`}))}};
 }
 source=manualSourceEdit(before,source);
 const effects=visual.effects?.length?visual.effects.map((e,i)=>{const spec=effectDefinition(e.kind);return {...e,enabled:e.enabled||i===0,amount:effectAmount(e.kind,spec.min+(spec.max-spec.min)*random()),animation:undefined,modulation:undefined};}):
  source===before?[{id:`${visual.id}-look-${seed}`,kind:'vintage' as const,enabled:true,amount:25+random()*45}]:undefined;
 return {...visual,source,effects};
}
