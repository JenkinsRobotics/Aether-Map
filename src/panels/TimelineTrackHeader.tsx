import { useState } from 'react';
import { AetherIcon, IconButton, TextField } from '@aether/ui';
import type { VisualTrack } from '../media-pool';
import { useTrackLevels } from '../live/TimelineAudioContext';

export function TimelineTrackHeader({ track, index, clips, targets, onSelect, onPatch, onMenu, onEQ }: {
  track: VisualTrack; index: number; clips: number; targets: number;
  onSelect: () => void; onPatch: (patch: Partial<VisualTrack>) => void;
  onMenu: (event: React.MouseEvent) => void; onEQ: () => void;
}) {
  const [renaming, setRenaming] = useState(false), [draft, setDraft] = useState(track.name);
  const audio = track.kind === 'audio', levels = useTrackLevels(), db = levels[track.id] ?? -60;
  const rename = () => { if (draft.trim() && draft !== track.name) onPatch({ name: draft.trim() }); setRenaming(false); };
  const visibility = `${track.enabled ? (audio ? 'Mute' : 'Hide') : (audio ? 'Unmute' : 'Show')} ${track.name}`;
  return <div className="map-track-header-content">
    <div className="map-track-identity">
      <span className={`map-track-badge ${audio ? 'is-audio' : ''}`} title={audio ? 'Audio track' : 'Video track'}>{audio ? 'A' : 'V'}{index}</span>
      {renaming ? <TextField aria-label="Track name" autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={rename} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') rename(); if (e.key === 'Escape') setRenaming(false); }} /> :
        <button type="button" className="map-track-label" aria-label={track.name} title="Double-click to rename track" onClick={onSelect} onDoubleClick={() => { if (!track.locked) { setDraft(track.name); setRenaming(true); } }} onKeyDown={e => { if (e.key === 'F2' && !track.locked) { setDraft(track.name); setRenaming(true); } }}>{track.name}</button>}
      <small>{clips} clip{clips === 1 ? '' : 's'}</small>
    </div>
    <div className="map-track-header-controls" onClick={e => e.stopPropagation()}>
      <IconButton label={`${track.locked ? 'Unlock' : 'Lock'} ${track.name}`} aria-pressed={track.locked} onClick={() => onPatch({ locked: !track.locked })}><AetherIcon name={track.locked ? 'lock' : 'unlock'} /></IconButton>
      <IconButton label={visibility} aria-pressed={!track.enabled} disabled={track.locked} onClick={() => onPatch({ enabled: !track.enabled })}>{audio ? <span className="map-control-letter">M</span> : <AetherIcon name={track.enabled ? 'visible' : 'hidden'} />}</IconButton>
      {audio ? <>
        <IconButton label={`Solo ${track.name}`} aria-pressed={!!track.solo} disabled={track.locked} onClick={() => onPatch({ solo: !track.solo })}><span className="map-control-letter">S</span></IconButton>
        <IconButton label={`Equalizer ${track.name}`} aria-pressed={!!track.eq?.enabled} onClick={onEQ}><AetherIcon name="sliders" /></IconButton>
        <meter className="map-track-level" min={-60} max={0} value={Math.min(0, db)} aria-label={`${track.name} audio level`} title={`${db.toFixed(1)} dBFS`} />
      </> : <span className="map-track-meta">{targets} target{targets === 1 ? '' : 's'}</span>}
      <IconButton label={`Track options ${track.name}`} onClick={onMenu}><AetherIcon name="more" /></IconButton>
    </div>
  </div>;
}
