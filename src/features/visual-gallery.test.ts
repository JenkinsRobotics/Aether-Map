import { expect, test } from 'vitest';
import { GALLERY_VISUALS, GALLERY_CATEGORIES, filterGallery, recentVisuals, rememberVisual } from './visual-gallery';
import { NATIVE_SHADER_IDS } from './gallery-shaders';
import { shaderAt } from './shader-motion';
import { shaderRenderSpeed } from './ShaderMedia';
import { emptyShow } from '../document';
import { addPoolAsset, normalizeMediaPool, placePoolAsset, visualSource } from '../media-pool';
import { normalizeVisuals } from '../visual-document';
import { parseShow, serializeShow } from '../show-file';

test('every gallery source can be placed and reopened with its exact parameters and motion',()=>{
 expect(GALLERY_VISUALS.length).toBeGreaterThan(80);
 expect(new Set(GALLERY_VISUALS.map(v=>v.id)).size).toBe(GALLERY_VISUALS.length);
 expect(new Set(GALLERY_VISUALS.map(v=>JSON.stringify(v.shader))).size).toBe(GALLERY_VISUALS.length);
 for(const visual of GALLERY_VISUALS){
  let show=normalizeMediaPool(normalizeVisuals(emptyShow()));
  show=addPoolAsset(show,{mediaId:null,rect:[0,0,1920,1080],shader:structuredClone(visual.shader)},visual.name);
  show=placePoolAsset(show,show.pool!.at(-1)!.id,show.tracks![0].id,2);
  const reopened=parseShow(serializeShow(show));
  const saved=visualSource(reopened,reopened.visuals![0]).shader!;
  expect(saved.colors,visual.id).toEqual(visual.shader.colors);
  expect(saved.parameters,visual.id).toEqual(visual.shader.parameters);
  expect(saved.time,visual.id).toEqual(visual.shader.time);
  for(const time of [0,3.75,9])expect(shaderAt(saved,time).parameters,visual.id).toEqual(shaderAt(visual.shader,time).parameters);
  expect(reopened.visuals![0].startS).toBe(2);
  if(NATIVE_SHADER_IDS.has(visual.shader.preset))expect(shaderRenderSpeed(visual.shader.preset)).toBe(1);
 }
});
test('all categories are populated, search respects both category and query',()=>{
 for(const category of GALLERY_CATEGORIES)expect(filterGallery(category,'').length,category).toBeGreaterThan(0);
 expect(filterGallery('All','  PUMPKIN  ').some(v=>v.shader.preset==='jack-lantern')).toBe(true);
 expect(filterGallery('Eyes','pumpkin')).toEqual([]);
 expect(filterGallery('Eyes','eye')).toHaveLength(3);
});
test('recent visuals tolerate invalid storage and remove unknown or duplicate entries',()=>{
 const id=GALLERY_VISUALS[0].id;
 expect(recentVisuals('broken')).toEqual([]);expect(recentVisuals('{}')).toEqual([]);
 expect(recentVisuals(JSON.stringify([null,'missing',id,id]))).toEqual([id]);
 const ids=GALLERY_VISUALS.slice(0,12).map(v=>v.id);
 expect(rememberVisual(ids[2],ids)).toEqual([ids[2],ids[0],ids[1],...ids.slice(3,8)]);
 expect(recentVisuals(JSON.stringify(ids))).toHaveLength(8);
});
