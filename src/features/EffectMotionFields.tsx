import { Button, InspectorSection } from '@aether/ui';
import type { VisualEffect } from '../visual-model';
import { effectDefinition } from '../visual-effects';
import { DEFAULT_MODULATION } from './types';
import { ModulationFields } from './ModulationFields';
import { ParameterKeyframes } from './ParameterKeyframes';
import { useParameterClock } from './ParameterClock';

export function EffectMotionFields({ effect, label, onChange }: { effect: VisualEffect; label: string; onChange: (effect: VisualEffect) => void }) {
  const spec = effectDefinition(effect.kind), timeS = useParameterClock();
  return <InspectorSection title={`Animate ${label}`} defaultOpen={false}>
    {effect.modulation ? <ModulationFields label={label} base={effect.amount} value={effect.modulation} onChange={modulation => onChange({ ...effect, modulation })}/>
      : <Button onClick={() => onChange({ ...effect, modulation: { ...DEFAULT_MODULATION, range: { min:spec.min, max:spec.max } } })}>Add {label} modulation</Button>}
    <ParameterKeyframes label={label} base={effect.amount} keys={effect.animation} timeS={timeS} min={spec.min} max={spec.max} step={spec.step}
      onChange={animation => onChange({ ...effect, animation })}/>
    <p className="map-hint">Keyframes set the amount before modulation. An absolute range controls the final amount. Clear modulation to follow keyframes directly.</p>
  </InspectorSection>;
}
