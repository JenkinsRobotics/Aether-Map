import { useState, type ReactNode } from 'react';
import { AetherIcon, Checkbox, FieldRow, IconButton, NumberField, Popover, SelectField, Slider } from '@aether/ui';
import type { MapShow } from '../document';
import { formatTime } from '../cues';

export function TimelineToolbar({ leading, actions, trailing, settings, timeS, playing, onPlay, onSeek, snapping, onSnap, zoom, onZoom, durationS, playback, onDuration, onPlayback, editTool, onEditTool, snapOptions, onSnapOptions }: {
  editTool: 'select' | 'trim'; onEditTool: (tool:'select' | 'trim') => void;
  snapOptions: { grid:boolean; edges:boolean; playhead:boolean }; onSnapOptions:(options:{ grid:boolean; edges:boolean; playhead:boolean }) => void;
  leading?: ReactNode; actions?: ReactNode; trailing?: ReactNode; settings?: ReactNode;
  timeS: number; playing: boolean; onPlay: () => void; onSeek: (time: number) => void;
  advanced: boolean; snapping: boolean; onSnap: () => void; zoom: number; onZoom: (zoom: number) => void;
  durationS: number; playback: MapShow['playback']['mode']; onDuration: (duration: number) => void; onPlayback: (mode: MapShow['playback']['mode']) => void;
}) {
  const [snapAnchor, setSnapAnchor] = useState<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return <>
    <div className="map-sequence-toolbar" role="toolbar" aria-label="Timeline tools">
      <div className="map-sequence-tool-scroll">
      {leading}
      <span className="map-toolbar-divider" />
      <IconButton appearance="plain" label="Go to start" onClick={() => onSeek(0)}><AetherIcon name="arrow-left" /></IconButton>
      <IconButton appearance="plain" label={playing ? 'Pause' : 'Play'} onClick={onPlay}><AetherIcon name={playing ? 'pause' : 'play'} /></IconButton>
      <IconButton appearance="plain" label="Stop" onClick={() => { if (playing) onPlay(); onSeek(0); }}><AetherIcon name="stop" /></IconButton>
      <span className="map-sequence-time" aria-label="Playhead time">{formatTime(timeS)}</span>
      <span className="map-toolbar-divider" />
      <IconButton appearance="plain" label="Select clips" aria-pressed={editTool === 'select'} onClick={() => onEditTool('select')}><AetherIcon name="timeline-select" /></IconButton>
      <IconButton appearance="plain" label="Trim clips" aria-pressed={editTool === 'trim'} onClick={() => onEditTool('trim')}><AetherIcon name="trim-start" /></IconButton>
      {actions}
      {<>
        <span className="map-toolbar-divider" />
        <IconButton appearance="plain" label="Snap" aria-pressed={snapping} onClick={onSnap}><AetherIcon name="timeline-snap" /></IconButton>
        <IconButton appearance="plain" label="Snapping options" aria-expanded={!!snapAnchor} onClick={e => setSnapAnchor(snapAnchor ? null : e.currentTarget)}><AetherIcon name="chevron-down" /></IconButton>
        <IconButton appearance="plain" label="Zoom out" disabled={zoom <= 1} onClick={() => onZoom(Math.max(1, zoom - .5))}><AetherIcon name="zoom-out" /></IconButton>
        <span className="map-timeline-zoom"><Slider ariaLabel="Timeline zoom" min={1} max={8} step={.25} value={zoom} onChange={onZoom} showValue={false} /></span>
        <IconButton appearance="plain" label="Zoom in" disabled={zoom >= 8} onClick={() => onZoom(Math.min(8, zoom + .5))}><AetherIcon name="zoom-in" /></IconButton>
        <IconButton appearance="plain" label="Fit" onClick={() => onZoom(1)}><AetherIcon name="fit" /></IconButton>
      </>}
      </div>
      <div className="map-sequence-output">
      {trailing}
      <IconButton appearance="plain" label="Timeline settings" aria-expanded={!!anchor} onClick={e => setAnchor(anchor ? null : e.currentTarget)}><AetherIcon name="settings" /></IconButton>
      </div>
    </div>
    <Popover open={!!snapAnchor} anchor={snapAnchor} onClose={() => setSnapAnchor(null)} ariaLabel="Snapping options" placement="top-start">
      <div className="map-timeline-settings">
        {(['edges', 'playhead', 'grid'] as const).map((key, i) => <Checkbox key={key} label={['Clip edges', 'Playhead', 'Time grid (0.1 s)'][i]} checked={snapOptions[key]} onChange={e => onSnapOptions({ ...snapOptions, [key]:e.target.checked })} />)}
        <span className="map-hint">Hold Option / Alt while dragging to bypass snapping.</span>
      </div>
    </Popover>
    <Popover open={!!anchor} anchor={anchor} onClose={() => setAnchor(null)} ariaLabel="Timeline settings" placement="top-end">
      <div className="map-timeline-settings">
        <FieldRow layout="inline" label="Playback"><SelectField aria-label="Timeline playback" value={playback} options={[{ value: 'continuous', label: 'Continuous' }, { value: 'loop', label: 'Loop' }, { value: 'once', label: 'Hold at end' }]} onChange={e => onPlayback(e.target.value as MapShow['playback']['mode'])} /></FieldRow>
        <FieldRow layout="inline" label={playback === 'continuous' ? 'View range' : 'Sequence length'}><NumberField aria-label={playback === 'continuous' ? 'Timeline view range' : 'Sequence length'} value={durationS} min={1} step={5} unit="s" onValueChange={v => v !== null && onDuration(v)} /></FieldRow>
        {settings}
      </div>
    </Popover>
  </>;
}
