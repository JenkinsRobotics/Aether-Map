import { STAGE_CONTROLS } from './stage-controls';
import { ShaderAnimationFields } from './ShaderAnimationFields';
import { useState } from 'react';
import { ShaderPresetFields } from './ShaderPresetFields';
import { AudioResponseFields } from './AudioResponseFields';
import { ModulationFields } from './ModulationFields';
import { Button, ColorField, FieldRow, ParameterRow, SelectField } from '@aether/ui';
import { DEFAULT_MODULATION, DEFAULT_SHADER_TIME, type ShaderSource } from './types';
import { newShader, parameterLabel } from './shader-catalog';
import { parameterSliderRange, parameterStep } from './shader-parameter-controls';

/** Friendly controls over the exact same source used by the full shader editor. */
export function SimpleShaderFields({ shader, onChange, showPresets=true, part, keyframes=true }: { showPresets?:boolean; shader: ShaderSource; onChange: (shader: ShaderSource) => void;
  /** Appearance shows the palette ('colors'); Properties the rest ('controls'). Omitted: both. */ part?: 'colors' | 'controls';
  /** Parameter keyframes are change over time: the advanced editor's. */ keyframes?: boolean }) {
  const [details, setDetails] = useState(false);
  const parameters = { ...newShader(shader.preset).parameters, ...shader.parameters };
  const time = { ...DEFAULT_SHADER_TIME, ...shader.time };
  return <div className="map-simple-shader-fields">
    {showPresets&&<ShaderPresetFields shader={shader} onChange={onChange} />}
    {part !== 'controls' && shader.colors.map((color, i) => <FieldRow key={i} label={`Color ${i + 1}`}><ColorField ariaLabel={`Visual color ${i + 1}`} value={color}
      onChange={value => onChange({ ...shader, colors: shader.colors.map((c, n) => n === i ? value : c) })} /></FieldRow>)}
    {part !== 'colors' && <>
    {[...new Set(['speed', 'scale', 'density', 'glow', ...Object.keys(STAGE_CONTROLS[shader.preset]??{})])].filter(key => typeof parameters[key] === 'number').map(key => <ParameterRow key={key}
      label={parameterLabel(key)} ariaLabel={`Visual ${parameterLabel(key).toLowerCase()}`} value={parameters[key] as number} min={0} step={parameterStep(key,shader.preset)}
      sliderRange={parameterSliderRange(key,shader.preset)} onChange={value => onChange({ ...shader, parameters: { ...shader.parameters, [key]: value } })} />)}
    <FieldRow label="Direction"><SelectField aria-label="Visual direction" value={time.direction} options={[{ value: 'forward', label: 'Forward' }, { value: 'reverse', label: 'Reverse' }, { value: 'pingpong', label: 'Back and forth' }]}
      onChange={e => onChange({ ...shader, time: { ...time, direction: e.target.value as typeof time.direction } })} /></FieldRow>
    {keyframes && <ShaderAnimationFields shader={shader} onChange={onChange} />}
    <Button aria-expanded={details} onClick={() => setDetails(v => !v)}>Audio, tempo & modulation</Button>
    {details && <>
      <AudioResponseFields shader={shader} onChange={onChange} />
      <FieldRow label="Animate"><SelectField aria-label="Animate visual parameter" value="" placeholder="Choose a parameter…"
        options={Object.keys(parameters).filter(key => typeof parameters[key] === 'number').map(key => ({ value: key, label: parameterLabel(key) }))}
        onChange={e => { const key = e.target.value, base = Number(parameters[key]) || 1; if (key) onChange({ ...shader, parameters, modulation: { ...shader.modulation, [key]: shader.modulation?.[key] ?? { ...DEFAULT_MODULATION, range: { min: Math.min(0, base), max: Math.max(0, base) } } } }); }} /></FieldRow>
      {Object.entries(shader.modulation ?? {}).map(([key, value]) => <ModulationFields key={key} label={parameterLabel(key)} base={Number(parameters[key]) || 0} value={value}
        onChange={value => { const modulation = { ...shader.modulation }; if (value) modulation[key] = value; else delete modulation[key]; onChange({ ...shader, modulation }); }} />)}
    </>}
    {!details && !!Object.keys(shader.modulation ?? {}).length && <p className="map-hint">Live modulation is assigned. Open Audio, tempo & modulation to adjust or clear it.</p>}
    </>}
  </div>;
}
