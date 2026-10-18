import { VectorFillFields } from '../features/VectorFillFields';
import { useState } from 'react';
import { ColorField, FieldRow, InspectorSection, ParameterRow, SelectField } from '@aether/ui';
import type { Surface } from '../document';

const SWATCHES = ['#ffffff', '#d1d5db', '#6b7280', '#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#fca5a5', '#a7f3d0'];
export function ColorPanel({ surface, backdrop = false, onPatch }: { surface: Surface | null; backdrop?: boolean; onPatch: (id: string, patch: Partial<Surface>) => void }) {
  const [colorIndex, setColorIndex] = useState('0');
  if (!surface) return <div className="map-hint">Select a layer to edit its color and opacity.</div>;
  const source = surface.source, index = Math.min(Number(colorIndex), Math.max(0, (source.shader?.colors.length ?? 1) - 1));
  const color = backdrop ? null : source.text?.color ?? source.fill ?? source.tracker?.color ?? source.shader?.colors[index] ?? (!source.mediaId && !source.webcam && !source.testPattern ? "#ffffff" : null);
  const label = source.text ? 'Text color' : source.shader ? 'Shader color' : source.tracker ? 'Tracker color' : 'Fill color';
  const apply = (value: string) => {
    const next = source.text ? { ...source, text: { ...source.text, color: value } }
      : source.tracker ? { ...source, tracker: { ...source.tracker, color: value } }
      : source.shader ? { ...source, shader: { ...source.shader, colors: source.shader.colors.map((c, i) => i === index ? value : c) } }
      : { ...source, fill: value };
    onPatch(surface.id, { source: next });
  };
  const vectorFill = !backdrop && !source.text && !source.shader && !source.tracker && !!(source.fill || source.fillGradient);
  return <section className="map-properties" aria-label="Layer color">
    <div className="map-hint">{surface.name}</div>
    <InspectorSection title="Appearance">{source.shader && <FieldRow label="Palette color"><SelectField aria-label="Shader palette color" value={String(index)} options={source.shader.colors.map((_, i) => ({ value: String(i), label: `Color ${i + 1}` }))} onChange={e => setColorIndex(e.target.value)} /></FieldRow>}
    {vectorFill && <VectorFillFields source={source} onChange={patch => onPatch(surface.id, { source: { ...source, ...patch } })} />}
    {!vectorFill && color && <>
      <div className="map-color-preview" style={{ background: color }} />
      <FieldRow label={label}><ColorField ariaLabel="Layer color" value={color} onChange={apply} /></FieldRow>
      <div className="map-color-swatches" aria-label="Color swatches">{SWATCHES.map(c => <button key={c} aria-label={`Set color ${c}`} title={c} style={{ background: c }} onClick={() => apply(c)} />)}</div>
    </>}
    {!color && <p className="map-hint">{backdrop ? 'The backdrop keeps its image colors and appears only in the editor.' : 'This source supplies its own colors. Choose Colour in the feature properties to use a solid fill.'}</p>}
    <ParameterRow label="Opacity" ariaLabel="Layer opacity" min={0} max={100} step={1} unit="%" sliderRange={{ min: 0, max: 100 }} value={Math.round(surface.opacity * 100)} onChange={opacity => onPatch(surface.id, { opacity: opacity / 100 })} />
    {!backdrop && <FieldRow label="Layer marker"><ColorField ariaLabel="Layer marker color" value={surface.color} onChange={color => onPatch(surface.id, { color })} /></FieldRow>}
    </InspectorSection>
  </section>;
}
