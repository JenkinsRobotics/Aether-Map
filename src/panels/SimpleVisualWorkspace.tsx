import type { BundledLoop } from '../features/bundled-loops';
import { DrawnMedia } from '../features/DrawnMedia';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AetherIcon, Button, Dialog, FieldRow, IconButton, Inspector, SelectField, Slider } from '@aether/ui';
import { activeScene, type MapShow, type Surface } from '../document';
import type { Visual } from '../visual-model';
import { visualSource } from '../media-pool';
import { visualSurface } from '../visual-document';
import { canMoveSimpleVisual, simpleVisuals, visualIsLocked, type SimpleLayerMove } from '../simple-visuals';
import { timelineDuration, timelineName } from '../timelines';
import { mediaTime } from '../clips';
import { formatTime } from '../cues';
import { poolSource, POOL_SOURCES, type PoolSourceKind } from '../pool-sources';
import { sceneSize } from '../scene-size';
import { ShaderThumbnail } from '../features/ShaderThumbnail';
import { VisualGallery } from './VisualGallery';
import { VisualProperties } from './VisualProperties';
import { InputPreview } from './InputPreview';
import { ShowPreview } from './ShowPreview';
import { SurfacesStrip } from './SurfacesStrip';
import './ShowWorkspace.css';
import './SimpleVisualWorkspace.css';

export interface SimpleVisualWorkspaceProps {
  agentTools?: ReactNode; onPerformance?: () => void;
  show: MapShow; urls: Record<string, string>; selectedID: string | null;
  timeS: number; playing: boolean; onPlay: () => void; onSeek: (time: number) => void;
  onSelect: (id: string) => void; onScene: (id: string) => void;
  onAdd: (source: Surface['source'], name: string, poolID?: string) => void;
  onReplace: (id: string, source: Surface['source'], name: string) => void;
  onChange: (visual: Visual,key?:string|null) => void; onDuplicate: (visual: Visual) => void;
  onMove: (visual: Visual, direction: SimpleLayerMove) => void; onRemove: (visual: Visual) => void;
  onLoop?: (file:File,loop:BundledLoop,replaceID?:string)=>Promise<boolean>;
  onImport: (replaceID?: string) => void; onMapping: () => void; onAdvanced: () => void;
}

/** Presentation only: all mutations go through the editor's normal undo path. */
export function SimpleVisualWorkspace(props: SimpleVisualWorkspaceProps) {
  const { show, urls, selectedID, timeS, playing, onPlay, onSeek, onSelect, onScene, onAdd, onReplace, onChange,
    onDuplicate, onMove, onRemove, onImport, onMapping, onAdvanced } = props;
  const [gallery, setGallery] = useState<'add' | string | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  const [tab, setTab] = useState('targets');
  const [painting, setPainting] = useState(false);
  const [paintColor, setPaintColor] = useState('#ffffff'), [paintWidth, setPaintWidth] = useState(12);
  const scene = activeScene(show), visuals = simpleVisuals(show);
  const visual = visuals.find(v => v.id === selectedID) ?? visuals.at(-1);
  const source = visual ? visualSource(show, visual) : null;
  const locked = !!visual && visualIsLocked(show, visual);
  const layerIDs = [...new Set(visuals.map(v => v.trackID))];
  const layerIndex = layerIDs.indexOf(visual?.trackID);
  const sharedTrack = !!visual && (show.visuals?.filter(v => v.trackID === visual.trackID).length ?? 0) > 1;
  const nested = !!visual?.timelineRefID;
  const track = show.tracks?.find(t => t.id === visual?.trackID);
  const pool = (show.pool ?? []).filter(a => !show.media.some(m => m.id === a.source.mediaId && m.kind === 'audio'));
  const choose = (value: Surface['source'], name: string, poolID?: string) => {
    if (gallery && gallery !== 'add') onReplace(gallery, value, name); else onAdd(value, name, poolID);
    setPainting(!!value.drawing); setTab('targets');
  };
  const create = (kind: PoolSourceKind) => choose(poolSource(kind, sceneSize(show)), POOL_SOURCES.find(s => s.id === kind)!.label);
  const select = (v: Visual) => { onSelect(v.id); setPainting(false); if (!v.continuous) onSeek(v.startS); };
  const moveSelected = (direction: SimpleLayerMove) => { if (visual) { onSelect(visual.id); onMove(visual, direction); } };
  const actions = visual && <div className="map-simple-actions">
    {!nested && <FieldRow label="Mapping"><SelectField aria-label="Visual mapping" value={visual.mapping} disabled={locked}
      options={[{ value: 'repeat', label: 'Repeat on each surface' }, { value: 'span', label: 'Span across surfaces' }]}
      onChange={e => onChange({ ...visual, mapping: e.target.value as Visual['mapping'], legacyTrack: undefined })} /></FieldRow>}
    <Button appearance="flat" disabled={locked || nested} onClick={() => setGallery(visual.id)}><AetherIcon name="import" />Replace visual</Button>
    <Button appearance="flat" disabled={locked} onClick={() => onDuplicate(visual)}><AetherIcon name="items" />Duplicate</Button>
    <Button appearance="flat" disabled={locked} onClick={() => onChange({ ...visual, enabled: visual.enabled === false })}><AetherIcon name={visual.enabled === false ? 'surface' : 'hidden'} />{visual.enabled === false ? 'Show visual' : 'Hide visual'}</Button>
    <Button appearance="flat" disabled={locked || nested || (!visual.placement && visual.opacity === 1 && !visual.effects?.length)} onClick={() => onChange({ ...visual, placement: undefined, opacity: 1, effects: [] })}>Reset placement & effects</Button>
    <Button appearance="flat" className="map-simple-delete" disabled={locked} onClick={() => onRemove(visual)}><AetherIcon name="delete" />Delete visual</Button>
  </div>;
  return <section className="map-simple" aria-label="Simple visualization workspace">
    <header className="map-simple-header">
      <div><strong>Visualize</strong><span>Choose a visual. Make it yours.</span></div>
      <Inspector className="map-simple-scene-picker"><SelectField aria-label="Visualization scene" value={scene.id} options={show.scenes.map(s => ({ value: s.id, label: s.name }))} onChange={e => onScene(e.target.value)} /></Inspector>
      <div className="map-simple-nav">{props.agentTools}{props.onPerformance && <Button appearance="flat" onClick={props.onPerformance}><AetherIcon name="sliders" />Performance</Button>}<Button appearance="flat" onClick={onMapping}><AetherIcon name="surface-map" />Edit mapping</Button><Button appearance="flat" onClick={onAdvanced}>Advanced editor</Button></div>
    </header>
    <div className="map-simple-body">
      <aside className="map-simple-rail" aria-label="Scene visuals">
        <div className="map-simple-layer-heading"><strong>Layers</strong><span>Front at top</span></div>
        <div className="map-simple-visual-list" role="group" aria-label="Layers, front to back">
          {[...visuals].reverse().map(v => <button key={v.id} type="button" aria-label={`Select ${v.name}`} aria-pressed={v.id === visual?.id}
            className={`map-simple-visual${v.enabled === false ? ' is-hidden' : ''}`} onClick={() => select(v)}>
            <VisualThumbnail source={visualSource(show, v)} show={show} urls={urls} />
            <span>{v.name}</span>{v.trackID === layerIDs.at(-1) && <small>Front</small>}{layerIDs.length > 1 && v.trackID === layerIDs[0] && <small>Back</small>}{!v.continuous && <small>{v.timelineRefID ? 'Timeline' : 'Timed'}</small>}
          </button>)}
        </div>
        <Button appearance="flat" primary className="map-simple-add" onClick={() => setGallery('add')} aria-label="Add visual"><AetherIcon name="plus" /><span>Add visual</span></Button>
        {!!pool.length && <Button appearance="flat" onClick={() => setPoolOpen(true)} aria-label="Use Media Pool"><AetherIcon name="folder" /><span>My media</span></Button>}
      </aside>
      <main className="map-simple-stage">
        <section className="map-simple-preview" aria-label="Scene preview">
          <ShowPreview scenePreview show={show} urls={urls} timeS={timeS} playing={playing} />
          {!visuals.length && <div className="map-simple-empty"><AetherIcon name="palette" /><h2>Your surfaces, brought to life</h2><p>Add a visual from the gallery, create a color or text, or import your own image or video.</p><Button appearance="flat" onClick={() => setGallery('add')}>Browse visual gallery</Button></div>}
        </section>
        <div className="map-simple-transport">
          <IconButton appearance="plain" label="Restart preview" onClick={() => onSeek(0)}><AetherIcon name="undo" /></IconButton>
          <IconButton appearance="plain" label={playing ? 'Pause preview' : 'Play preview'} onClick={onPlay}><AetherIcon name={playing ? 'pause' : 'play'} /></IconButton>
          <span>{formatTime(timeS)}</span><Slider className="map-simple-seek" showValue={false} ariaLabel="Preview position" min={0} max={Math.max(timelineDuration(show), Math.ceil(timeS))} step={.1} value={timeS} onChange={onSeek} />
          <span>{timelineName(show)}</span>
        </div>
        {!!show.output.blackout && <p className="map-simple-notice">Output is blacked out. Turn off Blackout in the Show workspace to see visuals.</p>}
        {visual && !nested && <section className="map-simple-targets" aria-label="Apply visual to surfaces">
          <div className="map-simple-section-title"><strong>Apply to surfaces</strong><span>Click a shape to turn its visual on or off.</span></div>
          <SurfacesStrip show={show} selectedID={null} timeS={timeS} urls={urls}
            assignment={{ visual: locked ? { ...visual, locked: true } : visual, onChange }}
            onSelect={() => {}} onEdit={onMapping} onAdd={onMapping} addLabel="Edit mapped surfaces" />
        </section>}
        {source && !nested && <section className="map-simple-source">
          <InputPreview surface={visualSurface(show, visual!)} show={show} urls={urls} playing={playing} loop={visual!.continuous || visual!.loop}
            timeS={visual!.continuous ? timeS : mediaTime(visual!, show.media.find(m => m.id === source.mediaId), timeS)}
            paint={source.drawing && painting && !locked ? { color: paintColor, widthPx: paintWidth, onColor: setPaintColor, onWidth: setPaintWidth, onDone: () => setPainting(false),
              onStroke: stroke => onChange({ ...visual!, source: { ...source, drawing: { ...source.drawing!, strokes: [...source.drawing!.strokes, stroke] } } }) } : undefined} />
          <div className="map-simple-source-actions">{source.drawing && <Button appearance="flat" disabled={locked} onClick={() => setPainting(v => !v)}>{painting ? 'Finish drawing' : 'Draw on visual'}</Button>}<Button appearance="flat" disabled={locked} onClick={() => setTab('fit')}>Fit & crop</Button></div>
        </section>}
      </main>
      <aside className="map-simple-inspector" aria-label="Visual controls">
        {visual ? <>
          <section className="map-simple-layer-order" aria-label="Layer order">
            <div className="map-simple-section-title"><strong>Layer order</strong><span role="status">{layerIDs.length - layerIndex} of {layerIDs.length} · front to back</span></div>
            <div className="map-simple-layer-buttons">
              <Button appearance="flat" disabled={!canMoveSimpleVisual(show, visual.id, 1)} onClick={() => moveSelected(1)}>Move forward</Button>
              <Button appearance="flat" disabled={!canMoveSimpleVisual(show, visual.id, -1)} onClick={() => moveSelected(-1)}>Move backward</Button>
              <Button appearance="flat" disabled={!canMoveSimpleVisual(show, visual.id, 'front')} onClick={() => moveSelected('front')}>Bring to front</Button>
              <Button appearance="flat" disabled={!canMoveSimpleVisual(show, visual.id, 'back')} onClick={() => moveSelected('back')}>Send to back</Button>
            </div>
            <p>{sharedTrack ? 'Visuals on the same timeline track move together.' : 'Front layers appear over layers behind them.'}</p>
          </section>
          {locked && <p className="map-simple-notice">This visual or its track is locked. Unlock it in the advanced editor.</p>}
          {track?.enabled === false && <p className="map-simple-notice">This track is muted in the advanced editor.</p>}
          {!visual.continuous && <div className="map-simple-notice"><span>{nested ? 'Reusable timeline' : 'Timed visual'} · {formatTime(visual.startS)} – {formatTime(visual.startS + visual.durationS)}</span><Button appearance="flat" onClick={onAdvanced}>Edit timing in advanced</Button></div>}
          {!nested ? <Inspector><VisualProperties key={visual.id} simple visual={visual} show={show} onChange={onChange}
            activeTab={tab} onTabChange={setTab} actions={actions} onPickMedia={() => onImport(visual.id)} onDuplicate={() => onDuplicate(visual)} onMove={moveSelected} /></Inspector> : <>{actions}<Button appearance="flat" onClick={onAdvanced}>Open timeline editor</Button></>}
        </> : <div className="map-simple-welcome"><h2>A simple place to start</h2><ol><li>Add a visual.</li><li>Choose the surfaces it belongs on.</li><li>Adjust its color, fit and effects.</li></ol><p>The advanced editor is always one click away.</p></div>}
      </aside>
    </div>
    {gallery && <VisualGallery onChooseLoop={props.onLoop?async(file,loop)=>{const added=await props.onLoop!(file,loop,gallery==='add'?undefined:gallery);if(added){setPainting(false);setTab('targets');}return added;}:undefined} actionLabel={gallery === 'add' ? 'Add visual to scene' : 'Replace selected visual'} onClose={() => setGallery(null)}
      onChoose={v => choose({ mediaId: null, rect: [0, 0, sceneSize(show).width, sceneSize(show).height], shader: v.shader }, v.name)} onCreate={create}
      onImport={() => onImport(gallery === 'add' ? undefined : gallery)} />}
    {poolOpen && createPortal(<Dialog open title="Your media" onClose={() => setPoolOpen(false)}><p>Use a source already in this show.</p><div className="map-simple-pool">
      {pool.map(asset => <button type="button" key={asset.id} onClick={() => { onAdd(asset.source, asset.name, asset.id); setPoolOpen(false); }}>
        <VisualThumbnail source={asset.source} show={show} urls={urls} /><span>{asset.name}</span>
      </button>)}
    </div></Dialog>, document.body)}
  </section>;
}

function VisualThumbnail({ source, show, urls }: { source: Surface['source']; show: MapShow; urls: Record<string, string> }) {
  const media = show.media.find(m => m.id === source.mediaId);
  return <span className="map-simple-thumbnail" style={source.fill ? { background: source.fill } : undefined}>
    {source.shader ? <ShaderThumbnail shader={source.shader} /> : media && urls[media.id] ? media.kind === 'video' ? <video src={urls[media.id]} preload="metadata" muted /> : <img src={urls[media.id]} alt="" />
      : source.drawing ? <DrawnMedia drawing={{ ...source.drawing, replay: undefined }} rect={source.rect} style={{ width: '100%', height: '100%' }} /> : source.text ? <span>{source.text.text}</span> : source.fill ? null : <AetherIcon name={source.drawing ? 'brush' : source.webcam ? 'camera' : 'palette'} />}
  </span>;
}
