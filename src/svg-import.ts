import { compoundPath, readSVGGeometry, type SVGVectorElement } from '@aether/sketch';
import { sceneSize } from './scene-size';
import type { MapShow, Surface } from './document';
import { surfaceFromPath } from './mask/shape-surface';
export interface SvgImport { surfaces: Surface[]; skipped: string[] }
/** Inert SVG document adapter: retained curves and contours become projection outlines. */
export function importSurfacesFromSvg(source: string, show: MapShow): SvgImport {
  if(source.length>20_000_000||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('SVG exceeds import limits or contains entity declarations.');
  const doc=new DOMParser().parseFromString(source,'image/svg+xml'),root=doc.documentElement;
  if(root.localName!=='svg'||doc.querySelector('parsererror'))throw Error('That file is not valid SVG.');
  if(doc.querySelectorAll('*').length>12000)throw Error('SVG has too many elements.');
  const tree=(e:Element,depth=0):SVGVectorElement=>{
    if(depth>100)throw Error('SVG nesting limit exceeded.');
    const attributes=Object.fromEntries(Array.from(e.attributes).map(a=>[a.name,a.value]));
    const title=Array.from(e.children).find(c=>c.localName==='title')?.textContent?.trim();if(title)attributes['data-name']=title;
    return {tag:e.localName,attributes,children:Array.from(e.children).map(c=>tree(c,depth+1))};
  };
  const size=sceneSize(show),vb=(root.getAttribute('viewBox')??'').trim().split(/[\s,]+/).map(Number);
  const matrix=vb.length===4&&vb.every(Number.isFinite)&&vb[2]>0&&vb[3]>0?`scale(${size.width/vb[2]} ${size.height/vb[3]}) translate(${-vb[0]} ${-vb[1]})`:'';
  const {items,warnings}=readSVGGeometry(tree(root),matrix),surfaces:Surface[]=[],skipped=[...warnings];
  for(const item of items){try{
    if(item.paths.some(p=>!p.closed))throw Error('open paths cannot define projection regions; close the outline first');
    const path=compoundPath(item.paths,item.fillRule);
    surfaces.push({...surfaceFromPath(path,size,surfaces.length,false),name:item.name});
  }catch(error){skipped.push(`${item.name}: ${(error as Error).message}`);}}
  return {surfaces,skipped};
}
