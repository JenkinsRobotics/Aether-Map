import { Button, Checkbox, ColorField, FieldRow, InspectorActions, InspectorSection, ParameterRow } from '@aether/ui';
import { DEFAULT_CHROMA_KEY, type ChromaKey } from './chroma-key';

export function ChromaKeyFields({ value, onChange }: { value?: ChromaKey; onChange: (value: ChromaKey) => void }) {
  const settings = value ?? { ...DEFAULT_CHROMA_KEY, enabled: false };
  const patch = (change: Partial<ChromaKey>) => onChange({ ...settings, ...change });
  return <InspectorSection title="Green screen">
    <Checkbox label="Remove background color" checked={settings.enabled} onChange={e => patch({ enabled: e.target.checked })} />
    {settings.enabled && <>
      <InspectorActions><Button onClick={() => patch({ color: '#00ff00' })}>Green</Button><Button onClick={() => patch({ color: '#0000ff' })}>Blue</Button></InspectorActions>
      <FieldRow label="Key color"><ColorField ariaLabel="Key color" value={settings.color} onChange={color => patch({ color })} /></FieldRow>
      {([['similarity', 'Tolerance'], ['softness', 'Edge softness'], ['spill', 'Spill suppression']] as const).map(([key, label]) =>
        <ParameterRow key={key} label={label} ariaLabel={label} value={settings[key] * 100} min={0} max={100} sliderRange={{ min: 0, max: 100 }} unit="%" onChange={amount => patch({ [key]: amount / 100 })} />)}
      <p className="map-hint">Choose the background color, then increase tolerance until it disappears. Edge softness blends the outline; spill suppression reduces colored fringes.</p>
    </>}
  </InspectorSection>;
}
