import { sourceMotionAt, hasSourceMotion } from './source-motion';
import { visualSource } from './media-pool';
import { visualMotionAt, type VisualMotionInputs } from './visual-motion';
import { visualSourceTime } from './visual-clock';
import { activeScene, nextId, type MapShow } from './document';
import type { VisualTrack } from './media-pool';
import type { Visual } from './visual-model';

export const MAIN_TIMELINE = 'main';
export const TIMELINE_DRAG_PREFIX = 'timeline:';
export interface MapTimeline { id: string; name: string; sceneID: string; durationS: number; surfaceID?: string }
export function currentTimelineID(show: MapShow): string {
  return show.timelines?.some(t => t.id === show.activeTimelineID && t.sceneID === show.activeSceneId) ? show.activeTimelineID! : MAIN_TIMELINE;
}
export function timelineName(show: MapShow): string { return show.timelines?.find(t => t.id === currentTimelineID(show))?.name ?? 'Main'; }
export function timelineDuration(show: MapShow, id = currentTimelineID(show)): number {
  return show.timelines?.find(t => t.id === id)?.durationS ?? activeScene(show)?.durationS ?? 60;
}
/** Sets a scene's length: its timeline's, or the canvas's when the scene has no timeline record. */
export function withTimelineDuration(show: MapShow, durationS: number, id = currentTimelineID(show)): MapShow {
  const length = Math.max(1, durationS);
  return show.timelines?.some(t => t.id === id) ? { ...show, timelines: show.timelines.map(t => t.id === id ? { ...t, durationS: length } : t) }
    : { ...show, scenes: show.scenes.map(s => s.id === show.activeSceneId ? { ...s, durationS: length } : s) };
}
export function timelineTracks(show: MapShow, id = currentTimelineID(show)): VisualTrack[] {
  return (show.tracks ?? []).filter(t => (t.timelineID ?? MAIN_TIMELINE) === id);
}
export function timelineVisuals(show: MapShow, id = currentTimelineID(show)): Visual[] {
  const tracks = new Map((show.tracks ?? []).map(t => [t.id, t]));
  return (show.visuals ?? []).filter(v => (tracks.get(v.trackID ?? '')?.timelineID ?? MAIN_TIMELINE) === id);
}
export function createTimeline(show: MapShow, name: string): MapShow {
  const id = nextId('timeline'), sceneID = show.activeSceneId;
  return { ...show, version: show.version>=7?show.version:7, timelineMode: 'advanced', activeTimelineID: id,
    timelines: [...(show.timelines ?? []), { id, name: name.trim() || 'Scene', sceneID, durationS: activeScene(show).durationS }],
    tracks: [...(show.tracks ?? []), ...(['video', 'audio'] as const).map(kind => ({ id: nextId('track'), name: kind === 'video' ? 'V1' : 'A1', kind, timelineID: id, targets: [{ sceneID }], enabled: true, locked: false }))] };
}
export function timelineUses(show: MapShow, id: string): number { return (show.visuals ?? []).filter(v => v.timelineRefID === id).length; }
export function removeTimeline(show: MapShow, id: string): MapShow {
  if (id === MAIN_TIMELINE || show.timelines?.find(t => t.id === id)?.surfaceID || timelineUses(show, id)) return show;
  const ids = new Set(timelineTracks(show, id).map(t => t.id));
  return { ...show, timelines: show.timelines?.filter(t => t.id !== id), tracks: show.tracks?.filter(t => !ids.has(t.id)), visuals: show.visuals?.filter(v => !ids.has(v.trackID ?? '')), activeTimelineID: show.activeTimelineID === id ? undefined : show.activeTimelineID };
}
export function canNestTimeline(show: MapShow, childID: string, parentID = currentTimelineID(show)): boolean {
  const child = show.timelines?.find(t => t.id === childID);
  if (!child || child.sceneID !== show.activeSceneId || childID === parentID) return false;
  const seen = new Set<string>();
  const reaches = (id: string): boolean => {
    if (id === parentID) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return timelineVisuals(show, id).some(v => v.timelineRefID && reaches(v.timelineRefID));
  };
  return !reaches(childID);
}
export function placeTimeline(show: MapShow, id: string, trackID: string, startS?: number): MapShow {
  const track = show.tracks?.find(t => t.id === trackID), target = show.timelines?.find(t => t.id === id);
  if (!track || track.locked || track.kind === 'audio' || !target || !canNestTimeline(show, id, track.timelineID ?? MAIN_TIMELINE)) return show;
  const start = startS ?? Math.max(0, ...(show.visuals ?? []).filter(v => v.trackID === trackID).map(v => v.startS + v.durationS));
  const visual: Visual = { id: nextId('clip'), name: target.name, timelineRefID: id, trackID,
    startS: Math.max(0, start), durationS: target.durationS, inS: 0, loop: false,
    targets: [{ sceneID: target.sceneID }], mapping: 'repeat', color: '#8175cf', opacity: 1 };
  return { ...show, version: show.version>=7?show.version:7, visuals: [...(show.visuals ?? []), visual] };
}

/** Resolve nested schedules without duplicating sources or saved child clips.
 * Each use has its own clock and identity; child surface assignments remain intact. */
export interface ScheduledVisual { visual: Visual; track?: VisualTrack; timeS: number; gain: number }
export function scheduledVisuals(show: MapShow, timeS: number, id = currentTimelineID(show), inputs:VisualMotionInputs={}): ScheduledVisual[] {
  const result: ScheduledVisual[] = [];
  const visit = (timelineID: string, time: number, path: string[], opacity: number, gain: number) => {
    const tracks = timelineTracks(show, timelineID), ranks = new Map(tracks.map((t, i) => [t.id, i]));
    const solo = tracks.some(t => t.kind === 'audio' && t.enabled && t.solo);
    const clips = timelineVisuals(show, timelineID).sort((a, b) => (ranks.get(a.trackID ?? '') ?? -1) - (ranks.get(b.trackID ?? '') ?? -1));
    for (const authored of clips) {
      let visual=visualMotionAt(authored,visualSourceTime(show,authored,time),timeS,inputs,show.lfos);
      if(!visual.timelineRefID){const source=visualSource(show,visual);if(hasSourceMotion(source))visual={...visual,source:sourceMotionAt(source,visualSourceTime(show,authored,time),timeS,inputs,show.lfos,show.media.find(m=>m.id===source.mediaId))};}
      const track = tracks.find(t => t.id === visual.trackID);
      if (track?.enabled === false || visual.enabled === false || (track?.kind === 'audio' && solo && !track.solo)) continue;
      if (visual.timelineRefID) {
        const child = show.timelines?.find(t => t.id === visual.timelineRefID);
        if (!child || path.includes(child.id) || time < visual.startS || time >= visual.startS + visual.durationS) continue;
        const clock = visualSourceTime(show,visual,time);
        visit(child.id, clock, [...path, visual.id, child.id], opacity * visual.opacity, gain);
      } else result.push({ visual: path.length ? { ...visual, id: `${path.join('/')}/${visual.id}`, opacity: visual.opacity * opacity, legacyTrack: visual.legacyTrack ? `${path.join('/')}/${visual.legacyTrack}` : undefined } : visual, track, timeS: time, gain });
    }
  };
  visit(id, timeS, [], 1, 1);
  return result;
}

export function validateTimelines(show: MapShow): void {
  const ids = new Set(show.timelines?.map(t => t.id));
  if (ids.size !== (show.timelines?.length ?? 0) || ids.has(MAIN_TIMELINE)) throw new Error('Invalid or duplicate timeline identity.');
  for (const t of show.timelines ?? []) if (!show.scenes.some(s => s.id === t.sceneID)) throw new Error(`Missing scene for timeline ${t.name}.`);
  for (const track of show.tracks ?? []) if (track.timelineID && !ids.has(track.timelineID)) throw new Error('Missing timeline for track.');
  for (const v of show.visuals ?? []) if (v.timelineRefID) {
    const parent = show.tracks?.find(t => t.id === v.trackID);
    const child = show.timelines?.find(t => t.id === v.timelineRefID);
    if (!parent || parent.kind === 'audio' || !child || !parent.targets.some(t => t.sceneID === child.sceneID) || !canNestTimeline({ ...show, activeSceneId: child.sceneID }, child.id, parent.timelineID ?? MAIN_TIMELINE)) throw new Error('Missing or cyclic nested timeline.');
  }
}

/** Scene duplication remaps timeline references as well as surface targets. */
export function copySceneTimelines(show: MapShow, sceneID: string, copyID: string, surfaces: Map<string, string>) {
  const owned = (show.timelines ?? []).filter(t => t.sceneID === sceneID);
  const timelines = new Map(owned.map(t => [t.id, nextId('timeline')]));
  const ownedTracks = new Set((show.tracks ?? []).filter(t => t.timelineID && timelines.has(t.timelineID)).map(t => t.id));
  const used = (show.visuals ?? []).filter(v => ownedTracks.has(v.trackID ?? '') || v.targets.some(t => t.sceneID === sceneID));
  const tracks = (show.tracks ?? []).filter(t => t.targets.some(a => a.sceneID === sceneID) || used.some(v => v.trackID === t.id));
  const trackIDs = new Map(tracks.map(t => [t.id, nextId('track')]));
  const targets = (items: import('./visual-model').VisualTarget[]) => items.filter(t => t.sceneID === sceneID).map(t => ({ sceneID:copyID, ...(t.surfaceID ? { surfaceID:surfaces.get(t.surfaceID) } : {}) }));
  return {
    timelines: [...(show.timelines ?? []), ...owned.map(t => ({ ...t, id:timelines.get(t.id)!, sceneID:copyID, ...(t.surfaceID ? { surfaceID:surfaces.get(t.surfaceID) } : {}) }))],
    tracks: [...(show.tracks ?? []), ...tracks.map(t => ({ ...structuredClone(t), id:trackIDs.get(t.id)!, timelineID:t.timelineID ? timelines.get(t.timelineID) : undefined, targets:targets(t.targets) }))],
    visuals: [...(show.visuals ?? []), ...used.map(v => ({ ...structuredClone(v), id:nextId('visual'), trackID:v.trackID ? trackIDs.get(v.trackID) : undefined,
      timelineRefID:v.timelineRefID ? timelines.get(v.timelineRefID) : undefined, legacyTrack:v.legacyTrack ? surfaces.get(v.legacyTrack) : undefined, targets:targets(v.targets) }))],
  };
}
export function removeSceneTimelines(show: MapShow, sceneID: string): MapShow {
  const ids = new Set(show.timelines?.filter(t => t.sceneID === sceneID).map(t => t.id));
  const tracks = new Set(show.tracks?.filter(t => t.timelineID && ids.has(t.timelineID)).map(t => t.id));
  return { ...show, timelines:show.timelines?.filter(t => !ids.has(t.id)), tracks:show.tracks?.filter(t => !tracks.has(t.id)),
    visuals:show.visuals?.filter(v => !tracks.has(v.trackID ?? '') && !ids.has(v.timelineRefID ?? '')), activeTimelineID:ids.has(show.activeTimelineID ?? '') ? undefined : show.activeTimelineID };
}
