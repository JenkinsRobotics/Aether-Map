import { useRef, useState } from 'react';
import { AetherIcon, Button, Checkbox, FieldRow, IconButton, InspectorSection, NumberField, SelectField, Slider, TextField, TreePanel, type TreeControl, type TreeNode } from '@aether/ui';
import { type MapShow } from '../document';
import { formatTime } from '../cues';
import { useMapDevices } from '../use-map-devices';
import { ExportWorkspace } from './WorkspaceTray';
import { ShowPreview } from './ShowPreview';
import { TransportLength } from './TransportLength';
import { RECORDING_SIZES, startRecording, stopRecording, useRecording, type RecordingSize } from '../export-video';
import { MAIN_TIMELINE } from '../timelines';
import { activeShow, clipAt, newSceneClip, sceneDuration, showForClip, surfaceRole, type CueAction, type CueTrigger, type SceneClip, type ShowAudioClip, type ShowCue, type ShowTimeline } from '../show-timeline';
import { nextId } from '../document';
import './ShowWorkspace.css';
import { TreeContextArea } from './TreeContextArea';

type EditTimeline = (change: (timeline: ShowTimeline) => ShowTimeline) => void;
const sceneOptions = (show: MapShow) => [{ value: MAIN_TIMELINE, label: 'Main' }, ...(show.timelines ?? []).map(t => ({ value: t.id, label: t.name })),
  // Other shows play as sequences.
  ...(show.shows ?? []).filter(p => p.id !== activeShow(show)?.id).map(p => ({ value: `show:${p.id}`, label: `Show · ${p.name}` }))];
const sceneName = (show: MapShow, id: string) => id === MAIN_TIMELINE ? 'Main' : show.timelines?.find(t => t.id === id)?.name ?? 'Missing scene';
const clipName = (show: MapShow, clip: SceneClip) => clip.showID ? `Show · ${show.shows?.find(p => p.id === clip.showID)?.name ?? 'Missing show'}` : sceneName(show, clip.sceneID);

/** The Show workspace center: every canvas rendering live at the show
 * playhead (Mapping's layout, Scene's render), with the show transport. */
export function ShowWorkspace({ show, urls, timeS, playing, onPlay, onSeek, onGo, selectedCanvasID, onSelectCanvas, onLength }: {
  show: MapShow; urls: Record<string, string>; timeS: number; playing: boolean;
  /** Sets the show's length (the transport's end time). */
  onLength?: (durationS: number) => void;
  onPlay: () => void; onSeek: (time: number) => void; onGo: () => void;
  selectedCanvasID?: string | null; onSelectCanvas: (id: string) => void;
}) {
  const duration = activeShow(show)?.durationS ?? 60;
  const goCues = (activeShow(show)?.cues ?? []).filter(c => c.trigger === 'go');
  return <section className="map-show-workspace" aria-label="Show workspace">
    <div className="map-show-wall" role="list" aria-label="Canvases">
      {show.scenes.map(canvas => {
        const playingClip = clipAt(show, canvas.id, timeS);
        const outputs = show.outputs.filter(o => o.sceneId === canvas.id).map(o => o.name);
        return <button type="button" role="listitem" key={canvas.id} className="map-show-canvas" aria-pressed={selectedCanvasID === canvas.id}
          aria-label={`${canvas.name}: ${playingClip ? sceneName(show, playingClip.clip.sceneID) : 'nothing playing'}`} onClick={() => onSelectCanvas(canvas.id)}>
          <span className="map-show-canvas-head"><strong>{canvas.name}</strong>
            {playingClip ? <span className="map-show-live">Live · {sceneName(show, playingClip.clip.sceneID)}</span> : <span>Idle</span>}
            <span className="map-show-routes">{outputs.length ? outputs.join(', ') : 'No output'}</span></span>
          <span className="map-show-canvas-render">
            {playingClip
              ? <ShowPreview scenePreview show={showForClip(show, canvas.id, playingClip.clip)} urls={urls} timeS={playingClip.localS} playing={playing} />
              : <span className="map-show-idle">No scene clip at {formatTime(timeS)}</span>}
          </span>
        </button>;
      })}
    </div>
    <div className="map-show-transport" role="toolbar" aria-label="Show transport">
      <IconButton label="Restart show" onClick={() => onSeek(0)}><AetherIcon name="undo" /></IconButton>
      <IconButton label={playing ? 'Pause show' : 'Play show'} onClick={onPlay}><AetherIcon name={playing ? 'pause' : 'play'} /></IconButton>
      <span>{formatTime(timeS)}</span>
      <Slider showValue={false} ariaLabel="Show position" min={0} max={duration} step={.1} value={Math.min(timeS, duration)} onChange={onSeek} />
      {onLength ? <TransportLength durationS={duration} label="Show duration" format={formatTime} onLength={onLength} /> : <span>{formatTime(duration)}</span>}
      <Button primary disabled={!goCues.length} onClick={onGo} title={goCues.length ? 'Run the next manual cue' : 'Add a GO cue to use this'}>GO</Button>
    </div>
  </section>;
}

/** The show timeline, docked in the footer: one track per canvas, scene clips
 * on it, cue markers along the top, one playhead for everything. */
export function ShowTimelinePanel({ show, timeS, selectedClipID, onSelectClip, onSeek, onEdit }: {
  show: MapShow; timeS: number; selectedClipID: string | null; onSelectClip: (id: string | null) => void;
  onSeek: (time: number) => void; onEdit: EditTimeline;
}) {
  const timeline = activeShow(show);
  const lane = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; fromX: number; fromS: number } | null>(null);
  if (!timeline) return null;
  const duration = timeline.durationS;
  const pct = (s: number) => `${Math.max(0, Math.min(100, s / duration * 100))}%`;
  const secondsPerPx = () => duration / Math.max(1, lane.current?.clientWidth ?? 1);
  const moveClip = (id: string, startS: number) => onEdit(t => ({ ...t, tracks: t.tracks.map(tr => ({ ...tr, clips: tr.clips.map(c => c.id === id ? { ...c, startS: Math.max(0, Math.round(startS * 2) / 2) } : c) })) }));
  const addClip = (canvasID: string) => onEdit(t => ({ ...t, tracks: t.tracks.map(tr => {
    if (tr.canvasID !== canvasID) return tr;
    const start = Math.max(0, ...tr.clips.map(c => c.startS + c.durationS));
    return { ...tr, clips: [...tr.clips, newSceneClip(MAIN_TIMELINE, start, Math.min(sceneDuration(show, MAIN_TIMELINE, canvasID), Math.max(1, duration - start)))] };
  }) }));
  const audioMedia = show.media.filter(m => m.kind === 'audio');
  const mediaName = (id: string) => show.media.find(m => m.id === id)?.name ?? 'Missing audio';
  const moveAudio = (id: string, startS: number) => onEdit(t => ({ ...t, audio: t.audio?.map(a => a.id === id ? { ...a, startS: Math.max(0, Math.round(startS * 2) / 2) } : a) }));
  const addAudio = () => onEdit(t => {
    const start = Math.max(0, ...(t.audio ?? []).map(a => a.startS + a.durationS));
    const media = audioMedia[0];
    return { ...t, audio: [...(t.audio ?? []), { id: nextId('show-audio'), mediaId: media.id, startS: start, durationS: Math.max(1, Math.min(media.duration ?? t.durationS, t.durationS - start || t.durationS)), inS: 0 }] };
  });
  const ticks = Array.from({ length: Math.floor(duration / 10) + 1 }, (_, i) => i * 10);
  return <section className="map-show-timeline" aria-label="Show timeline">
    <div className="map-show-timeline-row map-show-timeline-ruler">
      <span className="map-show-timeline-label">Cues</span>
      <div className="map-show-timeline-lane" onClick={e => { const box = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - box.left) / box.width * duration); }}>
        {ticks.map(t => <span key={t} className="map-show-tick" style={{ left: pct(t) }}>{formatTime(t)}</span>)}
        {timeline.cues.filter(c => c.trigger === 'timeline' && c.atS !== undefined).map(c => <span key={c.id} className="map-show-cue-mark" style={{ left: pct(c.atS!) }} title={`${c.name} at ${formatTime(c.atS!)}`} aria-label={`Cue ${c.name} at ${formatTime(c.atS!)}`} />)}
        <span className="map-show-playhead" style={{ left: pct(timeS) }} />
      </div>
    </div>
    {/* The soundtrack under the whole show. */}
    <div className="map-show-timeline-row" role="group" aria-label="Show audio track">
      <span className="map-show-timeline-label">Audio<IconButton label="Add show audio" disabled={!audioMedia.length}
        title={audioMedia.length ? 'Add show audio' : 'Import audio in the Media library first'} onClick={addAudio}><AetherIcon name="plus" /></IconButton></span>
      <div className="map-show-timeline-lane" onClick={e => { if (e.target === e.currentTarget) onSelectClip(null); }}
        onPointerMove={e => { if (drag) moveAudio(drag.id, drag.fromS + (e.clientX - drag.fromX) * secondsPerPx()); }}
        onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
        {(timeline.audio ?? []).map(clip => <button type="button" key={clip.id} className="map-show-clip map-show-audio-clip" aria-pressed={clip.id === selectedClipID}
          aria-label={`Audio ${mediaName(clip.mediaId)} at ${formatTime(clip.startS)}`} style={{ left: pct(clip.startS), width: pct(clip.durationS) }}
          onPointerDown={e => { onSelectClip(clip.id); setDrag({ id: clip.id, fromX: e.clientX, fromS: clip.startS }); }}>{mediaName(clip.mediaId)}</button>)}
        <span className="map-show-playhead" style={{ left: pct(timeS) }} />
      </div>
    </div>
    {timeline.tracks.map(track => {
      const canvas = show.scenes.find(c => c.id === track.canvasID);
      return <div key={track.id} className="map-show-timeline-row" role="group" aria-label={`${canvas?.name ?? 'Canvas'} track`}>
        <span className="map-show-timeline-label">{canvas?.name}<IconButton label={`Add a scene clip to ${canvas?.name}`} onClick={() => addClip(track.canvasID)}><AetherIcon name="plus" /></IconButton></span>
        <div className="map-show-timeline-lane" ref={lane} onClick={e => { if (e.target === e.currentTarget) onSelectClip(null); }}
          onPointerMove={e => { if (drag) moveClip(drag.id, drag.fromS + (e.clientX - drag.fromX) * secondsPerPx()); }}
          onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
          {track.clips.map(clip => <button type="button" key={clip.id} className="map-show-clip" aria-pressed={clip.id === selectedClipID}
            aria-label={`${clipName(show, clip)} on ${canvas?.name} at ${formatTime(clip.startS)}`}
            style={{ left: pct(clip.startS), width: pct(clip.durationS) }}
            onPointerDown={e => { onSelectClip(clip.id); setDrag({ id: clip.id, fromX: e.clientX, fromS: clip.startS }); }}>
            {clipName(show, clip)}{clip.loop ? ' ⟳' : ''}</button>)}
          <span className="map-show-playhead" style={{ left: pct(timeS) }} />
        </div>
      </div>;
    })}
  </section>;
}

/** Properties for a selected scene clip. */
export function SceneClipProperties({ show, clip, onEdit }: { show: MapShow; clip: SceneClip; onEdit: EditTimeline }) {
  const track = activeShow(show)?.tracks.find(t => t.clips.some(c => c.id === clip.id));
  const canvas = show.scenes.find(c => c.id === track?.canvasID);
  const patch = (values: Partial<SceneClip>) => onEdit(t => ({ ...t, tracks: t.tracks.map(tr => ({ ...tr, clips: tr.clips.map(c => c.id === clip.id ? { ...c, ...values } : c) })) }));
  const remove = () => onEdit(t => ({ ...t, tracks: t.tracks.map(tr => ({ ...tr, clips: tr.clips.filter(c => c.id !== clip.id) })) }));
  // Roles the scene's layers ask for that this canvas lacks: pick a surface.
  const tracks = new Map((show.tracks ?? []).map(t => [t.id, t]));
  const surfaces = new Map(show.scenes.flatMap(c => c.surfaces.map(s => [s.id, s] as const)));
  const roles = clip.sceneID === MAIN_TIMELINE ? [] : [...new Set((show.visuals ?? [])
    .filter(v => (tracks.get(v.trackID ?? '')?.timelineID ?? MAIN_TIMELINE) === clip.sceneID)
    .flatMap(v => v.targets.filter(t => t.surfaceID && t.sceneID !== canvas?.id).map(t => surfaces.get(t.surfaceID!)).filter(Boolean).map(s => surfaceRole(s!))))];
  return <section className="map-properties" aria-label="Scene clip properties">
    <InspectorSection title="Scene clip">
      <FieldRow label="Plays"><SelectField aria-label="Clip scene" value={clip.showID ? `show:${clip.showID}` : clip.sceneID} options={sceneOptions(show)}
        onChange={e => e.target.value.startsWith('show:') ? patch({ showID: e.target.value.slice(5), sceneID: MAIN_TIMELINE }) : patch({ sceneID: e.target.value, showID: undefined })} /></FieldRow>
      <FieldRow label="Canvas"><span>{canvas?.name ?? 'Missing canvas'}</span></FieldRow>
      <FieldRow label="Start"><NumberField aria-label="Clip start" value={clip.startS} min={0} unit="s" onValueChange={v => v !== null && patch({ startS: v })} /></FieldRow>
      <FieldRow label="Duration"><NumberField aria-label="Clip duration" value={clip.durationS} min={.1} unit="s" onValueChange={v => v !== null && patch({ durationS: v })} /></FieldRow>
      <FieldRow label="In point"><NumberField aria-label="Clip in point" value={clip.inS} min={0} unit="s" onValueChange={v => v !== null && patch({ inS: v })} /></FieldRow>
      <FieldRow label="Speed"><NumberField aria-label="Clip speed" value={clip.speed ?? 1} min={.1} step={.1} unit="×" onValueChange={v => v !== null && patch({ speed: v })} /></FieldRow>
      <Checkbox label="Loop the scene" checked={!!clip.loop} onChange={e => patch({ loop: e.target.checked })} />
    </InspectorSection>
    {!!roles.length && <InspectorSection title="Surfaces">
      <p className="map-hint">This scene was made for other surfaces. Match each to one on {canvas?.name}; same-named surfaces match automatically.</p>
      {roles.map(role => <FieldRow key={role} label={role}><SelectField aria-label={`Surface for ${role}`} value={clip.roleOverrides?.[role] ?? canvas?.surfaces.find(s => surfaceRole(s) === role)?.id ?? ''}
        options={[{ value: '', label: 'Not shown' }, ...(canvas?.surfaces ?? []).map(s => ({ value: s.id, label: s.name }))]}
        onChange={e => patch({ roleOverrides: { ...clip.roleOverrides, [role]: e.target.value } })} /></FieldRow>)}
    </InspectorSection>}
    <Button onClick={remove}><AetherIcon name="delete" />Remove clip</Button>
  </section>;
}

/** Properties for a selected show-audio clip. */
export function ShowAudioProperties({ show, clip, onEdit }: { show: MapShow; clip: ShowAudioClip; onEdit: EditTimeline }) {
  const patch = (values: Partial<ShowAudioClip>) => onEdit(t => ({ ...t, audio: t.audio?.map(a => a.id === clip.id ? { ...a, ...values } : a) }));
  return <section className="map-properties" aria-label="Show audio properties"><InspectorSection title="Show audio">
    <FieldRow label="Audio"><SelectField aria-label="Show audio media" value={clip.mediaId} options={show.media.filter(m => m.kind === 'audio').map(m => ({ value: m.id, label: m.name }))} onChange={e => patch({ mediaId: e.target.value })} /></FieldRow>
    <FieldRow label="Start"><NumberField aria-label="Audio start" value={clip.startS} min={0} unit="s" onValueChange={v => v !== null && patch({ startS: v })} /></FieldRow>
    <FieldRow label="Duration"><NumberField aria-label="Audio duration" value={clip.durationS} min={.1} unit="s" onValueChange={v => v !== null && patch({ durationS: v })} /></FieldRow>
    <FieldRow label="In point"><NumberField aria-label="Audio in point" value={clip.inS} min={0} unit="s" onValueChange={v => v !== null && patch({ inS: v })} /></FieldRow>
    <Button onClick={() => onEdit(t => ({ ...t, audio: t.audio?.filter(a => a.id !== clip.id) }))}><AetherIcon name="delete" />Remove audio</Button>
  </InspectorSection></section>;
}

const CUE_ACTIONS: { value: CueAction; label: string }[] = [
  { value: 'play', label: 'Play' }, { value: 'pause', label: 'Pause' }, { value: 'stop', label: 'Stop and rewind' },
  { value: 'jump', label: 'Jump to time' }, { value: 'blackout-on', label: 'Blackout on' }, { value: 'blackout-off', label: 'Blackout off' },
];
export const describeShowCue = (cue: ShowCue) => `${CUE_ACTIONS.find(a => a.value === cue.action)?.label}${cue.action === 'jump' ? ` ${formatTime(cue.toS ?? 0)}` : ''}`;

/** Cues section: show-control commands. */
export function CueList({ show, selectedID, onSelect, onEdit }: { show: MapShow; selectedID: string | null; onSelect: (id: string | null) => void; onEdit: EditTimeline }) {
  const cues = activeShow(show)?.cues ?? [];
  const add = () => { const id = nextId('cue'); onEdit(t => ({ ...t, cues: [...t.cues, { id, name: `Cue ${t.cues.length + 1}`, trigger: 'go', action: 'play' }] })); onSelect(id); };
  // Header: a name and "+"; Delete is right-click on a cue (or the Delete key).
  const remove = (id: string) => { onEdit(t => ({ ...t, cues: t.cues.filter(c => c.id !== id) })); onSelect(null); };
  const plus: TreeControl[] = [{ id: 'new', label: 'New cue', icon: <AetherIcon name="plus" />, onClick: add }];
  const createItems = [{ id: 'list-new', label: 'New cue', icon: <AetherIcon name="plus" />, separatorBefore: true }];
  const nodes: TreeNode[] = cues.map(c => ({ id: c.id, label: c.name, category: 'Cue', icon: <AetherIcon name={c.trigger === 'go' ? 'play' : c.trigger === 'midi' ? 'sliders' : 'history'} />,
    badge: c.trigger === 'timeline' ? formatTime(c.atS ?? 0) : c.trigger === 'midi' ? `CC ${c.control ?? '–'}` : 'GO' }));
  return <TreeContextArea label="Cue options" items={createItems} onSelect={add} shortcut={key => { if (key === 'Delete' && selectedID) remove(selectedID); }}><TreePanel ariaLabel="Cues" nodes={nodes} selectedIDs={new Set(selectedID ? [selectedID] : [])}
    onSelect={ids => onSelect(ids.at(-1) ?? null)} controls={[]} headerControls={plus} controlsLabel="Cue controls" menuLabel="Cue options"
    menuItems={() => [{ id: 'delete', label: 'Delete cue', icon: <AetherIcon name="delete" />, shortcut: 'Delete' as const, danger: true }]}
    onCommand={(id, action) => action === 'delete' ? remove(id) : add()} emptyState={<span>No cues yet — + adds one</span>} /></TreeContextArea>;
}

/** Properties for a selected cue. */
export function CueProperties({ cue, onEdit }: { cue: ShowCue; onEdit: EditTimeline }) {
  const patch = (values: Partial<ShowCue>) => onEdit(t => ({ ...t, cues: t.cues.map(c => c.id === cue.id ? { ...c, ...values } : c) }));
  return <section className="map-properties" aria-label="Cue properties"><InspectorSection title="Cue">
    <FieldRow label="Name"><TextField aria-label="Cue name" value={cue.name} onChange={e => patch({ name: e.target.value })} /></FieldRow>
    <FieldRow label="Trigger"><SelectField aria-label="Cue trigger" value={cue.trigger} options={[{ value: 'go', label: 'Operator GO' }, { value: 'timeline', label: 'At a time' }, { value: 'midi', label: 'MIDI control' }]}
      onChange={e => patch({ trigger: e.target.value as CueTrigger })} /></FieldRow>
    {cue.trigger === 'timeline' && <FieldRow label="At"><NumberField aria-label="Cue time" value={cue.atS ?? 0} min={0} unit="s" onValueChange={v => v !== null && patch({ atS: v })} /></FieldRow>}
    {cue.trigger === 'midi' && <FieldRow label="Control" help="Fires when this CC rises above zero."><NumberField aria-label="Cue MIDI control" value={cue.control ?? 0} min={0} max={127} onValueChange={v => v !== null && patch({ control: Math.round(v) })} /></FieldRow>}
    <FieldRow label="Action"><SelectField aria-label="Cue action" value={cue.action} options={CUE_ACTIONS} onChange={e => patch({ action: e.target.value as CueAction })} /></FieldRow>
    {cue.action === 'jump' && <FieldRow label="To"><NumberField aria-label="Cue jump time" value={cue.toS ?? 0} min={0} unit="s" onValueChange={v => v !== null && patch({ toS: v })} /></FieldRow>}
    {cue.action === 'jump' && <FieldRow label="Repeat" help="A loop: jump back at most this many times per run. Empty jumps every time.">
      <NumberField aria-label="Cue repeat count" value={cue.times ?? null} min={1} step={1} placeholder="Always" onValueChange={v => patch({ times: v === null ? undefined : Math.max(1, Math.round(v)) })} /></FieldRow>}
  </InspectorSection>
  <InspectorSection title="Condition">
    <Checkbox label="Only when a MIDI control is above a value" checked={!!cue.when} onChange={e => patch({ when: e.target.checked ? { control: cue.control ?? 0, above: 63 } : undefined })} />
    {cue.when && <>
      <FieldRow label="Control"><NumberField aria-label="Condition MIDI control" value={cue.when.control} min={0} max={127} onValueChange={v => v !== null && patch({ when: { ...cue.when!, control: Math.round(v) } })} /></FieldRow>
      <FieldRow label="Above"><NumberField aria-label="Condition threshold" value={cue.when.above} min={0} max={127} onValueChange={v => v !== null && patch({ when: { ...cue.when!, above: Math.round(v) } })} /></FieldRow>
      <p className="map-hint">Sensors can drive this through any MIDI bridge.</p></>}
  </InspectorSection></section>;
}

/** Program tab, Show workspace: how the show plays. */
export function ShowPlaybackFields({ show, onEdit, onPlayback, onShowName, onPlayerShow, onDeleteShow }: { show: MapShow; onEdit: EditTimeline; onPlayback: (mode: MapShow['playback']['mode']) => void;
  onShowName?: (name: string) => void; onPlayerShow?: (id: string) => void; onDeleteShow?: () => void }) {
  const program = activeShow(show), shows = show.shows ?? [];
  return <><InspectorSection title="Show">
    <FieldRow label="Name"><TextField aria-label="Show name" value={program?.name ?? ''} onChange={e => onShowName?.(e.target.value)} /></FieldRow>
    <FieldRow label="Players play" help="Deployed players play this show."><SelectField aria-label="Players play" value={show.playerShowID ?? shows[0]?.id ?? ''} options={shows.map(p => ({ value: p.id, label: p.name }))} onChange={e => onPlayerShow?.(e.target.value)} /></FieldRow>
    {shows.length > 1 && <Button onClick={onDeleteShow}><AetherIcon name="delete" />Delete this show</Button>}
  </InspectorSection>
  <InspectorSection title="Show playback">
    <FieldRow label="Playback"><SelectField aria-label="Show playback" value={show.playback.mode} options={[{ value: 'loop', label: 'Loop the show' }, { value: 'once', label: 'Play once · hold end' }, { value: 'continuous', label: 'Continuous' }]}
      onChange={e => onPlayback(e.target.value as MapShow['playback']['mode'])} /></FieldRow>
    <FieldRow label="Show length"><NumberField aria-label="Show length" value={activeShow(show)?.durationS ?? 60} min={1} unit="s" onValueChange={v => v !== null && onEdit(t => ({ ...t, durationS: Math.max(1, v) }))} /></FieldRow>
    <p className="map-hint">Players start automatically after deployment or boot and follow each output's schedule on the player's local clock.</p>
  </InspectorSection></>;
}

/** Export tab, Show workspace: record an output, download references, bundle the project. */
export function ShowExportPanel({ show, name, urls, documentID, dirty, onOpenOutput, onExportProject, onExportWireframe }: {
  show: MapShow; name: string; urls: Record<string, string>; documentID: string | null; dirty: boolean;
  onOpenOutput: (id: string) => void; onExportProject: () => void; onExportWireframe: () => void;
}) {
  const [size, setSize] = useState<RecordingSize>('1080p');
  const recording = useRecording();
  const output = show.outputs[0];
  return <>
    <InspectorSection title="Record an output">
      <FieldRow label="Resolution"><SelectField aria-label="Show recording resolution" value={size} disabled={recording.recording} options={Object.entries(RECORDING_SIZES).map(([value, s]) => ({ value, label: s.label }))} onChange={e => setSize(e.target.value as RecordingSize)} /></FieldRow>
      <div className="map-show-actions"><Button disabled={!output || output.kind === 'edge'} onClick={() => output && onOpenOutput(output.id)}>Open {output?.name ?? 'output'} to record</Button>
        <Button onClick={() => recording.recording ? stopRecording() : void startRecording(name, size)}>{recording.recording ? 'Stop recording' : 'Record output…'}</Button></div>
      <p className="map-hint" role="status">{recording.status}. Choose the output window in the browser's capture picker.</p>
    </InspectorSection>
    <ExportWorkspace show={show} mediaUrls={urls} documentID={documentID} dirty={dirty} onExportProject={onExportProject} onExportWireframe={onExportWireframe} />
  </>;
}

/** Players section: devices running Aether Player; Manage opens pairing and deploy. */
export function PlayersTree({ show, onManage }: { show: MapShow; onManage: () => void }) {
  const { list, online } = useMapDevices();
  const controls: TreeControl[] = [{ id: 'manage', label: 'Manage players', icon: <AetherIcon name="hardware" />, onClick: onManage }];
  return <TreePanel ariaLabel="Players" controls={controls} controlsLabel="Player controls" selectedIDs={new Set()} onSelect={() => {}}
    headerControls={controls}
    nodes={list.map(device => {
      const outputs = show.outputs.filter(o => o.kind === 'edge' && o.deviceId === device.id).map(o => o.name);
      return { id: device.id, label: device.name, category: 'Player', icon: <AetherIcon name="hardware" />,
        badge: outputs.length ? outputs.join(', ') : undefined, dimmed: !online(device),
        status: [{ id: 'online', label: online(device) ? 'Online' : 'Offline', icon: <AetherIcon name={online(device) ? 'status-complete' : 'status-incomplete'} /> }] };
    })}
    onActivate={onManage} emptyState={<span>No players yet — Manage players to pair one</span>} />;
}
