import { animateSurface } from "../features/animation";
import { booleanPaths, compoundPath, pathContours, type SketchPath, type BooleanOperation } from '@aether/sketch';
import { type MapShow, type Surface, surfaceCollection, withSurfaceCollection, nextId } from '../document';
import { maskPath } from './curves';
import { surfaceFromPath } from './shape-surface';
export type RegionOperation=BooleanOperation|'compound'|'release';
export function surfacePath(surface:Surface):SketchPath {
  if(!surface.masks.length)return {points:surface.corners,closed:true};
  const paths=surface.masks.map((_,i)=>maskPath(surface,i));
  if(surface.maskFillRule)return compoundPath(paths,surface.maskFillRule);
  // Legacy outlines are an independent union, irrespective of winding.
  return paths.length===1?paths[0]:booleanPaths(paths,'union',.25)!;
}
export function combineSurfaces(show:MapShow, ids:string[], operation:RegionOperation, tolerance=.25):{show:MapShow;selected:string[]} {
  const collection=surfaceCollection(show,ids[0]);
  if(!collection||new Set(ids).size!==ids.length)throw Error('Select surfaces in one scene.');
  const selected=collection.surfaces.filter(s=>ids.includes(s.id));
  if(selected.length!==ids.length)throw Error('Combine surfaces within the same scene.');
  if(selected.some(s=>s.locked||!s.enabled||s.alphaMask||s.bend?.angleDeg||Object.keys(s.animation??{}).length||Object.keys(s.modulation??{}).length))throw Error('Use visible, unlocked vector outlines without silhouettes, bends or animation.');
  if(operation!=='release'&&selected.length<2)throw Error('Select at least two surfaces, or their group.');
  const base=selected[0],paths=selected.map(s=>surfacePath(animateSurface(s,0)));
  if(operation==='release'&&(selected.length!==1||!paths[0].subpaths?.length))throw Error('Select one compound surface.');
  const result=operation==='release'?pathContours(paths[0]):operation==='compound'?[compoundPath(paths,'evenodd')]:[booleanPaths(paths,operation,tolerance)].filter((p):p is SketchPath=>!!p);
  const replacements=result.map((path,i)=>{
    const geometry=surfaceFromPath(path,show.output,i,false);
    return {...base,id:i===0?base.id:nextId('s'),name:operation==='release'?`${base.name} contour ${i+1}`:`${base.name} · ${operation}`,
      corners:geometry.corners,masks:geometry.masks,maskCurves:geometry.maskCurves,maskNodeModes:geometry.maskNodeModes,maskFillRule:geometry.maskFillRule,
      ...(operation==='release'?{corners:animateSurface(base,0).corners,masks:[path.points],maskCurves:[path.curves??path.points.map(()=>null)],maskNodeModes:[path.nodeModes??path.points.map(()=>"corner" as const)]}:{}),
      transform:undefined,animation:undefined,polygonSides:undefined,cornerWelds:undefined,groupShape:null as null};
  });
  const next=withSurfaceCollection(show,base.id,list=>{const remaining=list.filter(s=>!ids.includes(s.id));remaining.splice(list.indexOf(base),0,...replacements);return remaining;});
  return {show:next,selected:replacements.map(s=>s.id)};
}
