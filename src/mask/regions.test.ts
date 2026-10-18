import { expect,it } from 'vitest';
import { emptyShow } from '../document';
import { surfaceFromPath } from './shape-surface';
import { combineSurfaces } from './regions';
import { pointInSurfaceMask } from './clip';
import { surfacesAt,translateSurface } from '../surface-interaction';
import { parseShow,serializeShow } from '../show-file';
const rect=(x:number,y:number,w:number)=>({points:[[x,y],[x+w,y],[x+w,y+w],[x,y+w]] as [number,number][],closed:true});
function fixture(){const show=emptyShow();show.scenes[0].surfaces=[surfaceFromPath(rect(0,0,100),show.output,0,false),surfaceFromPath(rect(25,25,50),show.output,1,false)];return show;}
it('difference clips and picks holes, persists and transforms them with one surface',()=>{
 const original=fixture(),ids=original.scenes[0].surfaces.map(s=>s.id),next=combineSurfaces(original,ids,'difference').show,s=next.scenes[0].surfaces[0];
 expect(original.scenes[0].surfaces).toHaveLength(2);expect(s.masks).toHaveLength(2);expect(pointInSurfaceMask(s,[50,50])).toBe(false);expect(pointInSurfaceMask(s,[10,10])).toBe(true);expect(surfacesAt([s],[50,50],0)).toEqual([]);
 const restored=parseShow(serializeShow(next));expect(restored.scenes[0].surfaces[0].maskFillRule).toBe('evenodd');
 const moved={...s,...translateSurface(s,[200,100])};expect(pointInSurfaceMask(moved,[250,150])).toBe(false);expect(pointInSurfaceMask(moved,[210,110])).toBe(true);
 expect(combineSurfaces(next,[s.id],'release').show.scenes[0].surfaces).toHaveLength(2);
});
it('compound fill can be changed without rewriting curves; legacy outlines remain a union',()=>{
 const show=fixture(),s=combineSurfaces(show,show.scenes[0].surfaces.map(s=>s.id),'compound').show.scenes[0].surfaces[0];
 expect(pointInSurfaceMask(s,[50,50])).toBe(false);expect(pointInSurfaceMask({...s,maskFillRule:undefined},[50,50])).toBe(true);expect(pointInSurfaceMask({...s,maskFillRule:'nonzero'},[50,50])).toBe(true);
});
it('refuses locked and cross-scene combinations without changing the document',()=>{
 const show=fixture();show.scenes[0].surfaces[1].locked=true;const ids=show.scenes[0].surfaces.map(s=>s.id);expect(()=>combineSurfaces(show,ids,'union')).toThrow(/unlocked/);
 const other=structuredClone(show.scenes[0]);other.id='other';other.surfaces=[{...other.surfaces[1],id:'elsewhere'}];show.scenes.push(other);expect(()=>combineSurfaces(show,[ids[0],'elsewhere'],'union')).toThrow(/same scene/);
});

it('bakes displayed static transforms and keeps released content projection fixed',()=>{
 const show=fixture();show.scenes[0].surfaces.forEach(s=>s.transform={xPx:200,yPx:100,scaleX:1,scaleY:1,rotationDeg:0});
 const next=combineSurfaces(show,show.scenes[0].surfaces.map(s=>s.id),'difference').show,s=next.scenes[0].surfaces[0];
 expect(pointInSurfaceMask(s,[210,110])).toBe(true);expect(pointInSurfaceMask(s,[250,150])).toBe(false);expect(s.transform).toBeUndefined();
 const pieces=combineSurfaces(next,[s.id],'release').show.scenes[0].surfaces;expect(pieces.every(p=>JSON.stringify(p.corners)===JSON.stringify(s.corners))).toBe(true);expect(pieces[1].masks).toHaveLength(1);
});
