import { visualSource } from './media-pool';
import { newSurface, nextId, type MapShow, type Surface } from './document';
import { clipSource, contentClip, sourceHasContent, sourceID, sourceName } from './surface-assets';
import type { Visual, VisualTarget } from './visual-model';

/** Idempotent legacy import; no content or timing is inferred from the playhead. */
export function normalizeVisuals(show: MapShow): MapShow {
  let visuals = [...(show.visuals ?? [])];
  let changed = show.visuals === undefined || show.version < 4;
  const extract = (surface: Surface, sceneID: string): Surface => {
    const clips = surface.clips.length ? surface.clips : !surface.sequence && sourceHasContent(surface.source)
      ? [{ ...contentClip(surface.source, show.media, 0, sourceID(surface.id)), continuous: true }] : [];
    if (!clips.length) return surface;
    changed = true;
    for (const clip of clips) {
      const source = clipSource(surface, clip, show.media);
      if (visuals.some(v => v.id === clip.id)) continue;
      visuals.push({ ...clip, id: clip.id, name: clip.name ?? sourceName(source, show.media), source,
        targets: [{ sceneID, surfaceID: surface.id }], mapping: 'repeat', color: surface.color, opacity: 1,
        ...('continuous' in clip ? { continuous: true } : { legacyTrack: surface.id }),
        ...(surface.kind === 'mask' ? { mask: true } : {}),
      });
    }
    return { ...surface, clips: [], sequence: false, source: { mediaId: null, rect: surface.source.rect } };
  };
  const scenes = show.scenes.map(scene => ({ ...scene, surfaces: scene.surfaces.map(s => extract(s, scene.id)) }));
  const unassignedSurfaces = show.unassignedSurfaces.map(s => extract(s, ''));
  const owners = new Map([...scenes.flatMap(scene => scene.surfaces.map(s => [s.id, scene.id] as const)), ...unassignedSurfaces.map(s => [s.id, ''] as const)]);
  visuals = visuals.map(v => {
    const targets = v.targets.flatMap(t => t.surfaceID ? owners.has(t.surfaceID) ? [{ ...t, sceneID: owners.get(t.surfaceID)! }] : [] : scenes.some(s => s.id === t.sceneID) ? [t] : []);
    if (JSON.stringify(targets) === JSON.stringify(v.targets)) return v;
    changed = true; return { ...v, targets };
  });
  return changed ? { ...show, version: show.version >= 5 ? show.version : 4, visuals, scenes, unassignedSurfaces } : show;
}

export function newVisual(show: MapShow, source: Surface['source'], targets: VisualTarget[], timeS = 0): Visual {
  return { ...contentClip(source, show.media, timeS), source, name: sourceName(source, show.media),
    targets, mapping: 'repeat', color: newSurface(show.output, show.visuals?.length ?? 0).color, opacity: 1 };
}

/** Existing source editors consume a projection; surface geometry is never copied into saved visual data. */
export function visualSurface(show: MapShow, visual: Visual): Surface {
  const first = visual.targets[0];
  const scene = show.scenes.find(s => s.id === first?.sceneID);
  const geometry = (scene?.surfaces ?? show.unassignedSurfaces).find(s => s.id === first?.surfaceID);
  const base = geometry ?? newSurface(show.output, 0);
  return { ...base, id: visual.id, name: visual.name, enabled: visual.enabled !== false, locked: visual.locked,
    source: visualSource(show, visual), color: visual.color, opacity: visual.opacity, cues: [], animation: undefined, modulation: undefined, transform: undefined,
    masks: [], maskCurves: undefined, bend: undefined, alphaMask: undefined,
    clips: visual.continuous ? [] : [visual], sequence: !visual.continuous };
}

export function duplicateVisual(show: MapShow, id: string): MapShow {
  const index = show.visuals?.findIndex(v => v.id === id) ?? -1;
  if (index < 0) return show;
  const visual = show.visuals![index];
  if (visual.locked) return show;
  const copy = { ...structuredClone(visual), id: nextId('visual'), name: `${visual.name} copy`, legacyTrack: undefined };
  const tracks = show.tracks ? [...show.tracks] : undefined;
  const trackIndex = tracks?.findIndex(t => t.id === visual.trackID) ?? -1;
  if (tracks && trackIndex >= 0) {
    copy.trackID = nextId('track');
    tracks.splice(trackIndex + 1, 0, { ...tracks[trackIndex], id: copy.trackID, name: `${tracks[trackIndex].name} copy` });
  }
  const visuals = [...show.visuals!]; visuals.splice(index + 1, 0, copy);
  return { ...show, visuals, ...(tracks ? { tracks } : {}) };
}
