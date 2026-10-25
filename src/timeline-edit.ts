import { canNestTimeline, MAIN_TIMELINE } from './timelines';
import { nextId, type MapShow } from './document';
import { MIN_CLIP_S, trimStart, trimEnd } from './clips';
import { trackAcceptsSource, visualSource } from './media-pool';
import type { Visual } from './visual-model';

export function clipEditable(show: MapShow, id: string): boolean {
  const clip = show.visuals?.find(v => v.id === id);
  return !!clip && !clip.locked && !show.tracks?.find(t => t.id === clip.trackID)?.locked;
}
/** Track changes affect compositing, never surface assignments or source identity. */
export function moveTimelineClip(show: MapShow, id: string, trackID: string, startS: number): MapShow {
  const clip = show.visuals?.find(v => v.id === id), track = show.tracks?.find(t => t.id === trackID);
  if (clip?.timelineRefID && track && !canNestTimeline(show, clip.timelineRefID, track.timelineID ?? MAIN_TIMELINE)) return show;
  if (!clip || !clipEditable(show, id) || !track || track.locked || !trackAcceptsSource(show, track, visualSource(show, clip))) return show;
  return { ...show, visuals: show.visuals?.map(v => v.id === id ? { ...v, trackID, startS: Math.max(0, startS), continuous: false, ...(trackID !== v.trackID ? { legacyTrack: undefined } : {}) } : v) };
}
export type ClipAction = 'duplicate' | 'split' | 'delete' | 'enabled' | 'lock' | 'start' | 'trim-start' | 'trim-end';
export function editTimelineClip(show: MapShow, id: string, action: ClipAction, timeS = 0): MapShow {
  const clip = show.visuals?.find(v => v.id === id);
  if (!clip || show.tracks?.find(t => t.id === clip.trackID)?.locked || (action !== 'lock' && !clipEditable(show, id))) return show;
  const visuals = [...(show.visuals ?? [])], index = visuals.indexOf(clip);
  if (action === 'delete') visuals.splice(index, 1);
  else if (action === 'duplicate') visuals.splice(index + 1, 0, { ...structuredClone(clip), id: nextId('clip'), startS: clip.startS + clip.durationS, continuous: false, legacyTrack: undefined });
  else if (action === 'split') {
    const offset = timeS - clip.startS;
    if (clip.continuous || offset < MIN_CLIP_S || clip.durationS - offset < MIN_CLIP_S) return show;
    visuals.splice(index, 1, { ...clip, durationS: offset }, { ...structuredClone(clip), id: nextId('clip'), startS: timeS, durationS: clip.durationS - offset, inS: clip.inS + offset });
  } else if (action === 'trim-start' || action === 'trim-end') {
    if (clip.continuous || timeS < clip.startS || timeS > clip.startS + clip.durationS) return show;
    visuals[index] = { ...clip, ...(action === 'trim-start' ? trimStart(clip, timeS) : trimEnd(clip, timeS, Infinity)) };
  } else {
    const patch: Partial<Visual> = action === 'enabled' ? { enabled: clip.enabled === false } : action === 'lock' ? { locked: !clip.locked } : { startS: 0, continuous: false };
    visuals[index] = { ...clip, ...patch };
  }
  return { ...show, visuals };
}
export function reorderTimelineTrack(show: MapShow, id: string, direction: number): MapShow {
  const tracks = [...(show.tracks ?? [])], i = tracks.findIndex(t => t.id === id);
  if (i < 0 || tracks[i].locked) return show;
  const timelineID = tracks[i].timelineID;
  const kind = tracks[i].kind ?? 'video', sceneID = tracks[i].targets[0]?.sceneID;
  let j = i + direction;
  // A clip's tracks aim at no canvas, so only a scene's tracks compare canvases.
  while (j >= 0 && j < tracks.length && (tracks[j].timelineID !== timelineID || (tracks[j].kind ?? 'video') !== kind || (sceneID !== undefined && !tracks[j].targets.some(t => t.sceneID === sceneID)))) j += direction;
  if (j < 0 || j >= tracks.length || tracks[j].locked) return show;
  [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  return { ...show, tracks };
}

/** Clipboard copies keep source/targets; placing a use creates only a new clip. */
export function canPasteTimelineClip(show: MapShow, copy: Visual, trackID: string): boolean {
  const track = show.tracks?.find(t => t.id === trackID);
  return !!track && !track.locked && (!copy.timelineRefID || track.kind !== 'audio' && canNestTimeline(show, copy.timelineRefID, track.timelineID ?? MAIN_TIMELINE)) && (!copy.assetID || !!show.pool?.some(a => a.id === copy.assetID)) && trackAcceptsSource(show, track, visualSource(show, copy));
}
export function pasteTimelineClip(show: MapShow, copy: Visual, trackID: string, startS: number): MapShow {
  if (!canPasteTimelineClip(show, copy, trackID)) return show;
  const clip = { ...structuredClone(copy), id: nextId('clip'), trackID, startS: Math.max(0, startS), continuous: false, locked: false, legacyTrack: undefined };
  return { ...show, visuals: [...(show.visuals ?? []), clip] };
}
