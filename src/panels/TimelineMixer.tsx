import { AudioControls } from '../live/AudioControls';
import { AetherIcon, FieldRow, IconButton, NumberField, Slider } from '@aether/ui';
import type { VisualTrack } from '../media-pool';
import { FLAT_EQ, readTrackEQ } from '../live/timeline-audio-engine';
import { useTrackLevels } from '../live/TimelineAudioContext';

export function TimelineMixer({ tracks, selectedID, onSelect, onPatch, onClose }: {
  tracks: VisualTrack[]; selectedID: string | null; onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<VisualTrack>) => void; onClose: () => void;
}) {
  const audio = tracks.filter(t => t.kind === 'audio'), selected = audio.find(t => t.id === selectedID) ?? audio[0];
  const levels = useTrackLevels(), eq = readTrackEQ(selected?.eq);
  return <aside className="map-timeline-mixer" aria-label="Audio mixer">
    <header><AetherIcon name="audio-mixer" /><strong>Audio</strong><IconButton label="Close mixer" onClick={onClose}><AetherIcon name="close" /></IconButton></header>
    <div className="map-mixer-channels">
      {audio.map(track => {
        const db = levels[track.id] ?? -60;
        return <section className={`map-mixer-channel ${selected?.id === track.id ? 'is-selected' : ''}`} key={track.id} aria-label={`${track.name} mixer channel`}>
          <button type="button" className="map-mixer-channel-name" aria-pressed={selected?.id === track.id} onClick={() => onSelect(track.id)}>{track.name}</button>
          <div className="map-mixer-switches">
            <IconButton label={`${track.enabled ? 'Mute' : 'Unmute'} ${track.name} in mixer`} aria-pressed={!track.enabled} disabled={track.locked} onClick={() => onPatch(track.id, { enabled: !track.enabled })}><span className="map-control-letter">M</span></IconButton>
            <IconButton label={`Solo ${track.name} in mixer`} aria-pressed={!!track.solo} disabled={track.locked} onClick={() => onPatch(track.id, { solo: !track.solo })}><span className="map-control-letter">S</span></IconButton>
          </div>
          <div className="map-mixer-meter-area">
            <div className="map-mixer-db-scale" aria-hidden><span>0</span><span>−12</span><span>−24</span><span>−48</span></div>
            <div className="map-mixer-meter" role="meter" aria-label={`${track.name} peak level`} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.min(0, db)} aria-valuetext={`${db.toFixed(1)} dBFS`}>
              <span style={{ height: `${Math.min(100, Math.max(0, (db + 60) / 60 * 100))}%` }} />
            </div>
            <output className={db >= 0 ? 'is-clipping' : ''}>{db <= -60 ? '−∞' : db.toFixed(1)}</output>
          </div>
          <Slider ariaLabel={`${track.name} volume`} min={0} max={100} value={Math.round((track.volume ?? 1) * 100)} unit="%" disabled={track.locked} onChange={volume => onPatch(track.id, { volume: volume / 100 })} />
        </section>;
      })}
      {!audio.length && <p>Add an audio track to mix its soundtrack.</p>}
    </div>
    {selected && <section className="map-mixer-eq" aria-label={`${selected.name} equalizer`}>
      <header><strong>{selected.name} · EQ</strong>
        <IconButton label={`Enable EQ ${selected.name}`} aria-pressed={eq.enabled} disabled={selected.locked} onClick={() => onPatch(selected.id, { eq: { ...eq, enabled: !eq.enabled } })}><AetherIcon name="audio" /></IconButton>
        <IconButton label={`Reset EQ ${selected.name}`} disabled={selected.locked} onClick={() => onPatch(selected.id, { eq: FLAT_EQ })}><AetherIcon name="undo" /></IconButton>
      </header>
      {(['lowDb', 'midDb', 'highDb'] as const).map((band, i) => <FieldRow layout="inline" key={band} label={['Low · 200 Hz', 'Mid · 1 kHz', 'High · 4 kHz'][i]}>
        <NumberField aria-label={`${selected.name} ${band}`} value={eq[band]} unit="dB" min={-12} max={12} step={.5} disabled={selected.locked} onValueChange={gain => gain !== null && onPatch(selected.id, { eq: { ...eq, [band]: gain, enabled: true } })} />
      </FieldRow>)}
    </section>}
    <section className="map-mixer-input" aria-label="Audio input">
      <AudioControls />
      <p className="map-hint">Microphone input drives visual modulation. Track channels mix the soundtrack.</p>
    </section>
  </aside>;
}
