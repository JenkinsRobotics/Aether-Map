import { VisualPresetFields } from './VisualPresetFields';
import { manualSourceEdit, sourceParameters } from '../source-motion';
import { VisualAutomationFields } from './VisualAutomationFields';
import { setVisualMotionBase } from '../visual-motion';
import { visualSourceTime } from '../visual-clock';
import { ParameterClock } from '../features/ParameterClock';
import { EffectMotionFields } from '../features/EffectMotionFields';
import { useModulation } from '../features/ModulationContext';
import { VISUAL_EFFECTS, effectDefinition, effectAmount, newVisualEffect, type VisualEffectKind } from '../visual-effects';
import { SimpleShaderFields } from '../features/SimpleShaderFields';
import { contentBounds, measureTextBounds } from '../content-bounds';
import { visualSource } from '../media-pool';
import { sameVisualTarget, setVisualTarget, setSceneSurfaceTargets } from '../visual-targets';
import './VisualProperties.css';
import { useState, type ReactNode } from 'react';
import { AetherIcon, Button, Checkbox, FieldRow, InspectorActions, InspectorSection, ParameterRow, SegmentedControl, SelectField, TextField } from '@aether/ui';
import { nextId, type MapShow, type Rect } from '../document';
import type { Visual, VisualTarget } from '../visual-model';
import { visualSurface } from '../visual-document';
import { SourceFields } from '../features/SourceFields';
import { SourceCropFields } from '../features/SourceCropFields';
import { AssetTiming } from './AssetTiming';
import { PlacementFields } from './PlacementFields';
import { readVisualPlacement, visualPlacementFrame } from '../visual-placement';
import { VISUAL_FIT } from '../visual-render';

export function VisualProperties({ visual, show, placementFrame, onChange, onPickMedia, onDuplicate, onMove, simple, actions, activeTab, onTabChange, onPerformance, only, timing }: {
  visual: Visual; show: MapShow; onChange: (visual: Visual,key?:string|null) => void; onPickMedia: () => void;
  placementFrame?: Rect; onPerformance?: () => void;
  /** One category alone, for the right sidebar: Properties ('source'),
   * Appearance, Transform and Effects each render theirs. */
  only?: 'effects' | 'source' | 'appearance' | 'transform';
  simple?: boolean; /** Timeline timing fields; defaults to the advanced editor. */ timing?: boolean; actions?: ReactNode; activeTab?: string; onTabChange?: (tab: string) => void;
  onDuplicate: () => void; onMove: (direction: -1 | 1) => void;
}) {
  const locked = visual.locked || show.tracks?.find(t => t.id === visual.trackID)?.locked;
  const source = visualSource(show, visual);
  const layerIndex = show.visuals?.findIndex(v => v.id === visual.id) ?? -1;
  const [localTab, setLocalTab] = useState('adjust');
  const tab = only === 'transform' ? 'fit' : only === 'source' || only === 'appearance' ? 'adjust' : only ?? activeTab ?? localTab, setTab = onTabChange ?? setLocalTab;
  const [effect, setEffect] = useState('blur');
  const patch = (values: Partial<Visual>) => onChange({ ...visual, ...values, ...(values.source ? {source:manualSourceEdit(source,values.source)} : {}) });
  const check = (target: VisualTarget, label: string) => <Checkbox key={target.surfaceID ?? target.sceneID} label={label}
    checked={visual.targets.some(t => sameVisualTarget(t, target))} onChange={e => onChange(setVisualTarget(visual, target, e.target.checked))} />;
  const media = show.media.find(m => m.id === source.mediaId), shared = useModulation();
  const localTime = visualSourceTime(show,visual,shared.timeS);
  const view = { ...visualSurface(show, visual), clips: [] };
  const timed = timing ?? !simple;
  if (visual.timelineRefID && !only) return <section className="map-properties" aria-label="Timeline clip properties">
    <fieldset className="map-asset-fields" disabled={locked}><FieldRow label="Name"><TextField aria-label="Timeline clip name" value={visual.name} onChange={e => patch({ name:e.target.value })} /></FieldRow>
    <InspectorSection title="Visual motion" defaultOpen={false}><VisualAutomationFields show={show} visual={visual} onChange={onChange} scope="opacity"/></InspectorSection>
    <InspectorSection title="Timing"><AssetTiming clip={visual} onChange={clip => patch(clip)} /></InspectorSection>
    <p className="map-hint">Uses {show.timelines?.find(t => t.id === visual.timelineRefID)?.name}. Open that timeline from the Timelines tab to edit its layers and surface assignments. Changes update every use.</p></fieldset>
  </section>;
  if (show.tracks?.find(t => t.id === visual.trackID)?.kind === 'audio' && !only) return <section className="map-properties" aria-label="Audio clip properties">
    <fieldset className="map-asset-fields" disabled={locked}><FieldRow label="Name"><TextField aria-label="Audio clip name" value={visual.name} onChange={e => patch({ name: e.target.value })} /></FieldRow>
    <InspectorSection title="Timing"><AssetTiming audio clip={visual} onChange={clip => patch(clip)} /></InspectorSection>
    <p className="map-hint">Soundtrack audio plays once from the Main timeline. Track volume, mute and solo are in Advanced mode.</p></fieldset>
  </section>;
  const shown = (part: 'source' | 'appearance') => !only || only === part || (only !== 'source' && only !== 'appearance');
  return <section className="map-properties" aria-label={only === 'effects' ? 'Visual effects' : only === 'appearance' ? 'Visual appearance' : only === 'transform' ? 'Visual transform' : only === 'source' ? 'Source controls' : 'Asset properties'}>
    {!only && <FieldRow label="Name"><TextField aria-label="Asset name" disabled={locked} value={visual.name} onChange={e => patch({ name: e.target.value })} /></FieldRow>}
    {!only && onPerformance && <Button onClick={onPerformance}><AetherIcon name="sliders" />Performance</Button>}
    {!only && <SegmentedControl ariaLabel="Visual properties" value={tab} onChange={setTab} options={['Adjust', 'Fit', 'Targets'].map((label, index) => ({ id: label.toLowerCase(), label: simple && label === 'Targets' ? 'Shapes' : label, icon: <AetherIcon name={['sliders', 'fit', 'surface'][index]} /> }))} />}
    {/* Effects are the right sidebar's own Effects tab (only="effects"). */}
    <ParameterClock.Provider value={localTime}><fieldset className="map-asset-fields" disabled={locked}>
      {tab === 'targets' && (simple ? actions : <>
        <FieldRow label="Mapping" help={visual.mapping === 'span' ? 'One shared window across the selected outlines. This does not unfold or wrap a box.' : 'Each target displays the complete visual, with shared timing and settings.'}><SelectField aria-label="Visual mapping" value={visual.mapping} options={[{ value: 'repeat', label: 'Repeat on surfaces' }, { value: 'span', label: 'Span across surfaces' }]} onChange={e => patch({ mapping: e.target.value as Visual['mapping'], legacyTrack: undefined })} /></FieldRow>
        {show.scenes.map(scene => <InspectorSection key={scene.id} title={scene.name}>
          {check({ sceneID: scene.id }, `${scene.name} · Entire scene`)}
          {scene.surfaces.filter(s => !s.sceneCanvas && s.kind !== 'mask').map(s => check({ sceneID: scene.id, surfaceID: s.id }, s.name))}
          <Button onClick={() => onChange(setSceneSurfaceTargets(visual, scene, true))}>Select all surfaces in {scene.name}</Button>
        </InspectorSection>)}
        <Button onClick={() => patch({ targets: [], legacyTrack: undefined })}>Clear targets</Button>
        <InspectorSection title="Layer order">
        <InspectorActions><Button disabled={layerIndex <= 0} onClick={() => onMove(-1)}>Move backward</Button><Button disabled={layerIndex < 0 || layerIndex === (show.visuals?.length ?? 0) - 1} onClick={() => onMove(1)}>Move forward</Button>
        <Button onClick={onDuplicate}>Duplicate as independent visual</Button></InspectorActions></InspectorSection>
      </>)}
      {tab === 'adjust' && <>
        {/* The source's own controls first (a generator's colors, speed…). */}
        {shown('source') && (simple && source.shader ? <SimpleShaderFields showPresets={false} part={only === 'source' ? 'controls' : undefined} keyframes={timed} shader={source.shader} onChange={shader => patch({ source: { ...source, shader } })} /> : <SourceFields showPresets={false} allowTypeChange={false} showFit={Boolean(source.mediaId && !source.shader)} surface={{ ...view, source: { ...view.source, fit: view.source.fit ?? VISUAL_FIT } }} show={show} onPatch={(_, values) => values.source && patch({ source: values.source })} onPickMedia={onPickMedia} />)}
        {/* Appearance: how it looks wherever it lands — opacity, then a generator's palette. */}
        {shown('appearance') && <ParameterRow label="Opacity" ariaLabel="Visual opacity" value={visual.opacity * 100} min={0} max={100} sliderRange={{ min: 0, max: 100 }} unit="%" onChange={v => onChange(setVisualMotionBase(visual,{opacityPercent:v},true))} />}
        {only === 'appearance' && source.shader && <InspectorSection title="Palette"><SimpleShaderFields showPresets={false} part="colors" shader={source.shader} onChange={shader => patch({ source: { ...source, shader } })} /></InspectorSection>}
        {shown('source') && <InspectorSection title="Presets"><VisualPresetFields show={show} visual={visual} onChange={onChange}/></InspectorSection>}
        {/* Change over time is the advanced editor's: simple is one moment. */}
        {timed && shown('appearance') && <InspectorSection title="Visual motion" defaultOpen={false}><VisualAutomationFields show={show} visual={visual} onChange={onChange}/></InspectorSection>}
        {timed && shown('source') && !!sourceParameters(source,media).length && <InspectorSection title="Source motion" defaultOpen={false}><VisualAutomationFields show={show} visual={visual} onChange={onChange} scope="source"/></InspectorSection>}
        {timed && !only && <InspectorSection title="Timing">{visual.continuous ? <FieldRow label="Playback"><Button onClick={() => patch({ continuous: false })}>Add timing</Button></FieldRow> : <AssetTiming clip={visual} onChange={clip => patch(clip)} />}</InspectorSection>}
      </>}
      {tab === 'fit' && <>
        <PlacementFields value={visual.placement} frame={placementFrame ?? visualPlacementFrame(show,visual)} bounds={contentBounds(source,placementFrame ?? visualPlacementFrame(show,visual),measureTextBounds(source))} onChange={placement=>{const base=readVisualPlacement(visual.placement);onChange(setVisualMotionBase(visual,Object.fromEntries(Object.entries(readVisualPlacement(placement)).filter(([key,value])=>placement===undefined||base[key as keyof typeof base]!==value)),true));}}/>
        {timed && <InspectorSection title="Placement motion" defaultOpen={false}><VisualAutomationFields show={show} visual={visual} onChange={onChange} scope="placement"/></InspectorSection>}
        <InspectorSection title="Fit & crop">
        <FieldRow label="Content placement"><SelectField aria-label="Content placement" value={source.fit ?? VISUAL_FIT} options={[{ value: 'stretch', label: 'Stretch' }, { value: 'contain', label: 'Fit · keep whole input' }, { value: 'cover', label: 'Fill · crop' }]} onChange={e => patch({ source: { ...source, fit: e.target.value as NonNullable<Visual['source']>['fit'] } })} /></FieldRow>
        {media && <SourceCropFields media={media} rect={source.rect} onChange={rect => patch({ source: { ...source, rect } })} />}
        </InspectorSection>
      </>}
      {tab === 'effects' && <>
        <FieldRow label="Effect"><SelectField aria-label="Effect type" value={effect} options={VISUAL_EFFECTS.map(e => ({ value: e.value, label: e.label }))} onChange={e => setEffect(e.target.value)} /></FieldRow>
        <Button disabled={(visual.effects?.length ?? 0) >= 12} onClick={() => patch({ effects: [...(visual.effects ?? []), newVisualEffect(effect as VisualEffectKind, nextId('effect'))] })}>Add effect</Button>
        <p className="map-hint">Effects run from top to bottom. Up to 12 per visual.</p>
        {(visual.effects ?? []).map((entry, index, all) => <div key={entry.id} className="map-visual-effect">
          <Checkbox label={effectDefinition(entry.kind).label} checked={entry.enabled} onChange={e => patch({ effects: all.map(v => v.id === entry.id ? { ...v, enabled: e.target.checked } : v) })} />
          <p className="map-hint">{effectDefinition(entry.kind).help}</p>
          <ParameterRow label={effectDefinition(entry.kind).amountLabel} ariaLabel={`${entry.kind} amount`} value={entry.amount}
            min={effectDefinition(entry.kind).min} max={effectDefinition(entry.kind).max} step={effectDefinition(entry.kind).step}
            sliderRange={{ min: effectDefinition(entry.kind).min, max: effectDefinition(entry.kind).max }}
            onChange={amount => patch({ effects: all.map(v => v.id === entry.id ? { ...v, amount: effectAmount(v.kind, amount) } : v) })} />
          {timed && <EffectMotionFields effect={entry} label={`${effectDefinition(entry.kind).label} ${index + 1}`} onChange={effect => patch({ effects: all.map(v => v.id === effect.id ? effect : v) })} />}
          <InspectorActions><Button disabled={index === 0} onClick={() => { const next = [...all]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; patch({ effects: next }); }}>Move effect up</Button>
          <Button disabled={index === all.length - 1} onClick={() => { const next = [...all]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; patch({ effects: next }); }}>Move effect down</Button>
          <Button onClick={() => patch({ effects: all.filter(v => v.id !== entry.id) })}>Remove effect</Button></InspectorActions>
        </div>)}
      </>}
    </fieldset></ParameterClock.Provider>
  </section>;
}
