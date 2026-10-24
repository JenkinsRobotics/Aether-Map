import type { MapShow } from './document';

/** Keeps surface timelines that saved shows already have consistent with their
 * surfaces (a moved surface's sequence follows it; a deleted one's stays
 * reusable). New surfaces get none. Run after pool migration. */
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
  // A new show has one scene and one Main timeline: surfaces no longer get a
  // timeline of their own by default (Jonathan, 2026-10-22). Each scene keeps
  // one Main video track for its visuals.
  const filtered = tracks;
  for (const scene of show.scenes) if (!filtered.some(t => !t.timelineID && t.kind !== 'audio' && t.targets.some(a => a.sceneID === scene.id))) {
    filtered.push({ id:`track-default-${scene.id}-video`, name:'V1', kind:'video', targets:[{ sceneID:scene.id }], enabled:true, locked:false });
    changed = true;
  }
  return changed ? { ...show, version:show.version>=7?show.version:7, tracks:filtered, timelines, visuals } : show;
}
