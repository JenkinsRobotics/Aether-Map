import { AetherIcon, Button, IconButton } from '@aether/ui';
import { storeShaderLook, recallShaderLook, randomShaderLook } from './shader-looks';
import type { ShaderSource } from './types';

/** The same persisted A/B/C snapshots in both authoring presentations. */
export function ShaderPresetFields({ shader, onChange }: { shader: ShaderSource; onChange: (shader: ShaderSource) => void }) {
  return <div className="map-feature-buttons" role="group" aria-label="Visual presets">
    {(['A', 'B', 'C'] as const).map(slot => <span key={slot}>
      <Button aria-label={`Recall preset ${slot}`} disabled={!shader.looks?.[slot]} onClick={() => onChange(recallShaderLook(shader, slot))}>{slot}</Button>
      <IconButton label={`Store preset ${slot}`} onClick={() => onChange(storeShaderLook(shader, slot))}><AetherIcon name="save" /></IconButton>
    </span>)}
    <span><Button onClick={() => onChange(randomShaderLook(shader))}>Random</Button></span>
  </div>;
}
