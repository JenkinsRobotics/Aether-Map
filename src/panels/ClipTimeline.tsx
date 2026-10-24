import { createPortal } from 'react-dom';
import { useContextCommands } from '@aether/ui';
import { TimelineToolbar } from './TimelineToolbar';
import { POOL_DRAG_TYPE } from '../media-pool';
import { timelineRange } from "../timeline-range";
import { AnimationFields } from "../features/AnimationFields";
import type { AnimatedProperty, FeatureKeyframe } from "../features/types";
import { putKeyframe, ANIMATED_PROPERTIES } from "../features/animation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AetherIcon, Button, IconButton } from "@aether/ui";
import { activeScene, activeSurfaces, type Clip, type CueAction, type MapShow, type Surface } from "../document";
import { clipEnd, moveClip, snapTime, trimEnd, trimStart } from "../clips";
import { describeCue, formatTime } from "../cues";
import { assetName, sourceHasContent, sourceName, sourceID } from '../surface-assets';

export interface ClipTimelineProps {
  toolbarHost?: HTMLElement | null;
  onOpenClip?: (clipID: string) => void;
  toolbarLeading?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  toolbarTrailing?: React.ReactNode;
  toolbarSettings?: React.ReactNode;
  advanced?: boolean;
  onMoveTrackClip?: (clipID: string, trackID: string, timeS: number) => void;
  onTimelineContext?: (event: React.MouseEvent, trackID: string, clipID?: string) => void;
  trackControls?: (id: string) => React.ReactNode;
  trackDetails?: (id:string,view:{durationS:number;pxPerS:number;labelWidth:number;snapping:boolean}) => React.ReactNode;

  visualTracks?: boolean;
  onDropPoolAsset?: (assetID: string, trackID: string, timeS: number) => void;
  onPatchSurface?: (id: string, patch: Partial<Surface>) => void;
  show: MapShow;
  timeS: number;
  playing: boolean;
  selectedID: string | null;
  selectedClipID: string | null;
  onSeek: (timeS: number) => void;
  onTogglePlay: () => void;
  onSelectSurface: (id: string) => void;
  onSelectClip: (surfaceID: string, clipID: string | null) => void;
  onChangeClip: (surfaceID: string, clip: Clip, coalesceKey: string) => void;
  onRemoveClip: (surfaceID: string, clipID: string) => void;
  onAddCue: (surfaceID: string, action: CueAction) => void;
  onRemoveCue: (surfaceID: string, cueID: string) => void;
  onDuration: (durationS: number) => void;
  onMode: (mode: MapShow["playback"]["mode"]) => void;
}

const ACTIONS: { value: CueAction; label: string }[] = [
  { value: "show", label: "Show" },
  { value: "hide", label: "Hide" },
  { value: "opacity", label: "Opacity 50%" },
];

const LABEL_WIDTH = 220;
const SNAP_PX = 8;

type Drag =
  | { kind: "keyframe"; surfaceID: string; property: AnimatedProperty; key: FeatureKeyframe }
  | { kind: "scrub" }
  | { kind: "move"; surfaceID: string; clip: Clip; grabOffsetS: number }
  | { kind: "trim-start"; surfaceID: string; clip: Clip }
  | { kind: "trim-end"; surfaceID: string; clip: Clip };

/**
 * One track per layer, each holding its clips in sequence — a video editor's
 * timeline, sized for a projection show. Cues sit on the same track as
 * diamonds. Drag a clip to move it, its edges to trim it; clips snap to
 * tenths and to their neighbours' edges.
 */
export function ClipTimeline({
  show, onOpenClip, toolbarHost, toolbarLeading, toolbarActions, toolbarTrailing, toolbarSettings,
  advanced = false, onMoveTrackClip, onTimelineContext, trackControls, trackDetails,
  visualTracks = false,
  onDropPoolAsset,
  onPatchSurface,
  timeS,
  playing,
  selectedID,
  selectedClipID,
  onSeek,
  onTogglePlay,
  onSelectSurface,
  onSelectClip,
  onChangeClip,
  onRemoveClip,
  onAddCue,
  onRemoveCue,
  onDuration,
  onMode,
}: ClipTimelineProps) {
  const [zoom, setZoom] = useState(1);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [snapping, setSnapping] = useState(true);
  const [snapOptions, setSnapOptions] = useState({ grid:true, edges:true, playhead:true });
  const [editTool, setEditTool] = useState<'select' | 'trim'>('select');
  useContextCommands([
    { id:'zoom-in', label:'Zoom in', heading:'Timeline view', separatorBefore:true, disabled:zoom >= 8, run:() => setZoom(z => Math.min(8, z * 1.5)) },
    { id:'zoom-out', label:'Zoom out', disabled:zoom <= 1, run:() => setZoom(z => Math.max(1, z / 1.5)) },
    { id:'zoom-fit', label:'Fit timeline', run:() => setZoom(1) },
    { id:'timeline-snap', label:'Snapping', kind:'checkbox', checked:snapping, run:() => setSnapping(v => !v) },
    { id:'timeline-start', label:'Go to start', run:() => onSeek(0) },
  ], timelineRef);
  useEffect(() => {
    const host = timelineRef.current;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(z => Math.max(1, Math.min(8, z * Math.exp(-event.deltaY / 300))));
    };
    host?.addEventListener('wheel', wheel, { passive:false });
    return () => host?.removeEventListener('wheel', wheel);
  }, []);
  const [property, setProperty] = useState<AnimatedProperty>("opacity");
  const lanesRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [laneWidth, setLaneWidth] = useState(600);
  const scene = activeScene(show);
  const surfaces = activeSurfaces(show);
  const continuous = show.playback.mode === "continuous";
  const durationS = continuous ? timelineRange(scene, timeS) : Math.max(scene?.durationS ?? 1, 0.001);
  const selected = surfaces.find((s) => s.id === selectedID) ?? null;
  const selectedClip = selected?.clips.find((c) => c.id === selectedClipID) ?? null;
  const hasSurfaces = surfaces.length > 0;

  useEffect(() => {
    const lanes = lanesRef.current;
    if (!lanes) return;
    const measure = () => setLaneWidth(Math.max(lanes.clientWidth, 1));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(lanes);
    return () => observer.disconnect();
  }, [hasSurfaces]);

  const pxPerS = laneWidth / durationS;
  const toTime = useCallback(
    (clientX: number) => {
      const box = lanesRef.current?.getBoundingClientRect();
      const x = clientX - (box?.left ?? 0);
      return Math.max(0, Math.min(durationS, x / pxPerS));
    },
    [durationS, pxPerS],
  );

  // Ruler ticks: about eight, on round numbers.
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => durationS / s <= 8) ?? 10 ** Math.ceil(Math.log10(durationS / 8));
  const ticks: number[] = [];
  for (let t = 0; t <= durationS + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);

  const beginDrag = (event: React.PointerEvent, drag: Drag) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget.closest(".map-tracks") ?? event.currentTarget).setPointerCapture(event.pointerId);
    dragRef.current = drag;
    if (drag.kind === "scrub") onSeek(toTime(event.clientX));
  };

  const onMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const t = toTime(event.clientX);
    if (drag.kind === "keyframe") {
      const surface = surfaces.find((s) => s.id === drag.surfaceID);
      if (surface) onPatchSurface?.(surface.id, { animation: { ...surface.animation, [drag.property]: putKeyframe(surface.animation?.[drag.property] ?? [], { ...drag.key, timeS: Math.round(t * 10) / 10 }) } });
      onSeek(Math.round(t * 10) / 10); return;
    }
    if (drag.kind === "scrub") {
      onSeek(t);
      return;
    }
    const surface = surfaces.find((s) => s.id === drag.surfaceID);
    if (!surface || surface.locked || drag.clip.locked) return;
    const dropID = drag.kind === 'move' && advanced ? document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-track-id]')?.dataset.trackId : undefined;
    const target = surfaces.find(s => s.id === dropID) ?? surface;
    const others = target.clips.filter((c) => c.id !== drag.clip.id);
    const snap = (value: number) => snapping && !event.altKey ? snapTime(value, others, SNAP_PX / pxPerS, { ...snapOptions, anchors:snapOptions.playhead ? [timeS] : [] }) : Math.max(0, value);
    const key = `clip:${drag.clip.id}`;
    if (drag.kind === "move") {
      const start = snap(t - drag.grabOffsetS);
      const moved = moveClip(drag.clip, start, continuous ? Infinity : durationS);
      if (onMoveTrackClip) onMoveTrackClip(drag.clip.id, target.id, moved.startS);
      else onChangeClip(surface.id, moved, key);
    } else if (drag.kind === "trim-end") {
      onChangeClip(surface.id, trimEnd(drag.clip, snap(t), continuous ? Infinity : durationS), key);
    } else {
      onChangeClip(surface.id, trimStart(drag.clip, snap(t)), key);
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const toolbar = (<TimelineToolbar leading={toolbarLeading} actions={toolbarActions} trailing={toolbarTrailing} settings={toolbarSettings}
        editTool={editTool} onEditTool={setEditTool} snapOptions={snapOptions} onSnapOptions={setSnapOptions}
        timeS={timeS} playing={playing} onPlay={onTogglePlay} onSeek={onSeek} advanced={advanced}
        snapping={snapping} onSnap={() => setSnapping(!snapping)} zoom={zoom} onZoom={setZoom}
        durationS={durationS} playback={show.playback.mode} onDuration={onDuration} onPlayback={onMode} />);

  return (
    <div ref={timelineRef} className="map-timeline">
      {toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar}
      {!visualTracks && !selectedClipID && <div className="map-timeline-bar">{ACTIONS.map(action => <Button key={action.value} disabled={!selected} onClick={() => selected && onAddCue(selected.id, action.value)}>{action.label}</Button>)}</div>}

      {surfaces.length === 0 ? (
        <div className="map-timeline-empty">{visualTracks ? 'Add a visual to create a timeline track.' : 'Add a layer, then place assets on it here.'}</div>
      ) : (
        <div className="map-tracks" style={{ gridTemplateColumns: `${LABEL_WIDTH}px calc(${zoom * 100}% - ${zoom * LABEL_WIDTH}px)` }} onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <div className="map-track-head map-track-head--ruler" style={{ width: LABEL_WIDTH }} />
          <div
            className="map-ruler"
            ref={lanesRef}
            onPointerDown={(event) => beginDrag(event, { kind: "scrub" })}
          >
            {ticks.map((t) => (
              <span key={t} className="map-tick" style={{ left: t * pxPerS }}>
                {formatTime(t)}
              </span>
            ))}
          </div>

          {[...surfaces].reverse().map((surface) => (
            <Fragment key={surface.id}>
            <TrackRow
              surface={surface}
              show={show}
              pxPerS={pxPerS}
              selected={surface.id === selectedID}
              selectedClipID={selectedClipID}
              onTimelineContext={onTimelineContext}
              controls={trackControls?.(surface.id)}
              editTool={editTool}
              onDropPoolAsset={onDropPoolAsset}
              onSelect={() => onSelectSurface(surface.id)}
              onSelectKey={(property, key) => { onSelectSurface(surface.id); setProperty(property); onSeek(key.timeS); }}
              onOpenClip={onOpenClip}
              onSelectClip={(clipID) => onSelectClip(surface.id, clipID)}
              onBeginDrag={beginDrag}
              onScrub={(event) => beginDrag(event, { kind: "scrub" })}
            />
            {trackDetails?.(surface.id,{durationS,pxPerS,labelWidth:LABEL_WIDTH,snapping})}
            </Fragment>
          ))}

          <div
            className="map-playhead"
            style={{ left: LABEL_WIDTH + Math.min(timeS, durationS) * pxPerS }}
            aria-hidden
          />
        </div>
      )}

      {selected && !visualTracks && !selectedClipID && onPatchSurface && <AnimationFields surface={selected} timeS={timeS} durationS={continuous ? undefined : durationS} property={property} onProperty={setProperty} onSeek={onSeek} onPatch={onPatchSurface} />}
      {selected && (selectedClip || !visualTracks && !selectedClipID && selected.cues.length > 0) && (
        <div className="map-cue-list">
          {selectedClip && (
            <div className="map-asset-editor">
              <div className="map-cue">
              <span className="map-cue-time">{formatTime(selectedClip.startS)}</span>
              <span className="map-cue-action">
                {assetName(selected, selectedClip, show.media)} ·{" "}
                {formatTime(selectedClip.durationS)} long
                {selectedClip.loop ? " · loops" : " · holds last frame"}
              </span>
              <Button
                disabled={selected.locked || selectedClip.locked}
                onClick={() =>
                  onChangeClip(selected.id, { ...selectedClip, loop: !selectedClip.loop }, `clip-loop:${selectedClip.id}`)
                }
              >
                {selectedClip.loop ? "Hold instead" : "Loop instead"}
              </Button>
              <IconButton
                label="Remove clip"
                disabled={selected.locked || selectedClip.locked}
                onClick={() => onRemoveClip(selected.id, selectedClip.id)}
              >
                <AetherIcon name="delete" />
              </IconButton>
              </div>
            </div>
          )}
          {(selectedClipID ? [] : [...selected.cues])
            .sort((a, b) => a.timeS - b.timeS)
            .map((cue) => (
              <div key={cue.id} className="map-cue">
                <button type="button" className="map-cue-time" onClick={() => onSeek(cue.timeS)}>
                  {formatTime(cue.timeS)}
                </button>
                <span className="map-cue-action">{describeCue(cue)}</span>
                <IconButton
                  label={`Remove surface key at ${formatTime(cue.timeS)}`}
                  onClick={() => onRemoveCue(selected.id, cue.id)}
                >
                  <AetherIcon name="delete" />
                </IconButton>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function TrackRow({
  onTimelineContext, controls, editTool,
  onDropPoolAsset,
  surface,
  show,
  pxPerS,
  selected,
  selectedClipID,
  onSelect,
  onSelectClip,
  onOpenClip,
  onSelectKey,
  onBeginDrag,
  onScrub,
}: {
  onTimelineContext?: ClipTimelineProps["onTimelineContext"];
  controls?: React.ReactNode;
  editTool: 'select' | 'trim';
  onDropPoolAsset?: (assetID: string, trackID: string, timeS: number) => void;
  surface: Surface;
  show: MapShow;
  pxPerS: number;
  selected: boolean;
  selectedClipID: string | null;
  onSelect: () => void;
  onSelectKey: (property: AnimatedProperty, key: FeatureKeyframe) => void;
  onOpenClip?: (clipID: string) => void;
  onSelectClip: (clipID: string | null) => void;
  onBeginDrag: (event: React.PointerEvent, drag: Drag) => void;
  onScrub: (event: React.PointerEvent) => void;
}) {
  const lastPress = useRef<{ id:string; time:number; x:number; y:number } | null>(null);
  return (
    <>
      <div
        onContextMenu={event => onTimelineContext?.(event, surface.id)}
        className={selected && !selectedClipID ? "map-track-head is-selected" : "map-track-head"}
        style={{ width: LABEL_WIDTH }}
        onClick={onSelect}
      >
        {controls ?? <button type="button" className="map-track-title" onClick={onSelect}><span className="map-layer-dot" style={{ background: surface.color }} />
        <span className="map-row-name">{surface.name}</span></button>}
      </div>
      <div
        className={selected ? "map-lane is-selected" : "map-lane"}
        aria-label={`${surface.name} clips`}
        data-track-id={surface.id}
        onContextMenu={event => onTimelineContext?.(event, surface.id)}
        onDragOver={event => { if (!surface.locked && onDropPoolAsset && event.dataTransfer.types.includes(POOL_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
        onDrop={event => { const id = event.dataTransfer.getData(POOL_DRAG_TYPE); if (!id || surface.locked || !onDropPoolAsset) return; event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); onDropPoolAsset(id, surface.id, Math.round(Math.max(0, (event.clientX - box.left) / pxPerS) * 10) / 10); }}
        onPointerDown={(event) => {
          onSelect();
          onSelectClip(null);
          onScrub(event);
        }}
      >
        {surface.clips.length === 0 && !surface.sequence && sourceHasContent(surface.source) && <button aria-pressed={selected && selectedClipID === sourceID(surface.id)} className="map-static-span" style={{ background: surface.color }} onPointerDown={e => e.stopPropagation()} onClick={() => onSelectClip(sourceID(surface.id))}>{sourceName(surface.source, show.media)} · Continuous</button>}
        {surface.clips.map((clip) => {
          const name = assetName(surface, clip, show.media);
          const isSelected = selected && clip.id === selectedClipID;
          return (
            <div
              key={clip.id}
              className={isSelected ? "map-clip is-selected" : "map-clip"}
              style={{
                left: clip.startS * pxPerS,
                width: Math.max(clip.durationS * pxPerS, 6),
                background: surface.color,
                opacity: clip.enabled === false ? .35 : undefined,
              }}
              role="button" tabIndex={0} aria-label={`${name} clip`} aria-pressed={isSelected}
              onDoubleClick={() => onOpenClip?.(clip.id)}
              onFocus={() => { onSelect(); onSelectClip(clip.id); }}
              onContextMenu={event => { event.stopPropagation(); onSelect(); onSelectClip(clip.id); onTimelineContext?.(event, surface.id, clip.id); }}
              title={`${name} · ${formatTime(clip.startS)}–${formatTime(clipEnd(clip))}`}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                // Drag capture belongs to the stable tracks host, so native
                // double-click events target that host rather than the clip.
                const previous = lastPress.current, now = performance.now();
                lastPress.current = { id:clip.id, time:now, x:event.clientX, y:event.clientY };
                if (onOpenClip && previous?.id === clip.id && now - previous.time < 450
                  && Math.hypot(event.clientX-previous.x,event.clientY-previous.y) < 4) {
                  event.stopPropagation(); lastPress.current=null; onOpenClip(clip.id); return;
                }
                onSelect();
                onSelectClip(clip.id);
                if (surface.locked || clip.locked) { event.stopPropagation(); return; }
                const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
                if (editTool === 'trim') {
                  onBeginDrag(event, { kind:event.clientX < box.left + box.width/2 ? 'trim-start' : 'trim-end', surfaceID:surface.id, clip });
                  return;
                }
                onBeginDrag(event, {
                  kind: "move",
                  surfaceID: surface.id,
                  clip,
                  grabOffsetS: (event.clientX - box.left) / pxPerS,
                });
              }}
            >
              <span
                className="map-clip-edge map-clip-edge--start"
                onPointerDown={(event) =>
                  onBeginDrag(event, { kind: "trim-start", surfaceID: surface.id, clip })
                }
              />
              <span className="map-clip-name">{name}</span>
              <span
                className="map-clip-edge map-clip-edge--end"
                onPointerDown={(event) =>
                  onBeginDrag(event, { kind: "trim-end", surfaceID: surface.id, clip })
                }
              />
            </div>
          );
        })}
        {surface.cues.map((cue) => (
          <span
            key={cue.id}
            className="map-cue-mark"
            style={{ left: cue.timeS * pxPerS }}
            title={`${describeCue(cue)} at ${formatTime(cue.timeS)}`}
          />
        ))}
      </div>
      {Object.entries(surface.animation ?? {}).filter(([, keys]) => keys?.length).map(([property, keys]) => <AnimationTrack key={property} surface={surface} property={property as AnimatedProperty} keys={keys!} pxPerS={pxPerS}
        onSelectKey={onSelectKey} onBeginDrag={onBeginDrag} />)}
    </>
  );
}

function AnimationTrack({ surface, property, keys, pxPerS, onSelectKey, onBeginDrag }: {
  surface: Surface; property: AnimatedProperty; keys: FeatureKeyframe[]; pxPerS: number;
  onSelectKey: (property: AnimatedProperty, key: FeatureKeyframe) => void;
  onBeginDrag: (event: React.PointerEvent, drag: Drag) => void;
}) {
  return <>
    <div className="map-track-head map-animation-track-label" style={{ width: LABEL_WIDTH }}>{ANIMATED_PROPERTIES.find((p) => p.value === property)?.label}</div>
    <div className="map-lane map-animation-lane">{keys.map((key) => <button key={key.id} type="button" className="map-keyframe" aria-label={`${surface.name} ${property} keyframe at ${key.timeS}s`} style={{ left: key.timeS * pxPerS, background: surface.color }}
      onClick={() => onSelectKey(property, key)} onPointerDown={(e) => { onSelectKey(property, key); onBeginDrag(e, { kind: "keyframe", surfaceID: surface.id, property, key }); }} />)}</div>
  </>;
}
