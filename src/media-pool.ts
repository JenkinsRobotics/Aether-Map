import { currentTimelineID, MAIN_TIMELINE } from './timelines';
import { nextId, layerColor, type MapShow, type Surface } from './document';
import type { Visual, VisualTarget } from './visual-model';
import { sourceName } from './surface-assets';
import { contentClip } from './surface-assets';

export const POOL_DRAG_TYPE = 'application/x-aether-pool-asset';

export interface PoolAsset {
  id: string;
  name: string;
  folder?: string;
  source: Surface['source'];
}
export type TrackKind = 'video' | 'audio';
export interface VisualTrack {
  timelineID?: string;
  eq?: import("./live/timeline-audio-engine").TrackEQ;
  kind?: TrackKind;
  volume?: number;
  solo?: boolean;
  id: string;
  name: string;
  targets: VisualTarget[];
  enabled: boolean;
  locked: boolean;
}
/** Clip source overrides are explicit, independent edits; otherwise use the pool definition. */
export function visualSource(show: MapShow, visual: Visual): Surface['source'] {
  return visual.source ?? show.pool?.find(a => a.id === visual.assetID)?.source ?? { mediaId: null, rect: [0, 0, 1920, 1080] };
}
/** Legacy content becomes reusable without changing clip identity, targets or timing. */
export function normalizeMediaPool(show: MapShow): MapShow {
  const pool = [...(show.pool ?? [])], tracks = [...(show.tracks ?? [])];
  let changed = show.version < 6 || !show.pool || !show.tracks;
  const visuals = (show.visuals ?? []).map(v => {
    let next = v;
    if (!v.assetID && !v.mask && !v.timelineRefID) {
      const source = visualSource(show, v), signature = JSON.stringify(source);
      let asset = pool.find(a => JSON.stringify(a.source) === signature);
      if (!asset) { asset = { id: `pool-${v.id}`, name: v.name, source: structuredClone(source) }; pool.push(asset); }
      const { source: _source, ...rest } = next;
      next = { ...rest, assetID: asset.id }; changed = true;
    }
    if (!next.trackID) {
      const owner = v.targets.length === 1 && v.targets[0].surfaceID
        ? show.timelines?.find(t => t.surfaceID === v.targets[0].surfaceID) : undefined;
      const timelineID = owner?.id ?? currentTimelineID(show);
      const kind = show.media.find(m => m.id === visualSource({ ...show, pool }, next).mediaId)?.kind === 'audio' ? 'audio' : 'video';
      let track = timelineID === MAIN_TIMELINE ? undefined : tracks.find(t => (t.timelineID ?? MAIN_TIMELINE) === timelineID && (t.kind ?? 'video') === kind && !t.locked
        && JSON.stringify(t.targets) === JSON.stringify(v.targets));
      if (!track) {
        track = { ...(timelineID !== MAIN_TIMELINE ? { timelineID } : {}), id: `track-${v.id}`, name: kind === 'audio' ? 'A1' : 'V1', kind, targets: v.targets.map(t => ({ ...t })), enabled: true, locked: false };
        tracks.push(track);
      }
      next = { ...next, trackID: track.id }; changed = true;
    }
    return next;
  });
  for (const scene of show.scenes) {
    for (const kind of ['video', 'audio'] as const) {
      if (tracks.some(t => !t.timelineID && (t.kind ?? 'video') === kind && t.targets.some(a => a.sceneID === scene.id))) continue;
      tracks.push({ id: `track-default-${scene.id}-${kind}`, name: kind === 'video' ? 'V1' : 'A1', kind,
        targets: [{ sceneID: scene.id }], enabled: true, locked: false }); changed = true;
    }
  }
  // Imported files are pool entries even before their first timeline use.
  for (const media of show.media) {
    if (pool.some(a => a.source.mediaId === media.id)) continue;
    pool.push({ id: `pool-media-${media.id}`, name: media.name, source: { mediaId: media.id, rect: [0, 0, media.width, media.height] } }); changed = true;
  }
  return changed ? { ...show, version: show.version >= 7 ? show.version : 6, pool, tracks, visuals } : show;
}
export function addPoolAsset(show: MapShow, source: Surface['source'], name = sourceName(source, show.media)): MapShow {
  return { ...show, version: show.version >= 7 ? show.version : 6, pool: [...(show.pool ?? []), { id: nextId('pool'), name, source: structuredClone(source) }] };
}
export function poolUses(show: MapShow, id: string): number {
  const mediaID = show.pool?.find(a => a.id === id)?.source.mediaId;
  return (show.visuals?.filter(v => v.assetID === id).length ?? 0)
    + (mediaID ? (show.visuals??[]).reduce((sum,v)=>sum+Object.values(v.looks??{}).filter(look=>look?.source.mediaId===mediaID).length,0) : 0)
    + (mediaID ? show.scenes.filter(s => s.setupBackground?.mediaId === mediaID).length : 0);
}
export function removePoolAsset(show: MapShow, id: string): MapShow {
  if (poolUses(show, id)) return show;
  const mediaID = show.pool?.find(a => a.id === id)?.source.mediaId;
  const pool = show.pool?.filter(a => a.id !== id);
  const referenced = pool?.some(a => a.source.mediaId === mediaID) || show.visuals?.some(v => visualSource(show, v).mediaId === mediaID || Object.values(v.looks??{}).some(look=>look?.source.mediaId===mediaID))
    || [...show.unassignedSurfaces, ...show.scenes.flatMap(s => s.surfaces)].some(s => s.source.mediaId === mediaID || s.clips.some(c => c.mediaId === mediaID || c.source?.mediaId === mediaID));
  return { ...show, pool, media: mediaID && !referenced ? show.media.filter(m => m.id !== mediaID) : show.media };
}
export function addVisualTrack(show: MapShow, targets: VisualTarget[], name?: string, kind: TrackKind = 'video'): MapShow {
  return { ...show, tracks: [...(show.tracks ?? []), { id: nextId('track'), ...(currentTimelineID(show) !== MAIN_TIMELINE ? { timelineID: currentTimelineID(show) } : {}), kind, name: name ?? `${kind === 'audio' ? 'A' : 'V'}${(show.tracks?.filter(t => (t.timelineID ?? MAIN_TIMELINE) === currentTimelineID(show) && (t.kind ?? 'video') === kind && t.targets.some(a => targets.some(b => b.sceneID === a.sceneID))).length ?? 0) + 1}`, targets, enabled: true, locked: false }] };
}
/** Every drop creates a distinct clip. No source duplication, implicit replacement or shared clock. */
export function placePoolAsset(show: MapShow, assetID: string, trackID: string, startS?: number): MapShow {
  const asset = show.pool?.find(a => a.id === assetID), track = show.tracks?.find(t => t.id === trackID);
  if (!asset || !track || track.locked || !trackAcceptsSource(show, track, asset.source)) return show;
  const source = asset.source;
  const end = Math.max(0, ...(show.visuals ?? []).filter(v => v.trackID === trackID).map(v => v.startS + v.durationS));
  const timing = contentClip(source, show.media, startS === undefined ? end : Math.max(0, startS));
  const { source: _source, ...clip } = timing;
  const visual: Visual = { ...clip, name: asset.name, assetID, trackID, targets: track.targets.map(t => ({ ...t })), mapping: 'repeat', color: layerColor(show.tracks?.indexOf(track) ?? 0), opacity: 1 };
  return { ...show, visuals: [...(show.visuals ?? []), visual] };
}
/** Track position is composition order; clips within a track retain their saved order. */
export function orderedVisuals(show: MapShow): Visual[] {
  const visuals = [...(show.visuals ?? [])];
  if (!show.tracks?.length) return visuals;
  const ranks = new Map(show.tracks.map((t, i) => [t.id, i]));
  return visuals.sort((a, b) => (ranks.get(a.trackID ?? '') ?? -1) - (ranks.get(b.trackID ?? '') ?? -1));
}

export function trackAcceptsSource(show: MapShow, track: VisualTrack, source: Surface['source']): boolean {
  const media = show.media.find(m => m.id === source.mediaId);
  return track.kind === 'audio' ? !!media && (media.kind === 'audio' || media.kind === 'video') : media?.kind !== 'audio';
}
