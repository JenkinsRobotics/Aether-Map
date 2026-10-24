import { useState } from 'react';
import { Button,FieldRow,SelectField } from '@aether/ui';
import type { MapShow } from '../document';
import type { Visual } from '../visual-model';
import { visualIsLocked } from '../simple-visuals';
import { performanceParameters,setPerformanceMotion } from '../performance/parameters';
import { ParameterKeyframes } from '../features/ParameterKeyframes';
import { ModulationFields } from '../features/ModulationFields';
import { DEFAULT_MODULATION } from '../features/types';
import { useModulation } from '../features/ModulationContext';
import { useVisualMotionInputs } from '../live/use-visual-motion-inputs';

/** Inspector and Main timeline edit the same channels as Performance. */
export function VisualAutomationFields({show,visual,onChange,timeS,scope='visual',initialParameterID=''}:{
 show:MapShow;visual:Visual;onChange:(visual:Visual)=>void;timeS?:number;scope?:'visual'|'all'|'placement'|'opacity'|'source';initialParameterID?:string;
}){
 const shared=useModulation(),inputs=useVisualMotionInputs(),[selected,setSelected]=useState(initialParameterID);
 const parameters=performanceParameters(show,visual,timeS??shared.timeS,inputs.levels,inputs.controls,show.lfos).filter(p=>scope==='all'||scope==='source'&&p.sourceKey||scope==='visual'&&p.visualKey||scope==='opacity'&&p.visualKey==='opacityPercent'||scope==='placement'&&p.group==='Position');
 const parameter=parameters.find(p=>p.id===selected)??parameters[0];
 if(!parameter)return <p className="map-hint">Choose a visual with an editable parameter.</p>;
 return <fieldset disabled={visualIsLocked(show,visual)} className="map-visual-automation">
  <FieldRow label="Parameter"><SelectField aria-label="Automated visual parameter" value={parameter.id}
   options={parameters.map(p=>({value:p.id,label:`${p.group} · ${p.label}`}))} onChange={e=>setSelected(e.target.value)}/></FieldRow>
  <p className="map-hint">Evaluated value: {parameter.options?.[Math.round(parameter.value)]??Number(parameter.value.toFixed(3))}{parameter.unit??''}. Source time: {Number(parameter.timeS.toFixed(3))} s.</p>
  {parameter.modulation?<ModulationFields label={parameter.label} base={parameter.base} value={parameter.modulation}
   onChange={modulation=>onChange(setPerformanceMotion(show,visual,parameter,{keys:parameter.keys,modulation}))}/>
   :<Button disabled={parameter.motionFull} onClick={()=>onChange(setPerformanceMotion(show,visual,parameter,{keys:parameter.keys,modulation:{...DEFAULT_MODULATION,range:{min:parameter.min,max:parameter.max}}}))}>Add {parameter.label} modulation</Button>}
  <ParameterKeyframes key={`${visual.id}:${parameter.id}`} label={parameter.label} base={parameter.base} keys={parameter.keys} timeS={parameter.timeS}
   min={parameter.domainMin??(parameter.effectID?parameter.min:undefined)} max={parameter.domainMax??(parameter.effectID?parameter.max:undefined)} step={parameter.step} options={parameter.options} disabled={parameter.motionFull}
   onChange={keys=>onChange(setPerformanceMotion(show,visual,parameter,{keys,modulation:parameter.modulation}))}/>
  <Button disabled={!parameter.modulation&&!parameter.keys?.length} onClick={()=>onChange(parameter.set(parameter.value,true))}>Use manual {parameter.label.toLowerCase()} control</Button>
  {parameter.motionFull&&<p className="map-hint">This source already has 256 automated channels. Clear an unused channel before adding another.</p>}
  <p className="map-hint">Keyframes set the base before modulation. Manual control clears only this parameter’s motion; Undo restores it.</p>
 </fieldset>;
}
