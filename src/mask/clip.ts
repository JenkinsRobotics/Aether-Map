import { cssPolygon } from "../homography";
import type { Point, Surface } from "../document";
import { sampleMask } from './curves';

/**
 * How a surface is clipped.
 *
 * No mask shapes: the surface's own quad. One shape: a CSS `clip-path`
 * polygon, cheap and hardware-composited. Several: CSS cannot union polygons,
 * but an SVG `<clipPath>` with several `<polygon>`s can, so the wrapper
 * references one. `userSpaceOnUse` makes its coordinates output pixels — the
 * same space as the corners — because the wrapper spans the whole raster.
 */

export function clipShapes(surface: Surface): Point[][] {
  const shapes = surface.masks.map((_, i) => sampleMask(surface, i)).filter((shape) => shape.length >= 3);
  return shapes.length > 0 ? shapes : [surface.corners as unknown as Point[]];
}

export function clipStyle(surface: Surface, clipID: string): React.CSSProperties {
  const shapes = clipShapes(surface);
  if (shapes.length === 1) return { clipPath: surface.maskFillRule === "evenodd" ? cssPolygon(shapes[0]).replace("polygon(", "polygon(evenodd, ") : cssPolygon(shapes[0]) };
  return { clipPath: `url(#${clipID})` };
}

/** Same fill rule as ClipDefs; a hole must not intercept canvas selection. */
export function pointInSurfaceMask(surface: Surface, [x,y]: Point): boolean {
  const rings=clipShapes(surface);let winding=0,crossings=0;
  for(const ring of rings){let local=0;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [ax,ay]=ring[j],[bx,by]=ring[i],cross=(bx-ax)*(y-ay)-(x-ax)*(by-ay);
      if(Math.abs(cross)<1e-7&&x>=Math.min(ax,bx)&&x<=Math.max(ax,bx)&&y>=Math.min(ay,by)&&y<=Math.max(ay,by))return true;
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)local++;
      if(ay<=y&&by>y&&cross>0)winding++;else if(ay>y&&by<=y&&cross<0)winding--;
    }
    if(!surface.maskFillRule&&local%2)return true;
    crossings+=local;
  }
  return surface.maskFillRule==='evenodd'?crossings%2===1:surface.maskFillRule==='nonzero'?winding!==0:false;
}
