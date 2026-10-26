import type { MapShow, Point, Quad, Rect } from './document';
import type { Visual } from './visual-model';

export function visualPlacementFrame(show:MapShow, visual:Visual):Rect {
  const targets=visual.targets.flatMap(t=>{
    const scene=show.scenes.find(s=>s.id===t.sceneID), surface=scene?.surfaces.find(s=>s.id===t.surfaceID);
    return surface?[surface]:scene?[{source:{rect:[0,0,scene.artboard?.widthPx??show.output.width,scene.artboard?.heightPx??show.output.height] as Rect},corners:[[0,0],[scene.artboard?.widthPx??show.output.width,0],[scene.artboard?.widthPx??show.output.width,scene.artboard?.heightPx??show.output.height],[0,scene.artboard?.heightPx??show.output.height]] as Quad}]:[];
  });
  if (visual.mapping==='span' && targets.length) {
    const points=targets.flatMap(t=>t.corners), xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
    return [0,0,Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];
  }
  return targets[0]?.source.rect ?? [0,0,show.output.width,show.output.height];
}

/** Percentages in the target's unwarped frame. Position is the box center. */
export interface VisualPlacement { xPercent:number; yPercent:number; widthPercent:number; heightPercent:number; rotationDeg:number }
export const DEFAULT_PLACEMENT: VisualPlacement = { xPercent:50, yPercent:50, widthPercent:100, heightPercent:100, rotationDeg:0 };
export function readVisualPlacement(value: unknown): VisualPlacement {
  const raw = value && typeof value === 'object' ? value as Partial<VisualPlacement> : {};
  const n = (key:keyof VisualPlacement, min:number, max:number) => typeof raw[key] === 'number' && Number.isFinite(raw[key]) ? Math.min(max,Math.max(min,raw[key]!)) : DEFAULT_PLACEMENT[key];
  return { xPercent:n('xPercent',-1000,1000), yPercent:n('yPercent',-1000,1000), widthPercent:n('widthPercent',.1,2000), heightPercent:n('heightPercent',.1,2000), rotationDeg:n('rotationDeg',-3600,3600) };
}
export function placementCorners(value: VisualPlacement | undefined, frame:Rect): Quad {
  const p=readVisualPlacement(value), [x,y,w,h]=frame, r=p.rotationDeg*Math.PI/180;
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy]) => {
    const dx=sx*w*p.widthPercent/200, dy=sy*h*p.heightPercent/200;
    return [x+w*p.xPercent/100+dx*Math.cos(r)-dy*Math.sin(r),y+h*p.yPercent/100+dx*Math.sin(r)+dy*Math.cos(r)];
  }) as Quad;
}
/** Resize about the opposite corner in local coordinates, including rotated clips. */
export function resizePlacement(start:VisualPlacement, corner:number, point:Point, frame:Rect): VisualPlacement {
  const anchor=placementCorners(start,frame)[(corner+2)%4], r=start.rotationDeg*Math.PI/180;
  const dx=point[0]-anchor[0], dy=point[1]-anchor[1], sx=corner===0||corner===3?-1:1, sy=corner<2?-1:1;
  const w=Math.max(frame[2]*.001,sx*(dx*Math.cos(r)+dy*Math.sin(r))), h=Math.max(frame[3]*.001,sy*(-dx*Math.sin(r)+dy*Math.cos(r)));
  const cx=anchor[0]+(sx*w*Math.cos(r)-sy*h*Math.sin(r))/2, cy=anchor[1]+(sx*w*Math.sin(r)+sy*h*Math.cos(r))/2;
  return readVisualPlacement({...start,xPercent:(cx-frame[0])/frame[2]*100,yPercent:(cy-frame[1])/frame[3]*100,widthPercent:w/frame[2]*100,heightPercent:h/frame[3]*100});
}
export function alignPlacement(value:VisualPlacement | undefined, axis:'x'|'y', edge:'start'|'center'|'end', frame:Rect,bounds?:Rect): VisualPlacement {
  const p=readVisualPlacement(value), points=bounds?contentPlacementCorners(p,frame,bounds):placementCorners(p,frame), i=axis==='x'?0:1;
  const low=Math.min(...points.map(v=>v[i])), high=Math.max(...points.map(v=>v[i]));
  const delta=edge==='start'?frame[i]-low:edge==='end'?frame[i]+frame[i+2]-high:frame[i]+frame[i+2]/2-(low+high)/2;
  return {...p,[axis==='x'?'xPercent':'yPercent']:p[axis==='x'?'xPercent':'yPercent']+delta/frame[i+2]*100};
}

/** Place a content-sized rectangle through the same transform as its full frame. */
export function contentPlacementCorners(value:VisualPlacement|undefined,frame:Rect,bounds:Rect):Quad {
  const p=readVisualPlacement(value),r=p.rotationDeg*Math.PI/180;
  return [[bounds[0],bounds[1]],[bounds[0]+bounds[2],bounds[1]],[bounds[0]+bounds[2],bounds[1]+bounds[3]],[bounds[0],bounds[1]+bounds[3]]].map(([x,y])=>{
    const dx=(x-frame[0]-frame[2]/2)*p.widthPercent/100,dy=(y-frame[1]-frame[3]/2)*p.heightPercent/100;
    return [frame[0]+frame[2]*p.xPercent/100+dx*Math.cos(r)-dy*Math.sin(r),frame[1]+frame[3]*p.yPercent/100+dx*Math.sin(r)+dy*Math.cos(r)];
  }) as Quad;
}
/** Resize about the opposite corner; `keepAspect` scales both axes alike (surfaces' locked aspect). */
export function resizeContentPlacement(start:VisualPlacement,corner:number,point:Point,frame:Rect,bounds:Rect,keepAspect=false):VisualPlacement {
  const anchor=contentPlacementCorners(start,frame,bounds)[(corner+2)%4],r=start.rotationDeg*Math.PI/180;
  const dx=point[0]-anchor[0],dy=point[1]-anchor[1],sx=corner===0||corner===3?-1:1,sy=corner<2?-1:1;
  let width=sx*(dx*Math.cos(r)+dy*Math.sin(r))/bounds[2]*100,height=sy*(-dx*Math.sin(r)+dy*Math.cos(r))/bounds[3]*100;
  if(keepAspect){const k=Math.max(width/start.widthPercent,height/start.heightPercent);width=start.widthPercent*k;height=start.heightPercent*k;}
  const next=readVisualPlacement({...start,widthPercent:width,heightPercent:height});
  const moved=contentPlacementCorners(next,frame,bounds)[(corner+2)%4];
  return readVisualPlacement({...next,xPercent:next.xPercent+(anchor[0]-moved[0])/frame[2]*100,yPercent:next.yPercent+(anchor[1]-moved[1])/frame[3]*100});
}
export function snapContentPlacement(value:VisualPlacement,frame:Rect,bounds:Rect,targets:Point[][],threshold:number|Point) {
  const points=contentPlacementCorners(value,frame,bounds),p={...value};const guides:{axis:0|1;value:number}[]=[];
  for(const axis of [0,1] as const){
    const extent=(q:Point[])=>{const values=q.map(v=>v[axis]),low=Math.min(...values),high=Math.max(...values);return [low,(low+high)/2,high];};
    const anchors=extent(points),candidates=[frame[axis],frame[axis]+frame[axis+2]/2,frame[axis]+frame[axis+2],...targets.flatMap(extent)];
    const tolerance=typeof threshold==='number'?threshold:threshold[axis];
    let delta=tolerance+1,guide=0;
    for(const a of anchors)for(const b of candidates)if(Math.abs(b-a)<Math.abs(delta)){delta=b-a;guide=b;}
    if(Math.abs(delta)<=tolerance){p[axis===0?'xPercent':'yPercent']+=delta/frame[axis+2]*100;guides.push({axis,value:guide});}
  }
  return {placement:readVisualPlacement(p),guides};
}
