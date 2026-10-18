import { layerColor, type MapShow } from './document';
import type { VisualTrack } from './media-pool';
import type { Visual } from './visual-model';
import type { MapTimeline } from './timelines';

/** Surface geometry stays scene-owned. Its sequence is an ordinary reusable
 * timeline, composed by an ordinary nested clip in Main. Run after pool migration. */
export function normalizeSurfaceTimelines(show: MapShow): MapShow {
  let tracks = [...(show.tracks ?? [])], visuals = [...(show.visuals ?? [])];
  let timelines = [...(show.timelines ?? [])];
  let changed = false;
  // Keep an edited sequence reusable when its physical surface is removed.
  timelines = timelines.map(t => {
    if (!t.surfaceID) return t;
    const owner = show.scenes.find(s => s.surfaces.some(v => v.id === t.surfaceID));
    if (owner?.id === t.sceneID) return t;
    changed = true;
    const mainTracks = new Set(tracks.filter(track => !track.timelineID && track.targets.length === 1 && track.targets[0].surfaceID === t.surfaceID
      && visuals.some(v => v.trackID === track.id && v.timelineRefID === t.id)).map(track => track.id));
    if (owner) {
      tracks = tracks.map(track => track.timelineID === t.id || mainTracks.has(track.id)
        ? { ...track, targets:track.targets.map(a => ({ ...a, sceneID:owner.id })) } : track);
      visuals = visuals.map(v => mainTracks.has(v.trackID ?? '') && v.timelineRefID === t.id
        ? { ...v, targets:[{ sceneID:owner.id }] } : v);
      return { ...t, sceneID:owner.id };
    }
    visuals = visuals.filter(v => !(mainTracks.has(v.trackID ?? '') && v.timelineRefID === t.id));
    tracks = tracks.filter(track => !mainTracks.has(track.id) || visuals.some(v => v.trackID === track.id));
    const { surfaceID: _surfaceID, ...rest } = t;
    return rest;
  });
  for (const scene of show.scenes) for (const [index, surface] of scene.surfaces.entries()) {
    if (surface.kind === 'mask' || timelines.some(t => t.surfaceID === surface.id)) continue;
    changed = true;
    const id = `surface-timeline-${surface.id}`, mainID = `surface-track-${surface.id}`;
    const targets = [{ sceneID: scene.id, surfaceID: surface.id }];
    const child: MapTimeline = { id, name: surface.name, sceneID: scene.id, surfaceID: surface.id, durationS: scene.durationS };
    timelines.push(child);
    const own = (v: Visual) => !v.timelineRefID && v.targets.length === 1 && v.targets[0].sceneID === scene.id && v.targets[0].surfaceID === surface.id;
    // Only move whole exclusively assigned tracks. Shared-window visuals keep
    // one instance, their targets and their original position in Main.
    const candidates = tracks.filter(t => !t.timelineID && t.kind !== 'audio' && visuals.some(v => v.trackID === t.id)
      && visuals.filter(v => v.trackID === t.id).every(own));
    const ranks = candidates.map(t => tracks.indexOf(t));
    const first = Math.min(...ranks), last = Math.max(...ranks);
    const interleaved = tracks.slice(first, last + 1).some(t => !candidates.includes(t) && visuals.some(v => v.trackID === t.id && v.targets.some(a => a.sceneID === scene.id && (!a.surfaceID || a.surfaceID === surface.id))));
    const moved = interleaved ? [] : candidates;
    const moving = visuals.filter(v => moved.some(t => t.id === v.trackID));
    const ordered = [...moving].sort((a, b) => a.startS - b.startS);
    const sequential = moved.every(t => t.enabled && !t.locked) && ordered.every((v, i) => !v.continuous && (!i || ordered[i-1].startS + ordered[i-1].durationS <= v.startS));
    const videoID = `${id}-video`, audioID = `${id}-audio`;
    const video: VisualTrack = { id: videoID, timelineID:id, name:'V1', kind:'video', targets, enabled:true, locked:false };
    const audio: VisualTrack = { ...video, id:audioID, name:'A1', kind:'audio' };
    const main: VisualTrack = { ...video, id:mainID, timelineID:undefined, name:surface.name };
    const insertAt = moved.length ? tracks.indexOf(moved.at(-1)!) + 1 : tracks.length;
    tracks.splice(insertAt, 0, main);
    if (sequential) {
      tracks = tracks.filter(t => !moved.includes(t));
      visuals = visuals.map(v => moving.includes(v) ? { ...v, trackID:videoID } : v);
      tracks.push(video);
    } else {
      tracks = tracks.map(t => moved.includes(t) ? { ...t, timelineID:id, kind:'video', targets } : t);
      if (!moved.length) tracks.push(video);
    }
    tracks.push(audio);
    visuals.push({ id:`surface-use-${surface.id}`, name:surface.name, timelineRefID:id, trackID:mainID,
      startS:0, durationS:scene.durationS, inS:0, loop:false, targets:[{ sceneID:scene.id }],
      mapping:'repeat', opacity:1, color:surface.color ?? layerColor(index) });
  }
  // The placeholder V1 is only needed before the first mapped surface. User
  // tracks and scene-wide content are retained, even when they are empty.
  const filtered = tracks.filter(t => !show.scenes.some(s => s.surfaces.some(v => v.kind !== 'mask')
    && t.id === `track-default-${s.id}-video` && !visuals.some(v => v.trackID === t.id)));
  if (filtered.length !== tracks.length) changed = true;
  for (const scene of show.scenes) if (!scene.surfaces.some(v => v.kind !== 'mask')
    && !filtered.some(t => !t.timelineID && t.kind !== 'audio' && t.targets.some(a => a.sceneID === scene.id))) {
    filtered.push({ id:`track-default-${scene.id}-video`, name:'V1', kind:'video', targets:[{ sceneID:scene.id }], enabled:true, locked:false });
    changed = true;
  }
  return changed ? { ...show, version:show.version>=7?show.version:7, tracks:filtered, timelines, visuals } : show;
}
