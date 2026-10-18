import { expect, it } from 'vitest';
import { emptyShow, newSurface } from './document';
import { normalizeMediaPool, addPoolAsset, placePoolAsset } from './media-pool';
import { normalizeSurfaceTimelines } from './surface-timelines';
import { timelineTracks, scheduledVisuals, copySceneTimelines, removeTimeline } from './timelines';
import { newVisual } from './visual-document';
import { parseShow, serializeShow } from './show-file';
import { sceneVisuals } from './visual-render';

const source = { mediaId:null, rect:[0,0,100,100] as [number,number,number,number], fill:'#ff0000' };
function fixture() {
  const s = emptyShow(); s.scenes[0].surfaces = [newSurface(s.output,0), newSurface(s.output,1), newSurface(s.output,2)];
  return s;
}
const normalize = (s: ReturnType<typeof emptyShow>) => normalizeSurfaceTimelines(normalizeMediaPool(s));

it('defaults to one Main layer per surface plus A1, with independent V1/A1 children and persistent references', () => {
  let s = normalize(fixture());
  expect(timelineTracks(s).filter(t => t.kind === 'video')).toHaveLength(3);
  expect(timelineTracks(s).filter(t => t.kind === 'audio')).toHaveLength(1);
  expect(s.timelines).toHaveLength(3);
  for (const t of s.timelines!) {
    expect(timelineTracks(s,t.id).map(t => t.name)).toEqual(['V1','A1']);
    expect(s.visuals?.filter(v => v.timelineRefID === t.id)).toHaveLength(1);
  }
  expect(normalize(s)).toBe(s);
  s = parseShow(serializeShow(s)); expect(normalize(s)).toBe(s);
  expect(s.timelines?.map(t => t.surfaceID)).toEqual(s.scenes[0].surfaces.map(v => v.id));
  s = addPoolAsset(s,source,'Red');
  const child = s.timelines![0], video = timelineTracks(s,child.id)[0];
  s = placePoolAsset(s,s.pool![0].id,video.id,2);
  s = placePoolAsset(s,s.pool![0].id,video.id);
  expect(s.visuals!.at(-1)!.startS).toBe(2+s.visuals!.at(-2)!.durationS);
  expect(s.visuals!.at(-1)!.targets).toEqual([{sceneID:s.activeSceneId,surfaceID:child.surfaceID}]);
  expect(scheduledVisuals(s,3).filter(v=>v.visual.assetID)).toHaveLength(2);
  expect(sceneVisuals(s,s.scenes[0],3)).toHaveLength(1);
});

it('migrates sequential uses together, preserves overlapping layers and shared-window instances', () => {
  let s = fixture(); const scene = s.scenes[0], targets=[{sceneID:scene.id,surfaceID:scene.surfaces[0].id}];
  const first = newVisual(s,source,targets,2); first.durationS=4;
  const second = {...first,id:'second',startS:7};
  const shared = {...first,id:'shared',mapping:'span' as const,targets:scene.surfaces.slice(1).map(v=>({sceneID:scene.id,surfaceID:v.id}))};
  s.visuals=[first,second,shared]; s=normalizeMediaPool(s);
  const before=sceneVisuals(s,scene,3).map(v=>({source:v.source,corners:v.corners,masks:v.masks,clock:v.mediaTimeS}));
  s=normalizeSurfaceTimelines(s);
  expect(s.visuals!.find(v=>v.id===first.id)?.trackID).toBe(s.visuals!.find(v=>v.id===second.id)?.trackID);
  expect(s.visuals!.find(v=>v.id==='shared')).toMatchObject({id:shared.id, targets:shared.targets, mapping:'span', startS:shared.startS, durationS:shared.durationS});
  expect(sceneVisuals(s,scene,3).map(v=>({source:v.source,corners:v.corners,masks:v.masks,clock:v.mediaTimeS}))).toEqual(before);
  const overlap=fixture(); overlap.visuals=[newVisual(overlap,source,[{sceneID:overlap.activeSceneId,surfaceID:overlap.scenes[0].surfaces[0].id}]),newVisual(overlap,{...source,fill:'#0000ff'},[{sceneID:overlap.activeSceneId,surfaceID:overlap.scenes[0].surfaces[0].id}])];
  const migrated=normalize(overlap), child=migrated.timelines![0];
  expect(timelineTracks(migrated,child.id).filter(t=>t.kind==='video')).toHaveLength(2);
  expect(sceneVisuals(migrated,migrated.scenes[0],1).map(v=>v.source.fill)).toEqual(['#ff0000','#0000ff']);
});

it('does not regroup interleaved shared layers, recreate deleted uses, or duplicate bindings with a copied scene', () => {
  let s=fixture(); const targets=[{sceneID:s.activeSceneId,surfaceID:s.scenes[0].surfaces[0].id}];
  s.visuals=[newVisual(s,source,targets),newVisual(s,{...source,fill:'#00ff00'},[{sceneID:s.activeSceneId}]),newVisual(s,{...source,fill:'#0000ff'},targets)];
  s=normalize(s);
  expect(sceneVisuals(s,s.scenes[0],1).map(v=>v.source.fill)).toEqual(['#ff0000','#00ff00','#0000ff']);
  const use=s.visuals!.find(v=>v.timelineRefID)!;
  s={...s,visuals:s.visuals!.filter(v=>v.id!==use.id)};
  expect(normalize(s)).toBe(s);
  expect(removeTimeline(s,use.timelineRefID!)).toBe(s);
  const original=s.scenes[0], copy={...structuredClone(original),id:'copy'};
  const ids=new Map(copy.surfaces.map(v=>{const old=v.id;v.id+='copy';return [old,v.id];}));
  s={...s,...copySceneTimelines(s,original.id,copy.id,ids),scenes:[original,copy]};
  expect(normalize(s).timelines).toHaveLength(6);
  expect(parseShow(serializeShow(s)).timelines).toHaveLength(6);
});

it('removes a deleted surface layer from Main while retaining its sequence for reuse', () => {
  let s=normalize(fixture());
  const surface=s.scenes[0].surfaces[0], child=s.timelines!.find(t=>t.surfaceID===surface.id)!;
  s={...s,scenes:s.scenes.map(scene=>({...scene,surfaces:scene.surfaces.filter(v=>v.id!==surface.id)}))};
  s=normalize(s);
  expect(timelineTracks(s).filter(t=>t.kind==='video')).toHaveLength(2);
  expect(s.visuals!.filter(v=>v.timelineRefID===child.id)).toHaveLength(0);
  expect(s.timelines!.find(t=>t.id===child.id)?.surfaceID).toBeUndefined();
  expect(timelineTracks(s,child.id)).toHaveLength(2);
  expect(parseShow(serializeShow(s)).timelines).toHaveLength(3);
  s=normalize({...s,scenes:s.scenes.map(scene=>({...scene,surfaces:[]}))});
  expect(timelineTracks(s).map(t=>t.kind).sort()).toEqual(['audio','video']);
  expect(normalize(s)).toBe(s);
});
