import { ChromaKeyFields } from '../media/ChromaKeyFields';
import { Button, FieldRow, InspectorSection, TextField } from '@aether/ui';
import { newSurface, type MapShow } from '../document';
import { poolUses, type PoolAsset } from '../media-pool';
import { SourceFields } from '../features/SourceFields';
import './MediaPool.css';

export { POOL_DRAG_TYPE } from '../media-pool';
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
