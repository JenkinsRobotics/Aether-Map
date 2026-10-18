import { MidiControls } from '../live/MidiControls';
import { BodyTrackingControls } from '../body/BodyTrackingControls';
import { BODY_SIGNALS, type BodySignal } from '../body/signals';
import { useEffect, useState } from 'react';
import { AetherIcon, Button, Checkbox, FieldRow, IconButton, NumberField, SelectField } from '@aether/ui';
import { DEFAULT_MODULATION, type ShaderModulation } from './types';
import { useModulation } from './ModulationContext';
import { useAudio } from '../live/audio';
import { midiState, subscribeMidi, startMidi, useMidi } from '../live/midi';

const WAVES = ['sine', 'triangle', 'square', 'ramp'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
/** One parameter assignment, reused by visual and post-effect controls. */
export function ModulationFields({ label, base, value, onChange, surfaceClock = false, min = -Infinity, max = Infinity }: {
  label: string; base: number; value: ShaderModulation; onChange: (value: ShaderModulation | undefined) => void;
  surfaceClock?: boolean;
  min?: number; max?: number;
}) {
  const m = { ...DEFAULT_MODULATION, ...value }, shared = useModulation(), midi = useMidi(), audio = useAudio();
  const [learnAt, setLearnAt] = useState<number | null>(null);
  const set = (patch: Partial<ShaderModulation>) => onChange({ ...m, ...patch });
  useEffect(() => {
    if (learnAt === null) return;
    return subscribeMidi(() => {
      const next = midiState();
      if (next.eventSerial > learnAt && next.lastControl !== null) {
        onChange({ ...value, control: next.lastControl }); setLearnAt(null);
      }
    });
  }, [learnAt, value, onChange]);
  const lfo = shared.lfos[m.lfoIndex ?? 0];
  const cycle = m.source === 'lfo' ? lfo : m;
  const setCycle = (patch: Partial<typeof lfo>) => m.source === 'lfo'
    ? shared.onLfos?.(shared.lfos.map((entry, i) => i === (m.lfoIndex ?? 0) ? { ...entry, ...patch } : entry)) : set(patch);
  return <section className="map-shader-modulation" aria-label={`${label} modulation`}>
    <div className="map-shader-heading"><span>{label} modulation</span>
      <IconButton label={`Clear ${label} modulation`} onClick={() => onChange(undefined)}><AetherIcon name="close" /></IconButton>
    </div>
    <FieldRow label="Driven by"><SelectField aria-label={`${label} source`} value={m.source ?? 'time'}
      options={[{ value: 'time', label: 'Time cycle' }, { value: 'lfo', label: 'Shared LFO' }, { value: 'audio', label: 'Audio' }, { value: 'midi', label: 'MIDI fader' }, { value: 'body', label: 'Body tracking' }]}
      onChange={e => { setLearnAt(null); set({ source: e.target.value as ShaderModulation['source'] }); }} /></FieldRow>
    <Checkbox label={`${label} use range`} checked={Boolean(m.range)}
      onChange={e => set({ range: e.target.checked ? { min: Math.max(min, base - Math.abs(m.amount)), max: Math.min(max, base + Math.abs(m.amount)) } : undefined })} />
    {m.range ? <>
      <FieldRow label="Minimum"><NumberField aria-label={`${label} minimum`} value={m.range.min} min={Number.isFinite(min)?min:undefined} max={m.range.max} step={.05}
        onValueChange={v => v !== null && set({ range: { min: Math.min(v, m.range!.max), max: m.range!.max } })} /></FieldRow>
      <FieldRow label="Maximum"><NumberField aria-label={`${label} maximum`} value={m.range.max} max={Number.isFinite(max)?max:undefined} min={m.range.min} step={.05}
        onValueChange={v => v !== null && set({ range: { min: m.range!.min, max: Math.max(v, m.range!.min) } })} /></FieldRow>
    </> : <FieldRow label="Amount"><NumberField aria-label={`${label} amount`} value={m.amount} step={.05}
      onValueChange={v => v !== null && set({ amount: v })} /></FieldRow>}
    <Button aria-label={`Flip ${label} modulation`} aria-pressed={Boolean(m.invert)} onClick={() => set({ invert: !m.invert })}><AetherIcon name="flip-horizontal" /> Flip</Button>
    {m.source === 'audio' && !audio.listening && <p className="map-hint">{audio.status}. Turn on Audio or open Configure audio.</p>}
    {m.source === 'body' ? <>
      <FieldRow label="Movement"><SelectField aria-label={`${label} body signal`} value={m.bodySignal ?? 'x'} options={BODY_SIGNALS.map(s=>({value:s.value,label:s.label}))} onChange={e=>set({bodySignal:e.target.value as BodySignal})}/></FieldRow>
      <p className="map-hint">{BODY_SIGNALS.find(s=>s.value===(m.bodySignal??'x'))!.help}</p><BodyTrackingControls/>
    </> : m.source === 'midi' ? <>
      <FieldRow label="Controller"><NumberField aria-label={`${label} controller`} value={m.control ?? 1} min={0} max={127} step={1}
        onValueChange={v => v !== null && set({ control: Math.max(0, Math.min(127, Math.round(v))) })} /></FieldRow>
      <Button aria-pressed={learnAt !== null} onClick={() => {
        if (learnAt !== null) setLearnAt(null);
        else { setLearnAt(midi.eventSerial); if (!midi.connected) void startMidi(); }
      }}><AetherIcon name="mouse" />{learnAt !== null ? 'Cancel MIDI Learn' : 'MIDI Learn'}</Button>
      {learnAt !== null && <p role="status">Move a controller to assign it. {midi.status}</p>}
      <details><summary>Configure MIDI</summary><MidiControls/></details>
      <IconButton label="Use the last fader moved" disabled={midi.lastControl === null} onClick={() => midi.lastControl !== null && set({ control: midi.lastControl })}><AetherIcon name="mouse" /></IconButton>
    </> : m.source === 'audio' ? <FieldRow label="Audio band"><SelectField aria-label={`${label} band`} value={m.audioSignal === 'beat' ? 'beat' : m.band ?? 'level'}
      options={[{ value: 'beat', label: 'Beat pulse' }, { value: 'low', label: 'Bass' }, { value: 'mid', label: 'Mids' }, { value: 'high', label: 'Treble' }, { value: 'level', label: 'Volume' }]}
      onChange={e => set(e.target.value === 'beat' ? { audioSignal: 'beat' } : { audioSignal: undefined, band: e.target.value as ShaderModulation['band'] })} /></FieldRow> : <>
      {(m.source ?? 'time') === 'time' && <FieldRow label="Clock"><SelectField aria-label={`${label} clock`} value={m.clock ?? 'source'} options={[{value:'source',label:surfaceClock?'Surface timeline time':'Visual source time'},{value:'scene',label:'Scene time'}]} onChange={e=>set({clock:e.target.value === 'scene' ? 'scene' : undefined})}/></FieldRow>}
      {m.source === 'lfo' && <FieldRow label="Oscillator"><SelectField aria-label={`${label} LFO`} value={String(m.lfoIndex ?? 0)}
        options={[0, 1, 2, 3].map(i => ({ value: String(i), label: `LFO ${i + 1}` }))} onChange={e => set({ lfoIndex: Number(e.target.value) })} /></FieldRow>}
      <FieldRow label="Period"><NumberField aria-label={`${label} period`} value={cycle.periodS} unit="s" min={.02} max={3600} step={.1}
        onValueChange={v => v !== null && setCycle({ periodS: Math.max(.02, v) })} /></FieldRow>
      <FieldRow label="Waveform"><SelectField aria-label={`${label} waveform`} value={cycle.waveform} options={WAVES}
        onChange={e => setCycle({ waveform: e.target.value as ShaderModulation['waveform'] })} /></FieldRow>
      <FieldRow label="Phase"><NumberField aria-label={`${label} phase`} value={cycle.phase} step={.05}
        onValueChange={v => v !== null && setCycle({ phase: v })} /></FieldRow>
      {m.source === 'lfo' && <p className="map-hint">Changes affect every parameter assigned to LFO {(m.lfoIndex ?? 0) + 1}. Shared oscillators follow scene time, independent of clip offsets.</p>}
    </>}
  </section>;
}
