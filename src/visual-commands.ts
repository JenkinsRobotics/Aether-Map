import { reorderTimelineTrack } from './timeline-edit';
import { orderedVisuals } from './media-pool';
import type { Clip, MapShow, Surface } from './document';
import { duplicateVisual } from './visual-document';
import type { Visual } from './visual-model';

export function createVisualCommands({ show, edit, select }: {
  show: MapShow; edit: (update: (show: MapShow) => MapShow, key?: string) => void;
  select: (id: string, clipID: string | null) => void;
}) {
  const change = (_: string, clip: Clip, key: string | null = `visual:${clip.id}`) => edit(current => ({ ...current,
    visuals: current.visuals?.map(v => v.id !== clip.id || current.tracks?.find(t => t.id === v.trackID)?.locked ? v : v.locked ? { ...v, locked: clip.locked, enabled: clip.enabled } : { ...v, ...clip } as Visual),
  }), key ?? undefined);
  const remove = (_: string, id: string) => { edit(current => ({ ...current, visuals: current.visuals?.filter(v => v.id !== id || v.locked || current.tracks?.find(t => t.id === v.trackID)?.locked) })); select('', null); };
  const removeMany = (ids: string[]) => { edit(current => ({ ...current, visuals: current.visuals?.filter(v => !ids.includes(v.id) || v.locked || current.tracks?.find(t => t.id === v.trackID)?.locked) })); select('', null); };
  const duplicate = (_: Surface, clip: Clip) => { const next = duplicateVisual(show, clip.id); edit(() => next); const i = next.visuals?.findIndex(v => v.id === clip.id) ?? -1; const copy = next.visuals?.[i + 1]; if (copy) select(copy.id, copy.id); };
  const timeSource = (surface: Surface) => edit(current => ({ ...current, visuals: current.visuals?.map(v => v.id === surface.id && !v.locked ? { ...v, continuous: false } : v) }));
  const move = (_: string, id: string, direction: -1 | 1) => edit(current => {
    const visual = current.visuals?.find(v => v.id === id);
    if (visual?.trackID) {
      if (visual.locked) return current;
      const next = reorderTimelineTrack(current, visual.trackID, direction);
      return next === current ? current : { ...next, visuals: orderedVisuals(next) };
    }
    const visuals = [...(current.visuals ?? [])], i = visuals.findIndex(v => v.id === id), j = i + direction;
    if (i < 0 || j < 0 || j >= visuals.length || visuals[i].locked) return current;
    [visuals[i], visuals[j]] = [visuals[j], visuals[i]];
    return { ...current, visuals };
  });
  const drop = (_fromID: string, id: string, targetID: string, targetClipID: string | null, after: boolean) => edit(current => {
    const visuals = [...(current.visuals ?? [])], from = visuals.findIndex(v => v.id === id);
    const toID = targetClipID ?? targetID;
    if (from < 0 || visuals[from].locked || id === toID || !visuals.some(v => v.id === toID)) return current;
    const destination = visuals.find(v => v.id === toID);
    if (visuals[from].trackID && destination?.trackID && visuals[from].trackID !== destination.trackID) {
      const tracks = [...(current.tracks ?? [])], i = tracks.findIndex(t => t.id === visuals[from].trackID);
      if (i < 0 || tracks[i].locked) return current;
      const [track] = tracks.splice(i, 1), j = tracks.findIndex(t => t.id === destination.trackID);
      if (j < 0) return current;
      tracks.splice(j + (after ? 1 : 0), 0, track);
      const next = { ...current, tracks }; return { ...next, visuals: orderedVisuals(next) };
    }
    const [visual] = visuals.splice(from, 1), to = visuals.findIndex(v => v.id === toID);
    visuals.splice(to + (after ? 1 : 0), 0, visual);
    return { ...current, visuals };
  });
  return { change, remove, removeMany, duplicate, timeSource, move, drop };
}
