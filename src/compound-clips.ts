import { activeScene, nextId, type MapShow, type Rect, type Surface } from './document';
import { isClip, MAIN_TIMELINE, placeTimeline, timelineDuration, type Board, type MapTimeline } from './timelines';
import type { VisualTrack } from './media-pool';
import type { VisualTarget } from './visual-model';
import { addSimpleVisual } from './simple-visuals';

export { isClip };

/** Every compound clip in the project, in document order. */
export function projectClips(show: MapShow): (MapTimeline & { board: Board })[] {
  return (show.timelines ?? []).filter(isClip);
}

export function clipBoardRect(clip: MapTimeline & { board: Board }): Rect {
  return [0, 0, clip.board.widthPx, clip.board.heightPx];
}

/** A new, empty clip on its own board (default: the output size); it becomes the
 * clip open in Content. The scene timeline being edited is left alone. */
export function createClip(show: MapShow, name: string, board: Board = { widthPx: show.output.width, heightPx: show.output.height }): MapShow {
  const id = nextId('timeline');
  return { ...show, version: 13, activeClipID: id,
    timelines: [...(show.timelines ?? []), { id, name: name.trim() || 'Clip', sceneID: show.activeSceneId, durationS: activeScene(show).durationS, board: { ...board } }],
    tracks: [...(show.tracks ?? []), ...(['video', 'audio'] as const).map(kind => ({ id: nextId('track'), name: kind === 'video' ? 'V1' : 'A1', kind, timelineID: id, targets: [], enabled: true, locked: false }))] };
}

/** Opening an older project: a scene timeline whose visuals all fill the whole
 * canvas becomes a clip on a board of that canvas's size. That is the same
 * picture it already drew, so nothing looks different. Timelines that aim at
 * particular surfaces are assignments, and stay scenes. */
export function migrateTimelinesToClips(show: MapShow): MapShow {
  let timelines = show.timelines ?? [], changed = false;
  const tracks = new Map((show.tracks ?? []).map(t => [t.id, t]));
  for (let again = true; again;) {
    again = false;
    timelines = timelines.map(t => {
      const scene = show.scenes.find(s => s.id === t.sceneID);
      if (isClip(t) || t.surfaceID || !scene) return t;
      const visuals = (show.visuals ?? []).filter(v => tracks.get(v.trackID ?? '')?.timelineID === t.id);
      // A nested scene can't live in a clip, so wait until its children are clips.
      if (visuals.some(v => v.targets.some(a => a.surfaceID) || (v.timelineRefID && !isClip(timelines.find(c => c.id === v.timelineRefID))))) return t;
      again = changed = true;
      return { ...t, board: { widthPx: scene.artboard?.widthPx ?? show.output.width, heightPx: scene.artboard?.heightPx ?? show.output.height } };
    });
  }
  return changed ? { ...show, version: 13, timelines } : show;
}

/** The canvas a scene timeline (or Main, the active canvas's) belongs to. */
const sceneCanvas = (show: MapShow, sceneTimelineID: string) =>
  sceneTimelineID === MAIN_TIMELINE ? show.activeSceneId : show.timelines?.find(t => t.id === sceneTimelineID)?.sceneID;

/** A scene's track for one surface (none: the whole canvas): a video track aimed at exactly that. */
export function surfaceTrack(show: MapShow, sceneTimelineID: string, surfaceID?: string): VisualTrack | undefined {
  const sceneID = sceneCanvas(show, sceneTimelineID);
  return show.tracks?.find(t => t.assign && (t.timelineID ?? MAIN_TIMELINE) === sceneTimelineID && t.kind !== 'audio'
    && t.targets.length === 1 && t.targets[0].sceneID === sceneID && t.targets[0].surfaceID === surfaceID);
}

/** One track per surface of the scene's canvas, in surface order; never removes any. */
export function ensureSurfaceTracks(show: MapShow, sceneTimelineID: string): MapShow {
  const sceneID = sceneCanvas(show, sceneTimelineID), canvas = show.scenes.find(s => s.id === sceneID);
  if (!canvas) return show;
  const missing = canvas.surfaces.filter(s => !s.sceneCanvas && s.kind !== 'mask' && !surfaceTrack(show, sceneTimelineID, s.id));
  if (!missing.length) return show;
  return { ...show, tracks: [...(show.tracks ?? []), ...missing.map((s): VisualTrack => ({ id: nextId('track'), name: s.name, kind: 'video', assign: true,
    ...(sceneTimelineID === MAIN_TIMELINE ? {} : { timelineID: sceneTimelineID }), targets: [{ sceneID: canvas.id, surfaceID: s.id }], enabled: true, locked: false }))] };
}

/** Plays a clip on a surface track: the use aims where its track does and
 * fills the surface without stretching. */
export function assignClip(show: MapShow, clipID: string, trackID: string, startS?: number): MapShow {
  const track = show.tracks?.find(t => t.id === trackID);
  if (!track || !isClip(show.timelines?.find(t => t.id === clipID))) return show;
  const placed = placeTimeline(show, clipID, trackID, startS);
  if (placed === show) return show;
  const id = placed.visuals!.at(-1)!.id;
  return { ...placed, visuals: placed.visuals!.map(v => v.id === id ? { ...v, targets: track.targets.map(t => ({ ...t })), clipFit: 'cover' as const } : v) };
}

/** A quick add in Scene: the source becomes a one-visual clip in the pool. The
 * scene being edited stays the one being edited. */
export function wrapInClip(show: MapShow, source: Surface['source'], name: string, poolID?: string): { show: MapShow; clipID: string } {
  const canvas = activeScene(show);
  const made = createClip(show, name, { widthPx: canvas.artboard?.widthPx ?? show.output.width, heightPx: canvas.artboard?.heightPx ?? show.output.height });
  const clipID = made.activeClipID!;
  const filled = addSimpleVisual({ ...made, activeTimelineID: clipID }, source, name, poolID);
  return { show: { ...filled, activeTimelineID: show.activeTimelineID }, clipID };
}

/** Everywhere a clip ends up projected: surfaces (or whole canvases) of the
 * scenes that use it, directly or inside other clips. */
export function clipUses(show: MapShow, clipID: string, seen = new Set<string>()): VisualTarget[] {
  if (seen.has(clipID)) return [];
  seen.add(clipID);
  const tracks = new Map((show.tracks ?? []).map(t => [t.id, t]));
  const found = (show.visuals ?? []).filter(v => v.timelineRefID === clipID).flatMap(use => {
    const track = tracks.get(use.trackID ?? ''), parent = show.timelines?.find(t => t.id === track?.timelineID);
    if (isClip(parent)) return clipUses(show, parent.id, seen);
    return (use.targets.length ? use.targets : track?.targets ?? []).map(t => ({ ...t }));
  });
  return found.filter((t, i) => found.findIndex(o => o.sceneID === t.sceneID && o.surfaceID === t.surfaceID) === i);
}

/** A copy of a clip with its own tracks and visuals (nested uses still point
 * at the same inner clips). */
export function duplicateClip(show: MapShow, clipID: string): MapShow {
  const clip = show.timelines?.find(t => t.id === clipID);
  if (!isClip(clip)) return show;
  const id = nextId('timeline'), tracks = (show.tracks ?? []).filter(t => t.timelineID === clipID);
  const trackIDs = new Map(tracks.map(t => [t.id, nextId('track')]));
  return { ...show,
    timelines: [...(show.timelines ?? []), { ...structuredClone(clip), id, name: `${clip.name} copy` }],
    tracks: [...(show.tracks ?? []), ...tracks.map(t => ({ ...structuredClone(t), id: trackIDs.get(t.id)!, timelineID: id }))],
    visuals: [...(show.visuals ?? []), ...(show.visuals ?? []).filter(v => trackIDs.has(v.trackID ?? '')).map(v => ({ ...structuredClone(v), id: nextId('visual'), trackID: trackIDs.get(v.trackID!)! }))] };
}

/** The surface row with a pool clip picked: the clip plays, looping for the
 * scene's whole length, on exactly these targets of this scene. */
export function setClipOnSurfaces(show: MapShow, sceneTimelineID: string, clipID: string, targets: VisualTarget[]): MapShow {
  const sceneID = sceneCanvas(show, sceneTimelineID);
  const want = targets.filter(t => t.sceneID === sceneID);
  const key = (t: VisualTarget) => t.surfaceID ?? '';
  const inScene = new Set((show.tracks ?? []).filter(t => (t.timelineID ?? MAIN_TIMELINE) === sceneTimelineID).map(t => t.id));
  const uses = (show.visuals ?? []).filter(v => v.timelineRefID === clipID && inScene.has(v.trackID ?? ''));
  const has = new Set(uses.flatMap(v => v.targets.map(key)));
  const keep = new Set(want.map(key));
  let next: MapShow = uses.some(v => !v.targets.some(t => keep.has(key(t))))
    ? { ...show, visuals: show.visuals!.filter(v => !uses.includes(v) || v.targets.some(t => keep.has(key(t)))) } : show;
  for (const target of want.filter(t => !has.has(key(t)))) {
    let track = surfaceTrack(next, sceneTimelineID, target.surfaceID);
    if (!track) {
      next = { ...next, tracks: [...(next.tracks ?? []), { id: nextId('track'), name: target.surfaceID ? next.scenes.find(s => s.id === sceneID)?.surfaces.find(s => s.id === target.surfaceID)?.name ?? 'Surface' : 'Whole canvas',
        kind: 'video', assign: true, ...(sceneTimelineID === MAIN_TIMELINE ? {} : { timelineID: sceneTimelineID }), targets: [{ ...target }], enabled: true, locked: false }] };
      track = next.tracks!.at(-1)!;
    }
    const placed = assignClip(next, clipID, track.id, 0);
    if (placed === next) continue;
    const id = placed.visuals!.at(-1)!.id;
    next = { ...placed, visuals: placed.visuals!.map(v => v.id === id ? { ...v, loop: true, durationS: timelineDuration(placed, sceneTimelineID) } : v) };
  }
  return next;
}
