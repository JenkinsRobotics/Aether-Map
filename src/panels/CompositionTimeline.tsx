import { VisualAutomationFields } from './VisualAutomationFields';
import { TimelineAutomationRows } from './TimelineAutomationRows';
import { AudioOutputControls } from './AudioOutputControls';
import { timelineTracks, timelineVisuals, timelineDuration, currentTimelineID, isClip, MAIN_TIMELINE } from '../timelines';
import { TimelineTrackHeader } from './TimelineTrackHeader';
import './TimelineDesign.css';
import { useState, useRef } from 'react';
import type { Visual } from '../visual-model';
import { useContextCommands } from '@aether/ui';
import { AetherIcon, FieldRow, IconButton, Menu, NumberField, SelectField, TextField, type MenuItem } from '@aether/ui';
import { activeScene, newSurface, layerColor, type MapShow } from '../document';
import { addVisualTrack, visualSource, type VisualTrack, type TrackKind } from '../media-pool';
import { clipEditable, canPasteTimelineClip, pasteTimelineClip, editTimelineClip, moveTimelineClip, reorderTimelineTrack, type ClipAction } from '../timeline-edit';
import { ClipTimeline, type ClipTimelineProps } from './ClipTimeline';

export function CompositionTimeline({ show, trackID, onTrack, onEdit, onDropPoolAsset, onOpenAudio, mixerOpen, onToggleMixer, ...timeline }: Omit<ClipTimelineProps, 'show' | 'onSelectSurface' | 'onPatchSurface'> & {
  mixerOpen: boolean; onToggleMixer: () => void;
  show: MapShow; trackID: string | null;
  onOpenAudio: (trackID: string) => void;
  onTrack: (id: string) => void;
  onEdit: (update: (show: MapShow) => MapShow, key?: string) => void;
}) {
  const scene = { ...activeScene(show), durationS: timelineDuration(show) }, advanced = show.timelineMode === 'advanced';
  const host = useRef<HTMLElement>(null);
  const [automation,setAutomation]=useState(false);
  const [automationTracks,setAutomationTracks]=useState(false),[automationParameter,setAutomationParameter]=useState('');
  const [clipboard, setClipboard] = useState<Visual | null>(null);
  const [context, setContext] = useState<{ x: number; y: number; trackID: string; clipID?: string } | null>(null);
  // A clip's tracks aim at no canvas (its board is the canvas), so all of them show.
  const inClip = isClip(show.timelines?.find(t => t.id === currentTimelineID(show)));
  const tracks = timelineTracks(show).filter(t => inClip || t.targets.some(a => a.sceneID === scene.id)
    || show.visuals?.some(v => v.trackID === t.id && v.targets.some(a => a.sceneID === scene.id)));
  const clips = timelineVisuals(show).filter(v => tracks.some(t => t.id === v.trackID));
  const selectedClip = clips.find(v => v.id === timeline.selectedClipID);
  const selected = tracks.find(t => t.id === (selectedClip?.trackID ?? trackID)) ?? tracks.find(t => t.kind !== 'audio');
  const patch = (id: string, values: Partial<VisualTrack>) => onEdit(s => ({ ...s, tracks: s.tracks?.map(t => t.id === id ? { ...t, ...values } : t) }));
  const add = (kind: TrackKind) => { const surfaceID = show.timelines?.find(t => t.id === currentTimelineID(show))?.surfaceID; const next = addVisualTrack(show, [{ sceneID: scene.id, ...(surfaceID ? { surfaceID } : {}) }], undefined, kind); onEdit(() => next); onTrack(next.tracks!.at(-1)!.id); };
  const canPaste = (track?: VisualTrack) => !!clipboard && !!track && canPasteTimelineClip(show, clipboard, track.id);
  const paste = (track?: VisualTrack) => { if (clipboard && track) onEdit(s => pasteTimelineClip(s, clipboard, track.id, timeline.timeS)); };
  useContextCommands(advanced ? [
    { id:'track-add-video', label:'Add video track', heading:'Timeline', separatorBefore:true, run:() => add('video') },
    { id:'track-add-audio', label:'Add audio track', run:() => add('audio') },
  ] : [], host);
  const projectClip = (v: typeof clips[number], track?: VisualTrack) => ({ ...v, source: visualSource(show, v),
    ...(v.continuous ? { startS: 0, durationS: scene.durationS } : {}), enabled: track?.enabled !== false && v.enabled !== false });
  // ClipTimeline paints rows in reverse order: audio below visual layers.
  const ordered = [...tracks.filter(t => t.kind === 'audio').reverse(), ...tracks.filter(t => t.kind !== 'audio')];
  const surfaces = ordered.map(track => ({ ...newSurface(show.output, 0), id: track.id, name: track.name,
    color: track.kind === 'audio' ? '#348a64' : scene.surfaces.find(s => track.targets.length === 1 && track.targets[0].surfaceID === s.id)?.color ?? layerColor(tracks.indexOf(track)), locked: track.locked, enabled: track.enabled, sequence: true,
    clips: clips.filter(v => v.trackID === track.id).map(v => projectClip(v, track)) }));
  const rowTrack = (id: string) => id;
  const contextTrack = tracks.find(t => t.id === context?.trackID);
  const contextClip = clips.find(v => v.id === context?.clipID);
  const canEdit = contextClip ? clipEditable(show, contextClip.id) : false;
  const action = (id: string) => {
    if (id === 'add-video' || id === 'add-audio') add(id === 'add-audio' ? 'audio' : 'video');
    else if (id === 'paste') paste(contextTrack);
    else if (contextClip) {
      if (id === 'copy' || id === 'cut') {
        setClipboard(structuredClone(contextClip));
        if (id === 'cut') onEdit(s => editTimelineClip(s, contextClip.id, 'delete'));
      } else if (id.startsWith('to:')) onEdit(s => moveTimelineClip(s, contextClip.id, id.slice(3), contextClip.startS));
      else onEdit(s => editTimelineClip(s, contextClip.id, id as ClipAction, timeline.timeS));
    } else if (contextTrack) {
      if (id === 'track-lock') patch(contextTrack.id, { locked: !contextTrack.locked });
      else if (!contextTrack.locked) {
        if (id === 'track-enabled') patch(contextTrack.id, { enabled: !contextTrack.enabled });
        if (id === 'track-forward' || id === 'track-backward') onEdit(s => reorderTimelineTrack(s, contextTrack.id, (id === 'track-forward' ? 1 : -1) * (contextTrack.kind === 'audio' ? -1 : 1)));
        if (id === 'track-remove' && !clips.some(v => v.trackID === contextTrack.id)) onEdit(s => ({ ...s, tracks: s.tracks?.filter(t => t.id !== contextTrack.id) }));
      }
    }
    setContext(null);
  };
  const menu: MenuItem[] = contextClip ? [
    { id:'copy', label:'Copy clip', heading:'Clip' },
    { id:'cut', label:'Cut clip', disabled:!canEdit },
    { id:'paste', label:'Paste at playhead', disabled:!canPaste(contextTrack) },
    { id: 'split', label: 'Split at playhead', separatorBefore:true, disabled: !canEdit || !!contextClip.continuous || timeline.timeS < contextClip.startS + .5 || timeline.timeS > contextClip.startS + contextClip.durationS - .5 },
    { id: 'duplicate', label: 'Duplicate after clip', disabled: !canEdit },
    { id: 'start', label: 'Move to start', disabled: !canEdit },
    { id: 'enabled', label: contextClip.enabled === false ? 'Enable clip' : 'Disable clip', disabled: !canEdit },
    { id: 'lock', label: contextClip.locked ? 'Unlock clip' : 'Lock clip', disabled: contextTrack?.locked },
    ...(advanced ? [{ id: 'move', label: 'Move to track', disabled: !canEdit, children: tracks.filter(t => (t.kind ?? 'video') === (contextTrack?.kind ?? 'video') && t.id !== contextTrack?.id).map(t => ({ id: `to:${t.id}`, label: t.name, disabled: t.locked })) }] : []),
    { id: 'delete', label: 'Delete clip', danger: true, disabled: !canEdit },
  ] : [
    { id:'paste', label:'Paste at playhead', heading:contextTrack?.name ?? 'Timeline', disabled:!canPaste(contextTrack) },
    ...(advanced ? [{ id: 'add-video', label: 'Add video track' }, { id: 'add-audio', label: 'Add audio track' }] : []),
    ...(advanced && contextTrack ? [
      { id: 'track-enabled', label: contextTrack.enabled ? (contextTrack.kind === 'audio' ? 'Mute track' : 'Hide track') : (contextTrack.kind === 'audio' ? 'Unmute track' : 'Show track'), disabled: contextTrack.locked },
      { id: 'track-lock', label: contextTrack.locked ? 'Unlock track' : 'Lock track' },
      { id: 'track-forward', label: 'Move track up', disabled: contextTrack.locked || reorderTimelineTrack(show, contextTrack.id, contextTrack.kind === 'audio' ? -1 : 1) === show },
      { id: 'track-backward', label: 'Move track down', disabled: contextTrack.locked || reorderTimelineTrack(show, contextTrack.id, contextTrack.kind === 'audio' ? 1 : -1) === show },
      { id: 'track-remove', label: 'Remove empty track', disabled: contextTrack.locked || clips.some(v => v.trackID === contextTrack.id) || tracks.filter(t => (t.kind ?? 'video') === (contextTrack.kind ?? 'video')).length <= 1 },
    ] : []),
  ];
  return <section ref={host} className={`map-composition-timeline ${advanced ? 'is-advanced' : 'is-standard'}`} aria-label="Timeline tracks"
    onKeyDown={event => {
      if ((event.target as Element).closest('.map-timeline-automation,.map-automation-lane,.map-automation-label')) return;
      if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]')) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedClip) { event.preventDefault(); event.stopPropagation(); onEdit(s => editTimelineClip(s, selectedClip.id, 'delete')); }
    }}>
    <div className="map-timeline-work-area">
    <ClipTimeline {...timeline} advanced={advanced} visualTracks
      toolbarLeading={<><label className="map-timeline-mode"><SelectField aria-label="Timeline mode" value={advanced ? 'advanced' : 'standard'} options={[{ value: 'standard', label: 'Standard' }, { value: 'advanced', label: 'Advanced' }]} onChange={e => onEdit(s => ({ ...s, timelineMode: e.target.value as MapShow['timelineMode'], ...(e.target.value === 'standard' && !s.timelines?.find(t => t.id === currentTimelineID(s))?.surfaceID ? {activeTimelineID:MAIN_TIMELINE} : {}) }))} /></label></>}
      toolbarActions={<>
        {advanced && <><span className="map-toolbar-divider" />
          <IconButton appearance="plain" label="Add video track" onClick={() => add('video')}><AetherIcon name="file-video" /></IconButton>
          <IconButton appearance="plain" label="Add audio track" onClick={() => add('audio')}><AetherIcon name="file-audio" /></IconButton>
        </>}
        <span className="map-toolbar-divider" />
        <IconButton appearance="plain" label="Split at playhead" disabled={!selectedClip || !clipEditable(show, selectedClip.id) || !!selectedClip.continuous || timeline.timeS < selectedClip.startS + .5 || timeline.timeS > selectedClip.startS + selectedClip.durationS - .5} onClick={() => selectedClip && onEdit(s => editTimelineClip(s, selectedClip.id, 'split', timeline.timeS))}><AetherIcon name="scissors" /></IconButton>
        <IconButton appearance="plain" label="Trim start to playhead" disabled={!selectedClip || !clipEditable(show, selectedClip.id) || !!selectedClip.continuous || timeline.timeS <= selectedClip.startS || timeline.timeS > selectedClip.startS + selectedClip.durationS - .5} onClick={() => selectedClip && onEdit(s => editTimelineClip(s, selectedClip.id, 'trim-start', timeline.timeS))}><AetherIcon name="trim-start" /></IconButton>
        <IconButton appearance="plain" label="Trim end to playhead" disabled={!selectedClip || !clipEditable(show, selectedClip.id) || !!selectedClip.continuous || timeline.timeS < selectedClip.startS + .5 || timeline.timeS >= selectedClip.startS + selectedClip.durationS} onClick={() => selectedClip && onEdit(s => editTimelineClip(s, selectedClip.id, 'trim-end', timeline.timeS))}><AetherIcon name="trim-end" /></IconButton>
        <IconButton appearance="plain" label="Duplicate clip" disabled={!selectedClip || !clipEditable(show, selectedClip.id)} onClick={() => selectedClip && onEdit(s => editTimelineClip(s, selectedClip.id, 'duplicate'))}><AetherIcon name="copy" /></IconButton>
        <IconButton appearance="plain" label="Delete selected clip" disabled={!selectedClip || !clipEditable(show, selectedClip.id)} onClick={() => selectedClip && onEdit(s => editTimelineClip(s, selectedClip.id, 'delete'))}><AetherIcon name="delete" /></IconButton>
      </>}
      toolbarTrailing={<><AudioOutputControls value={show.audioOutput} onChange={audioOutput => onEdit(s => ({ ...s, audioOutput }), 'master-audio')} />
        <span className="map-toolbar-divider" /><IconButton appearance="plain" label="Automation tracks" aria-pressed={automationTracks} onClick={()=>{setAutomationTracks(v=>!v);if(!automationTracks&&selectedClip&&selected?.kind!=='audio'&&!selectedClip.mask)setAutomation(true);}}><AetherIcon name="timeline"/></IconButton><IconButton appearance="plain" label="Clip automation" aria-pressed={automation} disabled={!selectedClip||selected?.kind==='audio'||!!selectedClip.mask} onClick={()=>setAutomation(v=>!v)}><AetherIcon name="history"/></IconButton><IconButton appearance="plain" label="Audio mixer" aria-pressed={mixerOpen} onClick={onToggleMixer}><AetherIcon name="audio-mixer" /></IconButton></>}
      toolbarSettings={advanced && selected && <>
        <FieldRow layout="inline" label="Track name"><TextField aria-label="Track name" disabled={selected.locked} value={selected.name} onChange={e => patch(selected.id, { name: e.target.value })} /></FieldRow>
        {selected.kind === 'audio' && <FieldRow layout="inline" label="Volume"><NumberField aria-label="Track volume" value={Math.round((selected.volume ?? 1) * 100)} unit="%" min={0} max={100} disabled={selected.locked} onValueChange={v => v !== null && patch(selected.id, { volume: v / 100 })} /></FieldRow>}
      </>}
      show={{ ...show, scenes: show.scenes.map(s => s.id === scene.id ? { ...s, durationS: scene.durationS, surfaces } : s) }}
      selectedID={selected?.id ?? null}
      onSelectSurface={id => onTrack(rowTrack(id))}
      onSelectClip={(id, clipID) => timeline.onSelectClip(rowTrack(id), clipID)}
      onDropPoolAsset={onDropPoolAsset}
      onMoveTrackClip={(id, track, time) => onEdit(s => moveTimelineClip(s, id, track, time), `clip:${id}`)}
      onTimelineContext={(event, id, clipID) => { event.preventDefault(); setContext({ x: event.clientX, y: event.clientY, trackID: rowTrack(id), clipID }); }}
      trackDetails={automationTracks?(id,view)=>tracks.find(t=>t.id===id)?.kind==='audio'?null:<TimelineAutomationRows {...view} show={show} clips={clips.filter(v=>v.trackID===id)} onEdit={onEdit}
        onSelect={(v,parameter,time)=>{timeline.onSelectClip(v.trackID!,v.id);setAutomationParameter(parameter);setAutomation(true);if(time!==undefined)timeline.onSeek(time);}}/>:undefined}
      trackControls={advanced ? id => {
        const t = tracks.find(t => t.id === id)!;
        return <TimelineTrackHeader track={t} index={tracks.filter(v => (v.kind ?? 'video') === (t.kind ?? 'video')).indexOf(t) + 1}
          clips={clips.filter(v => v.trackID === id).length} targets={new Set(clips.filter(v => v.trackID === id).flatMap(v => v.targets.map(a => `${a.sceneID}:${a.surfaceID ?? ''}`))).size}
          onSelect={() => onTrack(id)} onPatch={values => patch(id, values)}
          onMenu={event => { event.stopPropagation(); setContext({ x: event.clientX, y: event.clientY, trackID: id }); }}
          onEQ={() => onOpenAudio(id)} />;
      } : undefined} />
    {automation&&selectedClip&&selected?.kind!=='audio'&&!selectedClip.mask&&<aside className="map-timeline-automation" aria-label="Clip automation"><h3>{selectedClip.name} · Automation</h3>
      <p className="map-hint">Automation tracks align base curves to this timeline. Double-click a lane to add a key; drag to change time and value. Arrow keys adjust, Delete removes, and Escape cancels a drag. Looped copies edit the same source key.</p>
      <VisualAutomationFields key={`${selectedClip.id}:${automationParameter}`} initialParameterID={automationParameter} show={show} visual={selectedClip} timeS={timeline.timeS} scope="all" onChange={visual=>onEdit(s=>({...s,visuals:s.visuals?.map(v=>v.id===visual.id?visual:v)}))}/>
    </aside>}
    </div>
    <Menu open={!!context} anchor={context} items={menu} ariaLabel="Timeline actions" onSelect={action} onClose={() => setContext(null)} />
  </section>;
}
