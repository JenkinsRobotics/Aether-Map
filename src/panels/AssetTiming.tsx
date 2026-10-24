import { Button, FieldRow, NumberField } from '@aether/ui';
import type { Clip } from '../document';

export function AssetTiming({ clip, onChange, audio = false }: { audio?: boolean; clip: Clip; onChange: (clip: Clip) => void }) {
  return <div className="map-asset-timing" aria-label="Asset timing">
    <FieldRow label="Start"><NumberField aria-label="Asset start" value={clip.startS} min={0} step={.1} unit="s" onValueChange={v => v !== null && onChange({ ...clip, startS: Math.max(0, v) })} /></FieldRow>
    <FieldRow label="Duration"><NumberField aria-label="Asset duration" value={clip.durationS} min={.001} step={.1} unit="s" onValueChange={v => v !== null && onChange({ ...clip, durationS: Math.max(.001, v) })} /></FieldRow>
    <FieldRow label="In point"><NumberField aria-label="Asset in point" value={clip.inS} min={0} step={.1} unit="s" onValueChange={v => v !== null && onChange({ ...clip, inS: Math.max(0, v) })} /></FieldRow>
    <FieldRow label="At end"><Button aria-pressed={clip.loop} onClick={() => onChange({ ...clip, loop: !clip.loop })}>{clip.loop ? 'Loop source' : audio ? 'Stop at source end' : 'Hold last frame'}</Button></FieldRow>
  </div>;
}

