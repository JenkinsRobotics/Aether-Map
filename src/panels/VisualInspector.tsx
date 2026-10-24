import { AetherIcon, Button, FieldRow, InspectorSection, MenuButton, PanelHeading, SegmentedControl, TextField } from '@aether/ui';
import type { MapShow } from '../document';
import type { Visual } from '../visual-model';
import { canMoveSimpleVisual, simpleVisuals, visualIsLocked, type SimpleLayerMove } from '../simple-visuals';
import { formatTime } from '../cues';
import { visualSource } from '../media-pool';
import { sourceKind } from '../surface-assets';
import { VisualProperties } from './VisualProperties';
import { AssetTiming } from './AssetTiming';
import './SimpleVisualWorkspace.css';

/** The right sidebar's Properties for a visual — the same in simple and
 * advanced, in plain categories: General, the asset's own controls, and
 * Surfaces. Appearance, Transform and Effects are their own sidebar tabs.
 * Only timeline work differs: `timelines` shows Timing. */
export function VisualInspector({ show, visual, timelines = false, placementFrame, onChange, onDuplicate, onRemove, onMove, onReplace, onPickMedia, onAdvanced }: {
  show: MapShow; visual: Visual; timelines?: boolean; placementFrame?: [number, number, number, number];
  onChange: (visual: Visual, key?: string | null) => void; onDuplicate: () => void; onRemove: () => void;
  onMove: (direction: SimpleLayerMove) => void; onReplace: () => void; onPickMedia: () => void; onAdvanced?: () => void;
}) {
  const locked = visualIsLocked(show, visual);
  const nested = !!visual.timelineRefID;
  const track = show.tracks?.find(t => t.id === visual.trackID);
  if (track?.kind === 'audio') return <VisualProperties visual={visual} show={show} onChange={onChange} onPickMedia={onPickMedia} onDuplicate={onDuplicate} onMove={() => {}} />;
  const kind = nested ? 'Scene' : sourceKind(visualSource(show, visual));
  const layerIDs = [...new Set(simpleVisuals(show).map(v => v.trackID))];
  const layerIndex = layerIDs.indexOf(visual.trackID);
  const scene = show.scenes.find(s => s.id === show.activeSceneId);
  const surfaces = visual.targets.filter(t => t.sceneID === show.activeSceneId)
    .map(t => t.surfaceID ? scene?.surfaces.find(s => s.id === t.surfaceID)?.name ?? 'Missing surface' : 'Entire scene');
  const hidden = visual.enabled === false;
  const menu = [
    { id: 'replace', label: 'Replace layer', icon: <AetherIcon name="import" />, disabled: locked || nested },
    { id: 'duplicate', label: 'Duplicate', icon: <AetherIcon name="items" />, disabled: locked },
    { id: 'visibility', label: hidden ? 'Show layer' : 'Hide layer', icon: <AetherIcon name={hidden ? 'visible' : 'hidden'} />, disabled: locked },
    { id: 'lock', label: visual.locked ? 'Unlock layer' : 'Lock layer', icon: <AetherIcon name="pin_slot" /> },
    { id: 'reset', label: 'Reset placement & effects', icon: <AetherIcon name="restore" />, disabled: locked || nested || (!visual.placement && visual.opacity === 1 && !visual.effects?.length) },
    { id: 'delete', label: 'Delete layer', icon: <AetherIcon name="delete" />, disabled: locked, separatorBefore: true },
  ];
  const act = (id: string) => {
    if (id === 'replace') onReplace();
    else if (id === 'duplicate') onDuplicate();
    else if (id === 'visibility') onChange({ ...visual, enabled: hidden });
    else if (id === 'lock') onChange({ ...visual, locked: !visual.locked });
    else if (id === 'reset') onChange({ ...visual, placement: undefined, opacity: 1, effects: [] });
    else if (id === 'delete') onRemove();
  };
  return <section className="map-simple-inspector" aria-label="Layer properties">
    <PanelHeading actions={<MenuButton label={`Options for ${visual.name}`} items={menu} onSelect={act}><AetherIcon name="more" /></MenuButton>}>
      {visual.name} · {kind}
    </PanelHeading>
    {locked && <p className="map-simple-notice">This layer or its track is locked. Unlock it from the ⋮ menu to edit.</p>}
    {track?.enabled === false && <p className="map-simple-notice">This track is muted.</p>}
    <InspectorSection title="General">
      <FieldRow label="Name"><TextField aria-label="Asset name" disabled={locked} value={visual.name} onChange={e => onChange({ ...visual, name: e.target.value })} /></FieldRow>
      <FieldRow label="Type"><span>{kind}</span></FieldRow>
      {timelines
        ? visual.continuous
          ? <FieldRow label="Playback"><span>Loops for the whole scene</span><Button disabled={locked} onClick={() => onChange({ ...visual, continuous: false })}>Add timing</Button></FieldRow>
          : <AssetTiming clip={visual} onChange={clip => onChange({ ...visual, ...clip })} />
        : <FieldRow label="Playback"><span>{visual.continuous ? 'Loops for the whole scene' : `${formatTime(visual.startS)} – ${formatTime(visual.startS + visual.durationS)}`}</span>
            {!visual.continuous && onAdvanced && <Button onClick={onAdvanced}>Edit timing in advanced</Button>}</FieldRow>}
      <div className="map-simple-layer-order" role="group" aria-label="Layer order">
        <div className="map-simple-section-title"><strong>Layer order</strong><span role="status">{layerIDs.length - layerIndex} of {layerIDs.length} · front to back</span></div>
        <div className="map-simple-layer-buttons">
          <Button appearance="flat" disabled={locked || !canMoveSimpleVisual(show, visual.id, 1)} onClick={() => onMove(1)}>Move forward</Button>
          <Button appearance="flat" disabled={locked || !canMoveSimpleVisual(show, visual.id, -1)} onClick={() => onMove(-1)}>Move backward</Button>
          <Button appearance="flat" disabled={locked || !canMoveSimpleVisual(show, visual.id, 'front')} onClick={() => onMove('front')}>Bring to front</Button>
          <Button appearance="flat" disabled={locked || !canMoveSimpleVisual(show, visual.id, 'back')} onClick={() => onMove('back')}>Send to back</Button>
        </div>
      </div>
    </InspectorSection>
    {/* The asset's own values: a generator's speed and scale, a text's words,
        a video's file and playback, and its presets. */}
    {!nested && <InspectorSection title={`${kind} controls`}>
      <VisualProperties key={visual.id} only="source" simple timing={timelines} visual={visual} show={show} placementFrame={placementFrame}
        onChange={onChange} onPickMedia={onPickMedia} onDuplicate={onDuplicate} onMove={onMove} />
    </InspectorSection>}
    {/* One visual on several surfaces: a copy on each, or one picture across them. */}
    <InspectorSection title="Surfaces">
      <FieldRow label="Applied to"><span>{surfaces.length ? surfaces.join(', ') : 'Nothing yet — click surfaces in the tool bar'}</span></FieldRow>
      {!nested && <FieldRow label="On several surfaces" layout="stacked"
        help={visual.mapping === 'span' ? 'One picture spread across all of them, as if they were one screen.' : 'Each surface shows its own complete copy, playing in sync.'}>
        <SegmentedControl ariaLabel="On several surfaces" value={visual.mapping} disabled={locked}
          onChange={mapping => onChange({ ...visual, mapping: mapping as Visual['mapping'], legacyTrack: undefined })}
          options={[{ id: 'repeat', label: 'Copy on each' }, { id: 'span', label: 'One across all' }]} />
      </FieldRow>}
      {nested && <p className="map-hint">Plays the scene {show.timelines?.find(t => t.id === visual.timelineRefID)?.name}. On Entire scene its own surface assignments apply; on chosen surfaces its whole picture is projected onto each of them, like a generator.</p>}
    </InspectorSection>
  </section>;
}
