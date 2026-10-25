import { activeScene, nextId, type MapShow, type Rect } from './document';
import { isClip, type Board, type MapTimeline } from './timelines';

export { isClip };

/** Every compound clip in the project, in document order. */
export function projectClips(show: MapShow): MapTimeline[] {
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
