import { expect,it } from 'vitest';
import { contentBounds } from './content-bounds';
import { contentPlacementCorners,resizeContentPlacement,snapContentPlacement,DEFAULT_PLACEMENT,alignPlacement } from './visual-placement';
import { emptyShow,newSurface,type Rect } from './document';
import { surfaceComposition } from './surface-composition';
import { parseShow,serializeShow } from './show-file';
it('excludes contain margins and maps text ink to local coordinates',()=>{
  expect(contentBounds({mediaId:'image',rect:[0,0,1600,900],fit:'contain'},[0,0,1000,1000])).toEqual([0,218.75,1000,562.5]);
  expect(contentBounds({mediaId:'image',rect:[0,0,1600,900],fit:'contain'},[0,0,1000,1000],[0,0,1600,900],[[0,0],[1600,0],[1600,900],[0,900]])).toEqual([0,0,1000,1000]);
  expect(contentBounds({mediaId:null,rect:[0,0,1000,1000]},[0,0,500,500],[400,450,200,100])).toEqual([200,225,100,50]);
});
it('resizes a rotated off-center content box about the opposite visible corner',()=>{
  const frame:Rect=[0,0,1000,500],bounds:Rect=[100,220,200,60],start={...DEFAULT_PLACEMENT,rotationDeg:25};
  const before=contentPlacementCorners(start,frame,bounds),target:[number,number]=[before[2][0]+80,before[2][1]+100];
  const after=contentPlacementCorners(resizeContentPlacement(start,2,target,frame,bounds),frame,bounds);
  after[0].forEach((v,i)=>expect(v).toBeCloseTo(before[0][i]));after[2].forEach((v,i)=>expect(v).toBeCloseTo(target[i]));
  const aligned=contentPlacementCorners(alignPlacement(start,'x','start',frame,bounds),frame,bounds);
  expect(Math.min(...aligned.map(p=>p[0]))).toBeCloseTo(0);
});
it('snaps visible text to surface edges and neighboring assets',()=>{
  const frame:Rect=[0,0,1000,500],bounds:Rect=[400,220,200,60];
  const result=snapContentPlacement({...DEFAULT_PLACEMENT,xPercent:10.4},frame,bounds,[],6);
  expect(result.placement.xPercent).toBeCloseTo(10);expect(result.guides).toContainEqual({axis:0,value:0});
  const neighbor=snapContentPlacement({...DEFAULT_PLACEMENT,xPercent:60.3},frame,bounds,[[[700,0],[800,0],[800,100],[700,100]]],6);
  expect(neighbor.placement.xPercent).toBeCloseTo(60);
});
it('normalizes cube proportions and persists custom view ratio without remapping geometry',()=>{
  const show=emptyShow(),surface=newSurface(show.output,0);surface.groupShape='cube';surface.source.rect=[0,0,1920,1080];
  surface.corners=[[100,100],[300,150],[300,550],[100,400]];show.scenes[0].surfaces=[surface];
  const saved=JSON.stringify(surface.corners),normalized=surfaceComposition(show,surface,0).frame;
  expect(normalized[2]/normalized[3]).toBeCloseTo(1);expect(surfaceComposition(show,surface,0,false).frame).toEqual([0,0,200,450]);
  surface.compositionAspectRatio=4/3;
  const view=surfaceComposition(show,surface,0).frame;expect(view[2]/view[3]).toBeCloseTo(4/3);
  const loaded=parseShow(serializeShow(show)).scenes[0].surfaces[0];
  expect(loaded.compositionAspectRatio).toBe(4/3);expect(JSON.stringify(loaded.corners)).toBe(saved);
});
