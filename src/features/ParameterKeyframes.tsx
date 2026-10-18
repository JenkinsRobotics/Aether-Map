import { useEffect, useState } from 'react';
import { Button, FieldRow, InspectorActions, NumberField, SelectField } from '@aether/ui';
import { nextId } from '../document';
import { keyframeValue, putKeyframe } from './animation';
import { MAX_PARAMETER_KEYS, MAX_PARAMETER_TIME_S } from './parameter-animation';
import type { FeatureKeyframe } from './types';
import './ParameterKeyframes.css';

/** A parameter lane edits ordinary document keyframes, in the source clock. */
export function ParameterKeyframes({ label, base, keys = [], timeS, min = -1e6, max = 1e6, step = .01, options, disabled=false, onChange }: {
  label: string; base: number; keys?: FeatureKeyframe[]; timeS: number; min?: number; max?: number; step?: number; options?:readonly string[]; disabled?:boolean;
  onChange: (keys: FeatureKeyframe[] | undefined) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null), [time, setTime] = useState(Math.max(0, timeS));
  const [value, setValue] = useState(keyframeValue(keys, time, base)), [curve, setCurve] = useState<FeatureKeyframe['interpolation']>(options?'hold':'linear');
  // Undo, redo and preset recall may replace the selected stored key while this
  // editor remains mounted. Keep the draft aligned without interrupting typing.
  useEffect(() => {
    if (!selected) return;
    const key = keys.find(k => k.id === selected);
    if (key) { setTime(key.timeS); setValue(key.value); setCurve(key.interpolation); }
    else setSelected(null);
  }, [keys, selected]);
  const effective=options?keys.map(k=>({...k,interpolation:'hold' as const})):keys;
  const sorted = [...effective].sort((a, b) => a.timeS - b.timeS), end = Math.max(1, timeS, ...keys.map(k => k.timeS));
  const low = Math.min(base, ...keys.map(k => k.value)), high = Math.max(low + .001, base, ...keys.map(k => k.value));
  const x = (t: number) => 12 + t / end * 376, y = (v: number) => 78 - (v - low) / (high - low) * 64;
  const points = Array.from({ length: 101 }, (_, n) => { const t = n / 100 * end; return `${x(t)},${y(keyframeValue(sorted, t, base))}`; }).join(' ');
  const choose = (key: FeatureKeyframe) => { setSelected(key.id); setTime(key.timeS); setValue(key.value); setCurve(key.interpolation); };
  const save = () => {
    const at = keys.find(k => k.id === selected) ?? keys.find(k => Math.abs(k.timeS - time) < .0001);
    const key = { id: at?.id ?? nextId('parameter-key'), timeS: Math.max(0, Math.min(MAX_PARAMETER_TIME_S, time)), value: Math.max(min, Math.min(max, options?Math.round(value):value)), interpolation: options?'hold' as const:curve };
    onChange(putKeyframe(keys, key)); choose(key);
  };
  return <section className="map-parameter-keyframes" aria-label={`${label} keyframes`}>
    <svg viewBox="0 0 400 96" role="group" aria-label={`${label} automation lane`}>
      <line x1="12" y1="78" x2="388" y2="78" className="map-parameter-axis" />
      <polyline points={points} className="map-parameter-curve" />
      <line x1={x(Math.max(0, timeS))} x2={x(Math.max(0, timeS))} y1="8" y2="82" className="map-parameter-playhead" />
      {sorted.map(key => <circle key={key.id} cx={x(key.timeS)} cy={y(key.value)} r="5" tabIndex={0} role="button"
        aria-label={`Select ${label} keyframe at ${key.timeS}s`} aria-pressed={selected === key.id}
        onClick={() => choose(key)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(key); } }} />)}
      <text x="12" y="94">0 s</text><text x="388" y="94" textAnchor="end">{Number(end.toFixed(2))} s</text>
    </svg>
    <p className="map-hint">Keyframes follow the visual’s source time, including clip trim and looping. The selected curve controls the segment after its key. {options&&'Choices hold until the next key; modulation switches to the nearest choice index.'}</p>
    <FieldRow label="Time"><NumberField aria-label={`${label} keyframe time`} value={time} min={0} max={MAX_PARAMETER_TIME_S} step={.1} unit="s" onValueChange={v => v !== null && setTime(v)} /></FieldRow>
    <FieldRow label="Value">{options?<SelectField aria-label={`${label} keyframe value`} value={String(Math.round(value))} options={options.map((label,i)=>({value:String(i),label}))} onChange={e=>setValue(Number(e.target.value))}/>:<NumberField aria-label={`${label} keyframe value`} value={value} min={min} max={max} step={step} onValueChange={v => v !== null && setValue(v)} />}</FieldRow>
    <FieldRow label="Curve"><SelectField aria-label={`${label} keyframe curve`} value={curve} options={(options?['hold']:['linear','smooth','hold']).map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={e => setCurve(e.target.value as typeof curve)} /></FieldRow>
    <InspectorActions><Button onClick={() => { setSelected(null); setTime(Math.max(0,timeS)); setValue(keyframeValue(effective,timeS,base)); }}>Use playhead</Button>
      <Button onClick={() => { setSelected(null); setTime(Math.max(0,timeS)); setValue(keyframeValue(effective,timeS,base)); setCurve(options?'hold':'linear'); }}>New keyframe</Button>
      <Button disabled={disabled || keys.length >= MAX_PARAMETER_KEYS && !keys.some(k => k.id === selected || Math.abs(k.timeS-time)<.0001)} onClick={save}>{selected && keys.some(k => k.id === selected) ? 'Update keyframe' : 'Add keyframe'}</Button>
      <Button disabled={!selected || !keys.some(k => k.id === selected)} onClick={() => { const next=keys.filter(k=>k.id!==selected); onChange(next.length ? next : undefined); setSelected(null); }}>Remove keyframe</Button>
      <Button disabled={!keys.length} onClick={() => { onChange(undefined); setSelected(null); }}>Clear keyframes</Button></InspectorActions>
  </section>;
}
