import { sourceParameterTime, sourceMotionIsFull, sourceParameters, sourceMotionAt, setSourceMotion, setSourceMotionBase, type SourceMotionKey } from '../source-motion';
import { VISUAL_MOTION_PARAMETERS,visualMotionBase,visualMotionAt,setVisualMotionBase,setVisualMotion,type VisualMotionKey } from '../visual-motion';
import { visualSourceTime } from '../visual-clock';
import type { MapShow, Surface } from '../document';
import { visualSource } from '../media-pool';
import { visualIsLocked } from '../simple-visuals';
import type { Visual } from '../visual-model';
import { effectAmount, effectDefinition } from '../visual-effects';
import { effectValueAt } from '../features/effect-motion';
import { newShader, parameterLabel, SHADERS, shaderOptions } from '../features/shader-catalog';
import { parameterSliderRange, parameterStep } from '../features/shader-parameter-controls';
import { shaderAt, shaderTimeS } from '../features/shader-motion';
import type { FeatureKeyframe, Lfo, ShaderModulation } from '../features/types';

export interface PerformanceParameter {
  id: string; label: string; group: 'Visual' | 'Position' | 'Source' | 'Shader' | 'Effects';
  base: number; value: number; min: number; max: number; step: number; unit?: string; options?:readonly string[]; motionFull?:boolean;
  modulation?: ShaderModulation; keys?: FeatureKeyframe[]; timeS: number;
  sourceKey?: SourceMotionKey; effectID?: string; shaderKey?: string; visualKey?:VisualMotionKey; domainMin?:number; domainMax?:number;
  /** Suggested fader interval; numeric entry may extend it for unbounded shaders. */
  set: (value: number, manual?: boolean) => Visual;
}

function shaderRange(preset: string, key: string, base: number) {
  const suggested = parameterSliderRange(key,preset);
  const values = SHADERS.find(s => s.id === preset)?.presets.map(p => Number((p.params as Record<string, unknown>)[key])).filter(Number.isFinite) ?? [];
  const magnitude = Math.max(1, ...values.map(Math.abs));
  const signed = /angle|rotation|offset|shift|bias/i.test(key) || base < 0 || values.some(v => v < 0);
  return { min: Math.min(base, suggested?.min ?? (signed ? -magnitude * 2 : 0)), max: Math.max(base, suggested?.max ?? magnitude * 2),
    step: parameterStep(key,preset,.01) };
}

/** A projection over the saved visual, never a separate performance document. */
export function performanceParameters(show: MapShow, visual: Visual, showTimeS: number,
  levels?: Record<string, number>, controls?: Record<number, number>, lfos?: readonly Lfo[]): PerformanceParameter[] {
  const source = visualSource(show, visual), shader = source.shader;
  const timeS = visualSourceTime(show,visual,showTimeS);
  const mutable = !visualIsLocked(show, visual);
  const patch = (next: Partial<Visual>) => mutable ? { ...visual, ...next } : visual;
  const patchSource = (next: Partial<Surface['source']>) => patch({ source: { ...source, ...next } });
  const baseValues=visualMotionBase(visual),evaluatedValues=visualMotionBase(visualMotionAt(visual,timeS,showTimeS,{levels,controls},lfos));
  const result:PerformanceParameter[]=VISUAL_MOTION_PARAMETERS.filter(spec=>!visual.timelineRefID||spec.key==='opacityPercent').map(spec=>{
    const key=spec.key,base=baseValues[key],value=evaluatedValues[key],modulation=visual.motion?.modulation?.[key],keys=visual.motion?.animation?.[key];
    return {id:key==='opacityPercent'?'opacity':`placement:${key}`,visualKey:key,label:spec.label,group:spec.group,base,value,
      min:Math.min(spec.sliderMin,base,value),max:Math.max(spec.sliderMax,base,value),domainMin:spec.min,domainMax:spec.max,step:spec.step,unit:spec.unit,timeS,modulation,keys,
      set:(value:number,manual=false)=>!mutable||!Number.isFinite(value)||!manual&&(modulation||keys?.length)?visual:setVisualMotionBase(visual,{[key]:value},manual)};
  });
  if(visual.timelineRefID)return result;
  const media=show.media.find(m=>m.id===source.mediaId);
  const evaluatedSource=sourceMotionAt(source,timeS,showTimeS,{levels,controls},lfos,media);
  const evaluatedSourceValues=new Map(sourceParameters(evaluatedSource,media).map(p=>[p.key,p.base]));
  for(const spec of sourceParameters(source,media)){
    const key=spec.key,base=spec.base,value=evaluatedSourceValues.get(key)??base,modulation=source.motion?.modulation?.[key],keys=source.motion?.animation?.[key];
    const range=key==='textSizePx'?[1,512]:key==='textLineHeight'?[.1,3]:key==='textLetterSpacingPx'?[-25,100]:key==='drawingDurationS'?[.1,60]:key==='gradientAngleDeg'?[-180,180]:[spec.min,spec.max];
    result.push({id:`source:${key}`,sourceKey:key,label:spec.label,motionFull:sourceMotionIsFull(source,key),options:spec.options,group:'Source',base,value,min:Math.min(range[0],base,value),max:Math.max(range[1],base,value),domainMin:spec.min,domainMax:spec.max,step:spec.step,unit:spec.unit,timeS:sourceParameterTime(source,key,timeS),modulation,keys,
      set:(value,manual=false)=>!mutable||!Number.isFinite(value)||!manual&&(modulation||keys?.length)?visual:patchSource(setSourceMotionBase(source,key,value,media,manual))});
  }
  if (shader) {
    const parameters = { ...newShader(shader.preset).parameters, ...shader.parameters };
    // Match renderer evaluation: absent authored controls use the generator's defaults.
    const evaluated = shaderAt(shader, shaderTimeS(shader.time, timeS), levels, controls, lfos, showTimeS).parameters;
    for (const [key, base] of Object.entries(parameters)) if (typeof base === 'number' && Number.isFinite(base) && !shaderOptions(shader.preset, key)) {
      const modulation = shader.modulation?.[key], keys = shader.animation?.[key];
      result.push({ id: `shader:${key}`, shaderKey: key, label: parameterLabel(key), group: 'Shader', base,
        value: typeof evaluated[key] === 'number' ? evaluated[key] as number : base,
        ...shaderRange(shader.preset, key, base), modulation, keys, timeS: shaderTimeS(shader.time, timeS),
        set: (value, manual = false) => {
          if (!Number.isFinite(value) || (!manual && (modulation || keys?.length))) return visual;
          const nextModulation = { ...shader.modulation }, animation = { ...shader.animation };
          if (manual) { delete nextModulation[key]; delete animation[key]; }
          return patchSource({ shader: { ...shader, parameters: { ...shader.parameters, [key]: value },
            modulation: Object.keys(nextModulation).length ? nextModulation : undefined, animation: Object.keys(animation).length ? animation : undefined } });
        } });
    }
  }
  for (const [index, effect] of (visual.effects ?? []).entries()) {
    const spec = effectDefinition(effect.kind);
    result.push({ id: `effect:${effect.id}`, effectID: effect.id, label: `${spec.label} ${index + 1}`, group: 'Effects', base: effect.amount,
      value: effectValueAt(effect, timeS, showTimeS, levels, controls, lfos), min: spec.min, max: spec.max, step: spec.step,
      modulation: effect.modulation, keys: effect.animation, timeS,
      set: (value, manual = false) => !Number.isFinite(value) || (!manual && (effect.modulation || effect.animation?.length)) ? visual
        : patch({ effects: visual.effects?.map(e => e.id === effect.id ? { ...e, amount: effectAmount(e.kind, value),
          ...(manual ? { modulation: undefined, animation: undefined } : {}) } : e) }) });
  }
  return result;
}

export function setPerformanceMotion(show: MapShow, visual: Visual, parameter: PerformanceParameter,
  motion: { modulation?: ShaderModulation; keys?: FeatureKeyframe[] }): Visual {
  if (visualIsLocked(show, visual)) return visual;
  if(parameter.visualKey)return setVisualMotion(visual,parameter.visualKey,motion);
  if(visual.timelineRefID)return visual;
  if(parameter.sourceKey)return {...visual,source:setSourceMotion(visualSource(show,visual),parameter.sourceKey,motion)};
  if (parameter.effectID) return { ...visual, effects: visual.effects?.map(e => e.id === parameter.effectID ? { ...e, modulation: motion.modulation, animation: motion.keys } : e) };
  const source = visualSource(show, visual), shader = source.shader, key = parameter.shaderKey;
  if (!shader || !key) return visual;
  const modulation = { ...shader.modulation }, animation = { ...shader.animation };
  if (motion.modulation) modulation[key] = motion.modulation; else delete modulation[key];
  if (motion.keys?.length) animation[key] = motion.keys; else delete animation[key];
  return { ...visual, source: { ...source, shader: { ...shader, parameters: { ...shader.parameters, [key]: parameter.base },
    modulation: Object.keys(modulation).length ? modulation : undefined, animation: Object.keys(animation).length ? animation : undefined } } };
}
