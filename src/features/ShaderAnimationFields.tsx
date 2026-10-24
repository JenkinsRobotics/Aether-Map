import { useState } from 'react';
import { FieldRow, InspectorSection, SelectField } from '@aether/ui';
import { newShader, parameterLabel } from './shader-catalog';
import { ParameterKeyframes } from './ParameterKeyframes';
import { useParameterClock } from './ParameterClock';
import { shaderTimeS } from './shader-motion';
import type { ShaderSource } from './types';

export function ShaderAnimationFields({ shader, onChange }: { shader: ShaderSource; onChange: (shader: ShaderSource) => void }) {
  const parameters = { ...newShader(shader.preset).parameters, ...shader.parameters };
  const options = Object.keys(parameters).filter(k => typeof parameters[k] === 'number');
  const [chosen, setChosen] = useState('');
  const key = options.includes(chosen) ? chosen : options[0], time = useParameterClock();
  return <InspectorSection title="Parameter keyframes" defaultOpen={false}>
    <FieldRow label="Parameter"><SelectField aria-label="Keyframed shader parameter" value={key} options={options.map(value => ({ value, label:parameterLabel(value) }))} onChange={e=>setChosen(e.target.value)}/></FieldRow>
    {key && <ParameterKeyframes key={`${shader.preset}:${key}`} label={parameterLabel(key)} base={Number(parameters[key])} keys={shader.animation?.[key]} timeS={shaderTimeS(shader.time,time)}
      onChange={keys=> { const animation={...shader.animation}; if(keys)animation[key]=keys;else delete animation[key]; onChange({...shader,parameters,animation:Object.keys(animation).length?animation:undefined}); }}/>}
    <p className="map-hint">Keyframes set the parameter before modulation. An absolute modulation range controls the final value; Clear modulation to use the curve directly.</p>
  </InspectorSection>;
}
