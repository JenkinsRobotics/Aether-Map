import { expect, it } from 'vitest';
import { emptyShow, newSurface, quadCorners, type Quad } from './document';
import { normalizeMediaPool, addPoolAsset, placePoolAsset } from './media-pool';
import { normalizeSurfaceTimelines } from './surface-timelines';
import { timelineTracks } from './timelines';
import { DEFAULT_PLACEMENT, alignPlacement, placementCorners, resizePlacement, readVisualPlacement } from './visual-placement';
import { sceneVisuals } from './visual-render';
import { surfaceComposition } from './surface-composition';
import { placementProjectionStyle } from './source-picture';
import { serializeShow, parseShow } from './show-file';

function fixture() {
  let s=emptyShow();const face=newSurface(s.output,0); face.corners=[[100,80],[500,100],[450,420],[120,400]];
  s.scenes[0].surfaces=[face];s=normalizeSurfaceTimelines(normalizeMediaPool(s));
  s=addPoolAsset(s,{mediaId:null,rect:[0,0,1920,1080],fill:'#ff0000'},'Red');
  s=placePoolAsset(s,s.pool![0].id,timelineTracks(s).find(t=>t.kind==='video')!.id,0);
  // Main holds the use; it targets the face directly (no per-surface timeline).
  s={...s,visuals:s.visuals!.map((v,i,all)=>i===all.length-1?{...v,targets:[{sceneID:s.activeSceneId,surfaceID:face.id}]}:v)};
  return {s,face,clip:s.visuals!.at(-1)!};
}
it('round-trips per-use placement without modifying geometry, pool source, timing or another use',()=>{
  let {s,face,clip}=fixture();const geometry=structuredClone(face),source=structuredClone(s.pool);
  s=placePoolAsset(s,s.pool![0].id,clip.trackID!,20);
  clip.placement={xPercent:25,yPercent:60,widthPercent:40,heightPercent:50,rotationDeg:30};
  const parsed=parseShow(serializeShow(s));
  expect(parsed.visuals!.find(v=>v.id===clip.id)?.placement).toEqual(clip.placement);
  expect(parsed.visuals!.at(-1)?.placement).toBeUndefined();
  expect(s.scenes[0].surfaces[0]).toEqual(geometry);expect(s.pool).toEqual(source);
  const picture=sceneVisuals(s,s.scenes[0],1)[0],projection=placementProjectionStyle(picture)!;
  expect(picture.corners).toEqual(face.corners);
  expect(projection.layers).toHaveLength(1);expect(projection.content.transform).not.toEqual(projection.layers[0].transform);
  const focused=surfaceComposition(s,face,1);
  focused.pictures[0].corners.forEach((p,i)=>{expect(p[0]).toBeCloseTo(quadCorners(focused.frame)[i][0]);expect(p[1]).toBeCloseTo(quadCorners(focused.frame)[i][1]);});
  expect(focused.pictures[0].visualPlacement).toEqual(clip.placement);
});
it('resizing a rotated rectangle fixes its opposite corner and alignment uses its rotated bounds',()=>{
  const frame:[number,number,number,number]=[0,0,1000,500],start={...DEFAULT_PLACEMENT,widthPercent:40,heightPercent:40,rotationDeg:30};
  const before=placementCorners(start,frame),point:[number,number]=[before[2][0]+90,before[2][1]+80];
  const resized=resizePlacement(start,2,point,frame),after=placementCorners(resized,frame);
  expect(after[0][0]).toBeCloseTo(before[0][0]);expect(after[0][1]).toBeCloseTo(before[0][1]);
  expect(after[2][0]).toBeCloseTo(point[0]);expect(after[2][1]).toBeCloseTo(point[1]);
  const aligned=placementCorners(alignPlacement(start,'x','start',frame),frame);
  expect(Math.min(...aligned.map(p=>p[0]))).toBeCloseTo(0);
  expect(readVisualPlacement({widthPercent:0,xPercent:Infinity,rotationDeg:NaN})).toMatchObject({widthPercent:.1,xPercent:50,rotationDeg:0});
});
it('focused Span preview retains the shared window and alpha projection instead of refitting each face',()=>{
  const {s,face,clip}=fixture(),other=newSurface(s.output,1);other.corners=[[600,80],[950,80],[950,400],[600,400]];
  s.scenes[0].surfaces.push(other);face.alphaMask={png:'data:image/png;base64,a'};
  clip.targets.push({sceneID:s.activeSceneId,surfaceID:other.id});clip.mapping='span';clip.placement={...DEFAULT_PLACEMENT,widthPercent:50};
  const pictures=sceneVisuals(s,s.scenes[0],1,false,face.id);
  expect(pictures).toHaveLength(1);expect(pictures[0].corners[1][0]).toBe(950);
  expect(placementProjectionStyle(pictures[0])?.layers).toHaveLength(2);
  const focused=surfaceComposition(s,face,1).pictures[0];
  expect(focused.alphaProjection).toBeDefined();expect(focused.visualPlacement).toEqual(clip.placement);
  expect(placementProjectionStyle(focused)?.layers).toHaveLength(2);
  expect(s.scenes[0].surfaces[0].corners).toEqual([[100,80],[500,100],[450,420],[120,400]] as Quad);
});
