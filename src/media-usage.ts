import { visualSource } from './media-pool';
import type { MapShow } from "./document";
import { clipMediaID } from './surface-assets';

/** Count every authoring reference, including clips and setup photos. */
export function mediaUsage(show: MapShow, mediaId: string): number {
  const onSurface = (surface: MapShow["unassignedSurfaces"][number]) =>
    (surface.source.mediaId === mediaId ? 1 : 0) +
    surface.clips.filter((clip) => clipMediaID(clip) === mediaId).length;
  return (show.visuals?.reduce((sum,v)=>sum+Object.values(v.looks??{}).filter(look=>look?.source.mediaId===mediaId).length,0)??0) + (show.pool?.filter(a => a.source.mediaId === mediaId).length ?? 0) + (show.visuals?.filter(v => visualSource(show, v).mediaId === mediaId).length ?? 0) + show.unassignedSurfaces.reduce((total, surface) => total + onSurface(surface), 0) +
    show.scenes.reduce((total, scene) => total +
    (scene.setupBackground?.mediaId === mediaId ? 1 : 0) +
    scene.surfaces.reduce((count, surface) => count + onSurface(surface), 0), 0);
}

/** Referenced media must be detached by the author before deleting the asset. */
export function removeUnusedMedia(show: MapShow, mediaId: string): MapShow {
  return mediaUsage(show, mediaId) > 0 ? show : {
    ...show, media: show.media.filter((media) => media.id !== mediaId),
  };
}
