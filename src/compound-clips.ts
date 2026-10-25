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
