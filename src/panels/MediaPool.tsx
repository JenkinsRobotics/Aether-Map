import type { BundledLoop } from '../features/bundled-loops';
import { ChromaKeyFields } from '../media/ChromaKeyFields';
import { POOL_SOURCES, type PoolSourceKind } from '../pool-sources';
import type { ReactNode } from 'react';
import { TimelinePool, type TimelinePoolActions } from './TimelinePool';
import { useState } from 'react';
import { AetherIcon, Button, FieldRow, InspectorSection, SelectField, Tabs, TextField } from '@aether/ui';
import { newSurface, type MapShow } from '../document';
import { POOL_DRAG_TYPE, poolUses, type PoolAsset } from '../media-pool';
import { sourceKind } from '../surface-assets';
import { SourceFields } from '../features/SourceFields';
import './MediaPool.css';
import { VisualGallery } from './VisualGallery';
import { ShaderThumbnail } from '../features/ShaderThumbnail';
import type { GalleryVisual } from '../features/visual-gallery';

export { POOL_DRAG_TYPE } from '../media-pool';
export function MediaPool({ show, urls, selectedID, onSelect, onImport, onCreate, onVisual, onLoop, onAppend, onChange, onRemove, timelines, onlineLibrary }: {
  onLoop?: (file:File,loop:BundledLoop)=>Promise<boolean>;
  onVisual: (visual: GalleryVisual) => void;
  timelines?: TimelinePoolActions;
  onlineLibrary?: ReactNode;
  show: MapShow; urls: Record<string, string>; selectedID: string | null;
  onSelect: (id: string) => void; onImport: () => void; onCreate: (kind: PoolSourceKind) => void;
  onAppend: (id: string) => void; onChange: (asset: PoolAsset) => void; onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState(''), [folder, setFolder] = useState(''), [tab, setTab] = useState('pool');
  const [timelineBin, setTimelineBin] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [view, setView] = useState('grid');
  const selected = show.pool?.find(a => a.id === selectedID);
  const folders = [...new Set(show.pool?.map(a => a.folder).filter((s): s is string => !!s))].sort();
  const assets = (show.pool ?? []).filter(a => (!folder || a.folder === folder) && a.name.toLowerCase().includes(query.toLowerCase()));
  return <section className="map-media-pool" aria-label="Media Pool">
    {gallery && <VisualGallery onlineLibrary={onlineLibrary} onChooseLoop={onLoop?async(file,loop)=>{const added=await onLoop(file,loop);if(added){setTab('pool');setFolder('');setQuery('');setTimelineBin(false);}return added;}:undefined} onClose={() => setGallery(false)} onImport={onImport} onCreate={kind => { onCreate(kind); setTab('pool'); }} onChoose={visual => { onVisual(visual); setTab('pool'); setFolder(''); setQuery(''); setTimelineBin(false); }} />}
    <Tabs tabs={[{ id: 'pool', label: 'Media Pool' }, { id: 'generators', label: 'Generators' }, ...(onlineLibrary ? [{ id:'online', label:'Online Library' }] : [])]} activeID={tab} onSelect={setTab} />
    {tab === 'online' ? <div className="map-pool-online">{onlineLibrary}</div> : tab === 'generators' ? <div className="map-pool-source-browser">
      <Button onClick={() => setGallery(true)}><AetherIcon name="palette" />Browse visual gallery</Button>
      {(['Generated', 'Live inputs'] as const).map(group => <section key={group} aria-label={group}>
        <h3>{group}</h3><div className="map-pool-source-grid">
          {POOL_SOURCES.filter(source => source.group === group).map(source => <button type="button" key={source.id} className="map-pool-item" aria-label={`New ${source.label.toLowerCase()}`}
            onClick={() => { if (source.id === 'shader') { setGallery(true); return; } onCreate(source.id); setFolder(''); setTimelineBin(false); setQuery(''); setTab('pool'); }}>
            <span className="map-pool-thumbnail"><AetherIcon name={source.icon} /></span><span className="map-pool-name">{source.label}</span><small>{source.description}</small>
          </button>)}
        </div>
      </section>)}
      <p className="map-hint">Create a source, adjust it in Properties, then drag it onto a timeline or append it to a track.</p>
    </div> : <>
      <div className="map-pool-toolbar"><Button onClick={onImport}>Import</Button><Button onClick={() => setGallery(true)}>Gallery</Button><TextField aria-label="Search media pool" placeholder="Search assets" value={query} onChange={e => setQuery(e.target.value)} />
        <SelectField aria-label="Media pool view" value={view} onChange={e => setView(e.target.value)} options={[{ value: 'grid', label: 'Thumbnails' }, { value: 'list', label: 'List' }]} /></div>
      <div className="map-pool-browser"><nav aria-label="Media bins"><button type="button" aria-pressed={!folder && !timelineBin} onClick={() => { setFolder(''); setTimelineBin(false); }}><AetherIcon name="folder" />All media</button>
        {timelines && <button type="button" aria-pressed={timelineBin} onClick={() => { setFolder(''); setTimelineBin(true); }}><AetherIcon name="animate" />Timelines</button>}
        {folders.map(name => <button type="button" key={name} aria-pressed={folder === name} onClick={() => { setFolder(name); setTimelineBin(false); }}><AetherIcon name="folder" />{name}</button>)}
      </nav><div className={`map-pool-items is-${view}`} role="group" aria-label="Pool assets">
        {!timelineBin && assets.map(asset => { const media = show.media.find(m => m.id === asset.source.mediaId), kind = sourceKind(asset.source);
          return <button type="button" key={asset.id} className="map-pool-item" aria-label={asset.name} aria-pressed={asset.id === selectedID} draggable
            onDragStart={e => { e.dataTransfer.setData(POOL_DRAG_TYPE, asset.id); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => onSelect(asset.id)} title={`${asset.name} · ${kind} · ${poolUses(show, asset.id)} uses`}>
            <span className="map-pool-thumbnail" style={asset.source.fill ? { background: asset.source.fill } : undefined}>{asset.source.shader ? <ShaderThumbnail shader={asset.source.shader} /> : media && urls[media.id] ? media.kind === 'audio' ? <AetherIcon name="file-audio" /> : media.kind === 'image' ? <img src={urls[media.id]} alt="" loading="lazy" /> : <video src={urls[media.id]} muted preload="metadata" /> : asset.source.fill ? null : <AetherIcon name={asset.source.text ? 'text' : asset.source.webcam ? 'camera' : asset.source.tracker ? 'tracker' : asset.source.drawing ? 'brush' : asset.source.testPattern ? 'surface' : 'palette'} />}</span>
            <span className="map-pool-name">{asset.name}</span><small>{media?.kind === 'audio' ? 'Audio' : kind}</small>
          </button>;
        })}
        {!timelineBin && !assets.length && <p className="map-pool-empty">Import media or add a generator. Drag an asset onto a timeline to use it.</p>}
        {timelines && !folder && <TimelinePool show={show} query={query} actions={timelines} />}
      </div></div>
      {!timelineBin && <div className="map-pool-actions"><Button disabled={!selected} onClick={() => selected && onAppend(selected.id)}>Append to track</Button>
        <Button disabled={!selected || poolUses(show, selected.id) > 0} onClick={() => selected && onRemove(selected.id)}>Remove from pool</Button></div>}
      {selected && !timelineBin && <FieldRow label="Bin"><TextField aria-label="Asset bin" placeholder="Folder name" value={selected.folder ?? ''} onChange={e => onChange({ ...selected, folder: e.target.value || undefined })} /></FieldRow>}
    </>}
  </section>;
}
export function PoolProperties({ asset, show, onChange, onPaint }: { onPaint?: () => void; asset: PoolAsset; show: MapShow; onChange: (asset: PoolAsset) => void }) {
  const surface = { ...newSurface(show.output, 0), name: asset.name, source: asset.source };
  return <section aria-label="Pool asset properties">
    <FieldRow label="Name"><TextField aria-label="Pool asset name" value={asset.name} onChange={e => onChange({ ...asset, name: e.target.value })} /></FieldRow>
    <p className="map-hint">Reusable source · {poolUses(show, asset.id)} uses. Clips inherit these settings until edited individually.</p>
    {asset.source.drawing && onPaint && <Button onClick={onPaint}>Paint source</Button>}
    {show.media.some(m => m.id === asset.source.mediaId && m.kind !== 'audio') && <ChromaKeyFields value={asset.source.chromaKey} onChange={chromaKey => onChange({ ...asset, source: { ...asset.source, chromaKey } })} />}
    {!asset.source.mediaId && <InspectorSection title="Source"><SourceFields surface={surface} show={show} allowTypeChange={false} showFit={false}
      onPatch={(_, patch) => patch.source && onChange({ ...asset, source: patch.source })} onPickMedia={() => {}} /></InspectorSection>}
  </section>;
}
