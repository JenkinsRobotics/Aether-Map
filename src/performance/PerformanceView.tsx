import { manualSourceEdit } from '../source-motion';
import { MidiControlsButton } from '../live/MidiControls';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AetherIcon, Button, ColorField, Dialog, FieldRow, Inspector, NumberField, SelectField, Slider, Tabs, TextField } from '@aether/ui';
import { activeScene, type MapShow } from '../document';
import { visualSource } from '../media-pool';
import { simpleVisuals, visualIsLocked } from '../simple-visuals';
import type { Visual, VisualEffect } from '../visual-model';
import { visualSurface } from '../visual-document';
import { timelineDuration } from '../timelines';
import { formatTime } from '../cues';
import { ShowPreview } from '../panels/ShowPreview';
import { SourceFields } from '../features/SourceFields';
import { DEFAULT_MODULATION, DEFAULT_SHADER_TIME } from '../features/types';
import { newShader, parameterLabel, shaderOptions } from '../features/shader-catalog';
import { modulationLabel } from '../features/shader-parameter-controls';
import { ModulationFields } from '../features/ModulationFields';
import { ParameterKeyframes } from '../features/ParameterKeyframes';
import { VisualPresetFields } from '../panels/VisualPresetFields';
import { AudioResponseFields } from '../features/AudioResponseFields';
import { useModulation } from '../features/ModulationContext';
import { useLiveLevels } from '../live/use-live-levels';
import { BodyTrackingStatus } from '../body/BodyTrackingControls';
import { useMidi } from '../live/midi';
import { performanceParameters, setPerformanceMotion, type PerformanceParameter } from './parameters';
import './PerformanceView.css';

export interface PerformanceViewProps {
  show: MapShow; urls: Record<string, string>; selectedID: string | null; timeS: number; playing: boolean;
  onSelect: (id: string) => void; onScene: (id: string) => void; onChange: (visual: Visual, key?: string|null) => void;
  onPlay: () => void; onSeek: (timeS: number) => void; onClose: () => void; onPickMedia: (visualID: string) => void;
  onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
  onGestureStart: () => void; onGestureEnd: (cancel?: boolean) => void; readOnly?: boolean;
}

/** Live controls edit the same document and history as both authoring modes. */
export function PerformanceView(props: PerformanceViewProps) {
  const { show, urls, timeS, playing, onChange, onClose, onSelect } = props;
  const root = useRef<HTMLDivElement>(null), gesturing = useRef(false);
  const endGesture = useRef(props.onGestureEnd);
  useEffect(() => { endGesture.current = props.onGestureEnd; }, [props.onGestureEnd]);
  const [fullscreen, setFullscreen] = useState(false), [notice, setNotice] = useState('');
  const [group, setGroup] = useState('All'), [query, setQuery] = useState(''), [detail, setDetail] = useState('');
  const scene = activeScene(show), visuals = simpleVisuals(show).filter(v => !v.timelineRefID && show.tracks?.find(t => t.id === v.trackID)?.kind !== 'audio');
  const visual = visuals.find(v => v.id === props.selectedID) ?? visuals.at(-1);
  const source = visual && visualSource(show, visual), shader = source?.shader;
  const locked = Boolean(props.readOnly || (visual && visualIsLocked(show, visual)));
  const levels = useLiveLevels(), midi = useMidi(), shared = useModulation();
  const parameters = visual ? performanceParameters(show, visual, timeS, levels, midi.controls, shared.lfos) : [];
  const currentDetail = parameters.find(p => p.id === detail);
  const change = (value: Visual, key: string) => { if (!locked) onChange(value, `performance:${value.id}:${key}`); };
  const begin = (target: EventTarget) => {
    if (!locked && target instanceof HTMLInputElement && target.type === 'range' && target.dataset.gesture !== 'transport' && !gesturing.current) {
      gesturing.current = true; props.onGestureStart();
    }
  };
  useEffect(() => {
    const end = () => { if (gesturing.current) { gesturing.current = false; endGesture.current(); } };
    const cancel = () => { if (gesturing.current) { gesturing.current = false; endGesture.current(true); } };
    const sync = () => setFullscreen(document.fullscreenElement === root.current);
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', cancel); window.addEventListener('keyup', end); window.addEventListener('blur', end);
    document.addEventListener('fullscreenchange', sync);
    const element = root.current;
    return () => {
      end(); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel); window.removeEventListener('keyup', end); window.removeEventListener('blur', end);
      document.removeEventListener('fullscreenchange', sync);
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else { setNotice('Full-screen is unavailable in this browser. The performance controls still fill this window.'); return; }
      setNotice('');
    } catch { setNotice('The browser declined full-screen. The controls still fill this window.'); }
  };
  const patchSource = (values: Partial<NonNullable<typeof source>>) => { if (visual && source) change({ ...visual, source: manualSourceEdit(source, { ...source, ...values }) }, 'source'); };
  const patchShader = (values: Partial<NonNullable<typeof shader>>) => { if (shader) patchSource({ shader: { ...shader, ...values } }); };
  const shaderParameters = shader && { ...newShader(shader.preset).parameters, ...shader.parameters };
  const time = { ...DEFAULT_SHADER_TIME, ...shader?.time };
  const filtered = parameters.filter(p => (group === 'All' || p.group === group) && `${p.label} ${p.group}`.toLowerCase().includes(query.toLowerCase()));
  return createPortal(<div className="map-performance-host" ref={root}>
    <Dialog open title="Performance" onClose={onClose}>
      <div className="map-performance">
        <header className="map-performance-toolbar">
          <FieldRow label="Scene"><SelectField aria-label="Performance scene" value={scene.id} options={show.scenes.map(s => ({ value: s.id, label: s.name }))} onChange={e => { setDetail(''); props.onScene(e.target.value); }} /></FieldRow>
          <FieldRow label="Visual"><SelectField aria-label="Performance visual" value={visual?.id ?? ''} placeholder="Add a visual in the editor"
            options={[...visuals].reverse().map(v => ({ value: v.id, label: v.name }))} onChange={e => { setDetail(''); onSelect(e.target.value); }} /></FieldRow>
          <Button onClick={props.onPlay}><AetherIcon name={playing ? 'pause' : 'play'} />{playing ? 'Pause' : 'Play'}</Button>
          <Button onClick={() => props.onSeek(0)}>Restart</Button><span className="map-performance-clock">{formatTime(timeS)}</span>
          <BodyTrackingStatus/><MidiControlsButton/><div className="map-performance-history"><Button disabled={!props.canUndo || props.readOnly} onClick={props.onUndo}>Undo</Button><Button disabled={!props.canRedo || props.readOnly} onClick={props.onRedo}>Redo</Button></div>
          <Button aria-pressed={fullscreen} onClick={() => void toggleFullscreen()}>{fullscreen ? 'Exit full screen' : 'Full screen'}</Button>
        </header>
        {notice && <p role="status">{notice}</p>}
        <div className="map-performance-body">
          <aside className="map-performance-preview">
            <div className="map-performance-picture"><ShowPreview scenePreview show={show} urls={urls} timeS={timeS} playing={playing} /></div>
            <Slider ariaLabel="Performance playhead" value={timeS} min={0} max={Math.max(timelineDuration(show), Math.ceil(timeS))} step={.1} showValue={false} onChange={props.onSeek} />
            <h2>{visual?.name ?? 'Choose a visual'}</h2>
            <p>Live changes are saved with your show. Undo restores an edit.</p>
            {!!show.output.blackout && <p role="status">Output is blacked out.</p>}
            {locked && <p role="status">{props.readOnly ? 'This document is read-only.' : 'This visual or its track is locked.'}</p>}
            {visual?.enabled === false && <p role="status">This visual is hidden.</p>}
            {visual && <fieldset disabled={locked}><Button aria-pressed={visual.enabled !== false} onClick={() => change({ ...visual, enabled: visual.enabled === false }, 'enabled')}>{visual.enabled === false ? 'Show visual' : 'Hide visual'}</Button></fieldset>}
            {visual&&<Inspector><fieldset disabled={locked}><VisualPresetFields show={show} visual={visual} onChange={v=>{if(!locked)onChange(v,null);}}/></fieldset></Inspector>}
            {source && !shader && visual && <details className="map-performance-source"><summary>Source controls</summary><Inspector><fieldset disabled={locked}>
              <SourceFields showPresets={false} surface={{ ...visualSurface(show, visual), clips: [] }} show={show} allowTypeChange={false} showFit={false}
                onPatch={(_, patch) => patch.source && patchSource(patch.source)} onPickMedia={() => props.onPickMedia(visual.id)} />
            </fieldset></Inspector></details>}
            {shader && <Inspector><fieldset disabled={locked}>
              <details className="map-performance-source"><summary>Timing & audio</summary>
                <FieldRow label="Direction"><SelectField aria-label="Performance direction" value={time.direction}
                  options={['forward','reverse','pingpong'].map(value => ({ value, label: value === 'pingpong' ? 'Back and forth' : value }))}
                  onChange={e => patchShader({ time: { ...time, direction: e.target.value as typeof time.direction } })} /></FieldRow>
                <FieldRow label="Time offset"><NumberField aria-label="Performance time offset" value={time.offsetS} unit="s" step={.1} onValueChange={v => v !== null && patchShader({ time: { ...time, offsetS: v } })} /></FieldRow>
                <FieldRow label="Loop every"><NumberField aria-label="Performance loop duration" value={time.loopS} unit="s" min={0} step={.1} onValueChange={v => v !== null && patchShader({ time: { ...time, loopS: v } })} /></FieldRow>
                <Button aria-pressed={time.frozen} onClick={() => patchShader({ time: { ...time, frozen: !time.frozen } })}>{time.frozen ? 'Unfreeze visual' : 'Freeze visual'}</Button>
                <AudioResponseFields shader={shader} onChange={shader => patchSource({ shader })} />
              </details>
            </fieldset></Inspector>}
          </aside>
          <main className="map-performance-controls">
            <div className="map-performance-filter"><Tabs activeID={group} onSelect={setGroup} tabs={['All','Visual','Source','Shader','Position','Effects'].map(id => ({ id, label: id }))} />
              <TextField aria-label="Find performance control" placeholder="Find a control…" value={query} onChange={e => setQuery(e.target.value)} /></div>
            <fieldset disabled={locked} className="map-performance-grid" onPointerDownCapture={e => begin(e.target)} onKeyDownCapture={e => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)) begin(e.target); }}>
              {filtered.map(parameter => <PerformanceFader key={`${visual!.id}:${parameter.id}`} parameter={parameter} disabled={locked}
                effect={visual?.effects?.find(e => e.id === parameter.effectID)}
                onToggleEffect={() => change({ ...visual!, effects: visual!.effects?.map(e => e.id === parameter.effectID ? { ...e, enabled: !e.enabled } : e) }, parameter.id)}
                onChange={(value, manual) => change(parameter.set(value, manual), `${parameter.id}${manual ? ':manual' : ''}`)}
                onDetail={() => { setDetail(detail === parameter.id ? '' : parameter.id); requestAnimationFrame(() => root.current?.querySelector('.map-performance-detail')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })); }} expanded={detail === parameter.id} />)}
              {shader && (group === 'All' || group === 'Shader') && !query && <div className="map-performance-palette"><h3>Colors & style</h3><Inspector>
                {shader.colors.map((color, i) => <FieldRow label={`Color ${i + 1}`} key={i}><ColorField ariaLabel={`Performance color ${i + 1}`} value={color} onChange={color => patchShader({ colors: shader.colors.map((v, n) => i === n ? color : v) })} /></FieldRow>)}
                {Object.entries(shaderParameters!).filter(([key, value]) => typeof value !== 'number' || shaderOptions(shader.preset, key)).map(([key, value]) => {
                  const options = shaderOptions(shader.preset, key), label = parameterLabel(key);
                  return <FieldRow label={label} key={key}>{options ? <SelectField aria-label={`Performance ${label}`} value={String(value)} options={options.map(value => ({ value, label: value }))} onChange={e => patchShader({ parameters: { ...shader.parameters, [key]: e.target.value } })} />
                    : typeof value === 'boolean' ? <Button aria-pressed={value} onClick={() => patchShader({ parameters: { ...shader.parameters, [key]: !value } })}>{value ? 'On' : 'Off'}</Button>
                    : <ColorField ariaLabel={`Performance ${label}`} value={String(value)} onChange={value => patchShader({ parameters: { ...shader.parameters, [key]: value } })} />}</FieldRow>;
                })}
              </Inspector></div>}
            </fieldset>
            {!filtered.length && <p className="map-performance-empty">{visual ? 'No controls match this view. Add effects in the editor to perform with them here.' : 'Add a visual in the editor, then open Performance.'}</p>}
            {currentDetail && visual && <Inspector className="map-performance-detail"><fieldset disabled={locked}>
              <h3>{currentDetail.label} · Motion</h3>
              {currentDetail.motionFull&&<p>This source already has 256 automated channels. Clear an unused channel before adding another.</p>}
              <p>Manual control clears this parameter’s modulation and keys. Undo restores them.</p>
              {currentDetail.modulation ? <ModulationFields label={currentDetail.label} base={currentDetail.base} value={currentDetail.modulation}
                onChange={modulation => change(setPerformanceMotion(show, visual, currentDetail, { modulation, keys: currentDetail.keys }), currentDetail.id)} />
                : <Button disabled={currentDetail.motionFull} onClick={() => change(setPerformanceMotion(show, visual, currentDetail, { keys: currentDetail.keys, modulation: { ...DEFAULT_MODULATION, range: { min: currentDetail.min, max: currentDetail.max } } }), currentDetail.id)}>Add modulation</Button>}
              <ParameterKeyframes key={`${visual.id}:${currentDetail.id}`} min={currentDetail.domainMin ?? (currentDetail.effectID ? currentDetail.min : undefined)} max={currentDetail.domainMax ?? (currentDetail.effectID ? currentDetail.max : undefined)} step={currentDetail.step} options={currentDetail.options} disabled={currentDetail.motionFull} label={currentDetail.label} base={currentDetail.base} keys={currentDetail.keys} timeS={currentDetail.timeS}
                onChange={keys => change(setPerformanceMotion(show, visual, currentDetail, { keys, modulation: currentDetail.modulation }), currentDetail.id)} />
            </fieldset></Inspector>}
          </main>
        </div>
      </div>
    </Dialog>
  </div>, document.body);
}

function PerformanceFader({ parameter: p, disabled, onChange, onDetail, expanded, effect, onToggleEffect }: {
  parameter: PerformanceParameter; disabled: boolean; onChange: (value: number, manual?: boolean) => void;
  onDetail: () => void; expanded: boolean; effect?: VisualEffect; onToggleEffect: () => void;
}) {
  const automated = Boolean(p.modulation || p.keys?.length);
  const value = Number.isFinite(p.value) ? p.value : p.base;
  return <section className={`map-performance-fader${automated ? ' is-automated' : ''}`} aria-label={`${p.label} control`}>
    <header><span>{p.group}</span>{effect && <Button aria-pressed={effect.enabled} aria-label={`${p.label} enabled`} onClick={onToggleEffect}>{effect.enabled ? 'On' : 'Off'}</Button>}</header>
    <h3>{p.label}</h3>
    <Slider ariaLabel={`${p.label} fader`} value={value} min={Math.min(p.min, value)} max={Math.max(p.max, value)} step={p.step} unit={p.unit} showValue={false} disabled={disabled || automated} onChange={value => onChange(value)} />
    {p.options?<SelectField aria-label={`${p.label} value`} value={String(Math.round(value))} disabled={disabled||automated} options={p.options.map((label,i)=>({value:String(i),label}))} onChange={e=>onChange(Number(e.target.value))}/>:<NumberField aria-label={`${p.label} value`} value={value} unit={p.unit} step={p.step} precision={2} disabled={disabled || automated} onValueChange={value => value !== null && onChange(value)} />}
    <footer>{automated ? <><span>{[p.modulation && modulationLabel(p.modulation), p.keys?.length && 'Keyframes'].filter(Boolean).join(' + ')}</span>
      <Button title="Hold this value and clear only this parameter's modulation and keys. Undo restores them." onClick={() => onChange(value, true)}>Use manual control</Button></> : <span>Manual</span>}
      {(p.visualKey || p.sourceKey || p.shaderKey || p.effectID) && <Button aria-expanded={expanded} aria-label={`${p.label} motion`} onClick={onDetail}>Motion</Button>}
    </footer>
  </section>;
}
