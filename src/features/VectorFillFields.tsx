import { ColorField, FieldRow, GradientControls, NumberField, SelectField } from '@aether/ui';
import type { Surface } from '../document';
export function VectorFillFields({ source, onChange }: { source: Surface['source']; onChange: (patch: Partial<Surface['source']>) => void }) {
  const gradient = source.fillGradient;
  return <>
    <FieldRow label="Fill type"><SelectField aria-label="Fill type" value={gradient?.kind ?? 'solid'} options={['solid', 'linear', 'radial'].map(value => ({ value, label: value }))} onChange={e => onChange({
      fillGradient: e.target.value === 'solid' ? undefined : { angleDeg: 0, stops: [{ offset: 0, color: source.fill ?? '#ffffff', opacity: 1 }, { offset: 1, color: '#239bff', opacity: 1 }], ...gradient, kind: e.target.value as 'linear' | 'radial' },
    })} /></FieldRow>
    {gradient ? <GradientControls value={gradient} onChange={fillGradient => onChange({ fillGradient })} /> : <FieldRow label="Colour"><ColorField ariaLabel="Fill colour" value={source.fill ?? '#ffffff'} onChange={fill => onChange({ fill })} /></FieldRow>}
    <FieldRow label="Fill opacity"><NumberField aria-label="Fill opacity" value={(source.fillOpacity ?? 1) * 100} min={0} max={100} unit="%" onCommit={opacity => onChange({ fillOpacity: opacity / 100 })} /></FieldRow>
  </>;
}
