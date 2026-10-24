import type { MapShow } from '../document';
import { visualSource } from '../media-pool';
import { parseShow, serializeShow } from '../show-file';

export function verifyShow(show: MapShow, evaluated: Record<string, unknown>) {
  parseShow(serializeShow(show));
  const issues: {clip_id: string; problem: string}[] = [];
  for (const clip of show.visuals ?? []) {
    if (clip.assetID && !show.pool?.some(a => a.id === clip.assetID)) issues.push({clip_id:clip.id,problem:'Missing asset'});
    if (clip.trackID && !show.tracks?.some(t => t.id === clip.trackID)) issues.push({clip_id:clip.id,problem:'Missing track'});
    if (clip.timelineRefID && !show.timelines?.some(t => t.id === clip.timelineRefID)) issues.push({clip_id:clip.id,problem:'Missing nested timeline'});
    const source = visualSource(show, clip);
    if (source.mediaId && !show.media.some(m => m.id === source.mediaId)) issues.push({clip_id:clip.id,problem:'Missing media metadata'});
    for (const target of clip.targets) {
      const scene = show.scenes.find(s => s.id === target.sceneID);
      if (!scene || target.surfaceID && !scene.surfaces.some(s => s.id === target.surfaceID)) issues.push({clip_id:clip.id,problem:'Missing target'});
    }
  }
  const layers = evaluated.layers as Record<string, unknown>[];
  return {changed:false,valid:issues.length===0,round_trip:true,scene_id:evaluated.scene_id,time_s:evaluated.time_s,
    evaluation:'canonical Main composition',pixel_preview:false,layer_count:layers.length,
    visible_layer_count: layers.filter(layer => (layer.opacity as number) > 0).length,
    blackout:!!show.output.blackout,issues:issues.slice(0,25),issue_count:issues.length,
    layers:layers.slice(0,15).map(({masks,...layer})=>({...layer,mask_count:(masks as unknown[]).length})),
    returned_layers:Math.min(15,layers.length),complete_layers:layers.length<=15};
}
