import { ANIMATED_PROPERTIES } from "./animation";
import { useState } from 'react';
import { Button, FieldRow, InspectorActions, NumberField, SelectField } from "@aether/ui";
import { nextId, type Surface } from "../document";
import { DEFAULT_MODULATION, type AnimatedProperty } from "./types";
import { keyframeValue, putKeyframe } from "./animation";
import { surfaceParameterAt } from './animation';
import { surfaceParameterBase, SURFACE_PARAMETERS } from './surface-parameters';
import { editSurfaceAutomation, manualSurfaceParameter, surfaceAutomationPatch } from './surface-automation';
import { ModulationFields } from './ModulationFields';
import { useModulation } from './ModulationContext';
import { useVisualMotionInputs } from '../live/use-visual-motion-inputs';
export function AnimationFields({ surface, timeS, durationS, inspector = false, property, onProperty, onSeek, onPatch }: {
  inspector?: boolean; surface: Surface; timeS: number; durationS?: number; property: AnimatedProperty; onProperty: (property: AnimatedProperty) => void;
  onSeek: (timeS: number) => void; onPatch: (id: string, patch: Partial<Surface>) => void;
}) {
  const shared = useModulation(), inputs = useVisualMotionInputs(), [error, setError] = useState('');
  const spec = SURFACE_PARAMETERS.find(p => p.key === property)!;
  const patch = (changes: unknown) => {
    try { onPatch(surface.id, surfaceAutomationPatch(surface, editSurfaceAutomation(surface, changes))); setError(''); }
    catch (e) { setError((e as Error).message); }
  };
  const keys = surface.animation?.[property] ?? [];
  const at = keys.find((k) => Math.abs(k.timeS - timeS) < .0001);
  const fallback = surfaceParameterBase(surface, property);
  const value = keyframeValue(keys, timeS, fallback);
  const evaluated = surfaceParameterAt(surface, property, timeS, { ...inputs, lfos: shared.lfos, sceneTimeS: shared.timeS });
  const modulation = surface.modulation?.[property];
  const setKey = (v: number) => patch({ animation: { [property]: putKeyframe(keys, {
    id: at?.id ?? nextId("key"), timeS, value: v, interpolation: at?.interpolation ?? "linear",
  }) } });
  const propertyControl = <SelectField aria-label="Animated property" value={property} options={ANIMATED_PROPERTIES} onChange={(e) => onProperty(e.target.value as AnimatedProperty)} />;
  const timeControl = <NumberField aria-label="Keyframe time" value={Number(timeS.toFixed(3))} min={0} max={durationS} unit="s" onValueChange={(v) => v !== null && onSeek(v)} />;
  const valueControl = <NumberField aria-label="Animated value" value={Number(value.toFixed(4))} min={spec.min} max={spec.max} step={spec.step} unit={spec.unit} onValueChange={(v) => v !== null && v !== Number(value.toFixed(4)) && setKey(v)} />;
  const interpolationControl = <SelectField aria-label="Keyframe interpolation" value={at?.interpolation ?? "linear"} disabled={!at} options={[{ value: "linear", label: "Linear" }, { value: "smooth", label: "Smooth" }, { value: "hold", label: "Hold" }]} onChange={(e) => at && patch({ animation: { [property]: keys.map((k) => k.id === at.id ? { ...k, interpolation: e.target.value as "linear" | "smooth" | "hold" } : k) } })} />;
  const addControl = <Button onClick={() => setKey(value)}>{at ? "Update keyframe" : "Add keyframe"}</Button>;
  const removeControl = <Button disabled={!at} onClick={() => patch({ animation: { [property]: keys.filter((k) => k.id !== at?.id) } })}>Remove keyframe</Button>;
  return <fieldset disabled={surface.locked} className="map-animation-fields" aria-label="Feature animation">
    {inspector ? <>
      <FieldRow label="Property">{propertyControl}</FieldRow>
      <FieldRow label="Time">{timeControl}</FieldRow>
      <FieldRow label="Value">{valueControl}</FieldRow>
      <FieldRow label="Curve">{interpolationControl}</FieldRow>
      <InspectorActions>{addControl}{removeControl}</InspectorActions>
    </> : <><strong>{surface.name}</strong>{propertyControl}{timeControl}{valueControl}{addControl}{interpolationControl}{removeControl}</>}
    {inspector && <>
      <p className="map-hint">Evaluated: {Number(evaluated.toFixed(3))}{spec.unit}. Keyframes set the base before modulation. Mapping keeps calibration still.</p>
      {property === 'radiusPx' && <p className="map-hint">Corner radius rounds rectangular surfaces. Custom masks and ellipses keep their own outline.</p>}
      {property === 'bendAngleDeg' && <><FieldRow label="Bend axis"><SelectField aria-label="Surface bend axis" value={surface.bend?.axis ?? 'horizontal'} options={[{value:'horizontal',label:'Horizontal'},{value:'vertical',label:'Vertical'}]} onChange={e=>patch({bend_axis:e.target.value})}/></FieldRow><p className="map-hint">Bend warps visuals mapped with Repeat; Span keeps its shared picture across surfaces.</p></>}
      {modulation ? <ModulationFields label={spec.label} base={fallback} value={modulation} surfaceClock min={spec.min} max={spec.max} onChange={m=>patch({modulation:{[property]:m ?? null}})}/>
        : <Button onClick={()=>patch({modulation:{[property]:{...DEFAULT_MODULATION,amount:property==='opacity'?.25:property.startsWith('scale')?.25:property==='rotationDeg'||property==='bendAngleDeg'?30:100}}})}>Add {spec.label} modulation</Button>}
      <Button disabled={!modulation&&!keys.length} onClick={()=>{
        try { onPatch(surface.id, surfaceAutomationPatch(surface, manualSurfaceParameter(surface,property,evaluated))); setError(''); } catch(e) { setError((e as Error).message); }
      }}>Use manual {spec.label.toLowerCase()} control</Button>
    </>}
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}
