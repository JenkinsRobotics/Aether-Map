import { type Clip, type MapShow, type Surface, nextId, withSurfaceCollection, allSurfaces } from './document';
import { clipSource, contentClip, sequenceSurface, sourceID } from './surface-assets';
import { clipEnd } from './clips';

/** Asset commands share the document history with geometry and the timeline. */
export function createSurfaceAssetCommands({ show, edit, select }: {
  show: MapShow; edit: (update: (show: MapShow) => MapShow, key?: string) => void;
  select: (surfaceID: string, clipID: string | null) => void;
}) {
  const change = (surfaceID: string, clip: Clip, key = `asset:${clip.id}`) => edit(current => withSurfaceCollection(current, surfaceID, list => list.map(s =>
    s.id === surfaceID && !s.locked ? { ...s, clips: s.clips.map(c => c.id !== clip.id ? c : c.locked
      ? { ...c, enabled: clip.enabled, locked: clip.locked } : clip) } : s)), key);
  const remove = (surfaceID: string, clipID: string) => {
    edit(current => withSurfaceCollection(current, surfaceID, list => list.map(s => {
      if (s.id !== surfaceID || s.locked || s.clips.find(c => c.id === clipID)?.locked) return s;
      return clipID === sourceID(s.id) && !s.clips.some(c => c.id === clipID) ? { ...s, source: { mediaId: null, rect: s.source.rect }, sequence: true }
        : { ...s, sequence: true, clips: s.clips.filter(c => c.id !== clipID) };
    })));
    select(surfaceID, null);
  };
  const timeSource = (surface: Surface) => {
    const clip = contentClip(surface.source, show.media);
    edit(current => withSurfaceCollection(current, surface.id, list => list.map(s => s.id === surface.id && !s.locked
      ? { ...s, sequence: true, source: { mediaId: null, rect: s.source.rect }, clips: [clip] } : s)));
    select(surface.id, clip.id);
  };
  const duplicate = (surface: Surface, clip: Clip) => {
    // Append copies so duplicating never retimes existing (possibly locked) assets.
    const copy = { ...structuredClone(clip), id: nextId('k'), startS: Math.max(clipEnd(clip), ...surface.clips.map(clipEnd)) };
    edit(current => withSurfaceCollection(current, surface.id, list => list.map(s => s.id === surface.id && !s.locked
      ? { ...s, clips: [...s.clips, copy] } : s)));
    select(surface.id, copy.id);
  };
  const move = (surfaceID: string, clipID: string, direction: -1 | 1) => edit(current => withSurfaceCollection(current, surfaceID, list => list.map(s => {
    if (s.id !== surfaceID || s.locked) return s;
    const ordered = [...s.clips].sort((a, b) => a.startS - b.startS), i = ordered.findIndex(c => c.id === clipID);
    const a = ordered[i], b = ordered[i + direction];
    if (!a || !b || a.locked || b.locked) return s;
    const start = Math.min(a.startS, b.startS);
    return { ...s, clips: s.clips.map(c => c.id === a.id ? { ...c, startS: start + (direction > 0 ? b.durationS : 0) }
      : c.id === b.id ? { ...c, startS: start + (direction < 0 ? a.durationS : 0) } : c) };
  })));
  const drop = (fromID: string, clipID: string, targetID: string, targetClipID: string | null, after: boolean) => {
    const from = allSurfaces(show).find(s => s.id === fromID), target = allSurfaces(show).find(s => s.id === targetID);
    const clip = from?.clips.find(c => c.id === clipID);
    if (!clip || clip.locked || from?.locked || !target || target.locked) return;
    const targetTrack = sequenceSurface(target, show.media);
    const anchor = targetTrack.clips.find(c => c.id === targetClipID);
    const atS = anchor ? anchor.startS + (after ? anchor.durationS : 0) : Math.max(0, ...targetTrack.clips.filter(c => c.id !== clipID).map(clipEnd));
    if (targetTrack.clips.some(c => c.id !== clipID && c.locked && c.startS >= atS)) return;
    const moved = { ...clip, source: clipSource(from!, clip, show.media), startS: atS };
    edit(current => withSurfaceCollection(current, fromID, list => list.map(s => {
      if (s.id === targetID) s = sequenceSurface(s, current.media);
      let clips = s.id === fromID ? s.clips.filter(c => c.id !== clipID) : s.clips;
      if (s.id === targetID) clips = [...clips.map(c => c.startS >= atS ? { ...c, startS: c.startS + clip.durationS } : c), moved];
      return s.id === fromID || s.id === targetID ? { ...s, sequence: true, clips } : s;
    })));
    select(targetID, clipID);
  };
  return { change, remove, timeSource, duplicate, move, drop };
}
