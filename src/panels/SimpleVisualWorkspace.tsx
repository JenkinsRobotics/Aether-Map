import { DrawnMedia } from '../features/DrawnMedia';
import { useState } from 'react';
import { AetherIcon, Button, IconButton, Slider } from '@aether/ui';
import { TransportLength } from './TransportLength';
import type { MapShow, Surface } from '../document';
import type { Visual } from '../visual-model';
import { visualSource } from '../media-pool';
import { visualSurface } from '../visual-document';
import { simpleVisuals, visualIsLocked } from '../simple-visuals';
import { timelineDuration } from '../timelines';
import { mediaTime } from '../clips';
import { formatTime } from '../cues';
import { ShaderThumbnail } from '../features/ShaderThumbnail';
import { InputPreview } from './InputPreview';
import { ShowPreview } from './ShowPreview';
import './ShowWorkspace.css';
import './SimpleVisualWorkspace.css';

export interface SimpleVisualWorkspaceProps {
  /** The view tools' Input button: show the input pane left of the render. */
  showInput?: boolean;
  show: MapShow; urls: Record<string, string>; selectedID: string | null;
  timeS: number; playing: boolean; onPlay: () => void; onSeek: (time: number) => void;
  /** Paint strokes on a drawing visual go through the editor's undo path. */
  onChange: (visual: Visual, key?: string | null) => void;
  /** Sets this scene's length (the transport's end time). */
  onLength?: (durationS: number) => void;
  /** Opens the app's visual gallery (the empty state's call to action). */
  onBrowse: () => void;
  /** Loop on: the play bar repeats the scene's duration (default one minute). */
  onPlayback?: (mode: MapShow['playback']['mode']) => void;
}

/** The simple editor's center workspace: input pane, scene render and
 * transport. The list, Properties and gallery are the shared frame's. */
export function SimpleVisualWorkspace({ show, urls, selectedID, timeS, playing, onPlay, onSeek, onChange, onBrowse, onPlayback, showInput, onLength }: SimpleVisualWorkspaceProps) {
  const looping = show.playback.mode === 'loop', duration = timelineDuration(show);
  const [painting, setPainting] = useState(false);
  const [paintColor, setPaintColor] = useState('#ffffff'), [paintWidth, setPaintWidth] = useState(12);
  const visuals = simpleVisuals(show);
  const visual = show.visuals?.find(v => v.id === selectedID && !v.mask) ?? visuals.at(-1);
  const source = visual ? visualSource(show, visual) : null;
  const locked = !!visual && visualIsLocked(show, visual);
  const nested = !!visual?.timelineRefID;
  return <section className="map-simple" aria-label="Simple visualization workspace">
    <main className="map-simple-stage">
      {/* The Input pane opens to the LEFT of the scene render, from the view
          tools' Input button — the same split as the advanced editor. */}
      <div className={`map-simple-panes${showInput && source && !nested ? '' : ' is-render-only'}`}>
      {showInput && source && !nested && <section className="map-simple-source" aria-label="Input">
        <InputPreview surface={visualSurface(show, visual!)} show={show} urls={urls} playing={playing} loop={visual!.continuous || visual!.loop}
          timeS={visual!.continuous ? timeS : mediaTime(visual!, show.media.find(m => m.id === source.mediaId), timeS)}
          paint={source.drawing && painting && !locked ? { color: paintColor, widthPx: paintWidth, onColor: setPaintColor, onWidth: setPaintWidth, onDone: () => setPainting(false),
            onStroke: stroke => onChange({ ...visual!, source: { ...source, drawing: { ...source.drawing!, strokes: [...source.drawing!.strokes, stroke] } } }) } : undefined} />
        {source.drawing && <div className="map-simple-source-actions"><Button appearance="flat" disabled={locked} onClick={() => setPainting(v => !v)}>{painting ? 'Finish drawing' : 'Draw on visual'}</Button></div>}
      </section>}
      <section className="map-simple-preview" aria-label="Scene preview">
        <ShowPreview scenePreview show={show} urls={urls} timeS={timeS} playing={playing} />
        {!visuals.length && <div className="map-simple-empty"><AetherIcon name="palette" /><h2>Your surfaces, brought to life</h2><p>Add a visual from the gallery, create a color or text, or import your own image or video.</p><Button appearance="flat" onClick={onBrowse}>Browse visual gallery</Button></div>}
      </section>
      </div>
      <div className="map-simple-transport">
        <IconButton appearance="plain" label="Restart preview" onClick={() => onSeek(0)}><AetherIcon name="undo" /></IconButton>
        <IconButton appearance="plain" label={playing ? 'Pause preview' : 'Play preview'} onClick={onPlay}><AetherIcon name={playing ? 'pause' : 'play'} /></IconButton>
        <span>{formatTime(timeS)}</span><Slider className="map-simple-seek" showValue={false} ariaLabel="Preview position" min={0} max={show.playback.mode === 'continuous' ? Math.max(duration, Math.ceil(timeS)) : duration} step={.1} value={timeS} onChange={onSeek} />
        {onLength ? <TransportLength durationS={duration} label="Scene duration" format={formatTime} onLength={onLength} /> : <span>{formatTime(duration)}</span>}
        {onPlayback && <IconButton appearance="plain" label="Loop" aria-pressed={looping} onClick={() => onPlayback(looping ? 'continuous' : 'loop')}><AetherIcon name="refresh" /></IconButton>}
      </div>
      {!!show.output.blackout && <p className="map-simple-notice">Output is blacked out. Turn off Blackout in the Show workspace to see visuals.</p>}
    </main>
  </section>;
}

export function VisualThumbnail({ source, show, urls }: { source: Surface['source']; show: MapShow; urls: Record<string, string> }) {
  const media = show.media.find(m => m.id === source.mediaId);
  return <span className="map-simple-thumbnail" style={source.fill ? { background: source.fill } : undefined}>
    {source.shader ? <ShaderThumbnail shader={source.shader} /> : media && urls[media.id] ? media.kind === 'video' ? <video src={urls[media.id]} preload="metadata" muted /> : <img src={urls[media.id]} alt="" />
      : source.drawing ? <DrawnMedia drawing={{ ...source.drawing, replay: undefined }} rect={source.rect} style={{ width: '100%', height: '100%' }} /> : source.text ? <span>{source.text.text}</span> : source.fill ? null : <AetherIcon name={source.drawing ? 'brush' : source.webcam ? 'camera' : 'palette'} />}
  </span>;
}
