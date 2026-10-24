import {expect,test} from 'vitest';
import {emptyShow,newSurface,type Point,type Quad} from './document';
import {cubeSurfaces} from './features/shape-groups';
import {cubeFaces,cubePoseGeometry,poseCube} from './cube-pose';
import {animateSurface} from './features/animation';
import {geometryFromVisible} from './layer-transform';
import {parseShow,serializeShow} from './show-file';
import {joinCorners} from './corner-welds';

const indices=[[3,2,0,1],[1,0,4,5],[0,2,6,4]];
function fixture(){const show=emptyShow();show.scenes[0].surfaces=cubeSurfaces(show.output,0);return show;}
function near(a:Point,b:Point){expect(a[0]).toBeCloseTo(b[0],7);expect(a[1]).toBeCloseTo(b[1],7);}
// Independent pinhole camera and explicit X rotation, not the production fit.
function reference(id:number,angle=0,invert=false):Point {
 let x=(id&1?1:0)-.5,y=(id&2?1:0)-.5,z=(id&4?1:0)-.5;
 const r=angle*Math.PI/180;[y,z]=[y*Math.cos(r)-z*Math.sin(r),y*Math.sin(r)+z*Math.cos(r)];
 if(invert)[x,y,z]=[-x,-y,-z];
 const depth=4+.3*x+.2*y+.1*z;
 return [900+900*(-x+y)/depth,500+900*(-.5*x-.5*y+z)/depth];
}
test('three shared faces follow an independently projected 3D turn, including perspective',()=>{
 const show=fixture();show.scenes[0].surfaces.forEach((s,i)=>s.corners=indices[i].map(id=>reference(id)) as Quad);
 const before=structuredClone(show),next=poseCube(show,show.scenes[0].surfaces[1].id,{xDegrees:12});
 next.scenes[0].surfaces.forEach((s,i)=>s.corners.forEach((p,j)=>near(p,reference(indices[i][j],12))));
 expect(show).toEqual(before);expect(cubeFaces(next.scenes[0].surfaces)).not.toBeNull();
});
test('inside out exposes the opposite room-corner faces and toggles back without losing assignments',()=>{
 const show=fixture();show.scenes[0].surfaces.forEach((s,i)=>s.corners=indices[i].map(id=>reference(id)) as Quad);
 const next=poseCube(show,show.scenes[0].surfaces[0].id,{insideOut:true});
 next.scenes[0].surfaces.forEach((s,i)=>{s.corners.forEach((p,j)=>near(p,reference(indices[i][j],0,true)));expect(s.id).toBe(show.scenes[0].surfaces[i].id);expect(s.source).toEqual(show.scenes[0].surfaces[i].source);});
 const back=poseCube(next,next.scenes[0].surfaces[2].id,{insideOut:true});
 back.scenes[0].surfaces.forEach((s,i)=>s.corners.forEach((p,j)=>near(p,show.scenes[0].surfaces[i].corners[j])));
});
test('zero pose retains calibrated pins and roles survive names and paint order',()=>{
 const show=fixture(),faces=show.scenes[0].surfaces;faces[0].corners[0]=[faces[0].corners[0][0]+8,faces[0].corners[0][1]-5];
 faces.forEach((s,i)=>s.name=`Custom ${i}`);faces.reverse();
 const changes=cubePoseGeometry(faces,{});
 changes.forEach(c=>c.geometry.corners.forEach((p,j)=>near(p,faces.find(s=>s.id===c.id)!.corners[j])));
 const next=poseCube(show,faces[0].id,{zDegrees:6});expect(next.scenes[0].surfaces.map(s=>s.id)).toEqual(faces.map(s=>s.id));
 expect(cubeFaces(next.scenes[0].surfaces)).not.toBeNull();
});
test('masks and animation use visible geometry; save/reopen preserves canonical face and output data',()=>{
 const show=fixture(),faces=show.scenes[0].surfaces;
 faces.forEach(s=>{const visible=structuredClone(s);s.transform={xPx:12,yPx:8,scaleX:1.1,scaleY:.9,rotationDeg:9};s.animation={xPx:[{id:'key0',timeS:0,value:12,interpolation:'linear'},{id:'key',timeS:1,value:30,interpolation:'linear'}]};Object.assign(s,geometryFromVisible(s,{corners:visible.corners,masks:[[visible.corners[0],visible.corners[1],visible.corners[2]]]},0));});
 const next=poseCube(show,faces[0].id,{xDegrees:8}),reopened=parseShow(serializeShow(next));
 expect(reopened.scenes[0].surfaces.map(s=>s.id)).toEqual(faces.map(s=>s.id));expect(next.outputs).toEqual(show.outputs);expect(next.activeSceneId).toBe(show.activeSceneId);
 next.scenes[0].surfaces.forEach((s,i)=>{expect(s.animation).toEqual(faces[i].animation);expect(s.transform).toEqual(faces[i].transform);const visible=animateSurface(s,0);near(visible.masks[0][0],visible.corners[0]);near(visible.masks[0][1],visible.corners[1]);});
 expect(reopened.scenes[0].surfaces.map(s=>s.corners)).toEqual(next.scenes[0].surfaces.map(s=>s.corners));
});
test('external welded neighbours follow, but a locked peer refuses the whole transaction',()=>{
 let show=fixture();const extra=newSurface(show.output,3);show.scenes[0].surfaces.push(extra);
 show=joinCorners(show,{surfaceID:extra.id,index:0},{surfaceID:show.scenes[0].surfaces[0].id,index:0});
 const next=poseCube(show,show.scenes[0].surfaces[0].id,{xDegrees:5});near(next.scenes[0].surfaces[3].corners[0],next.scenes[0].surfaces[0].corners[0]);
 show.scenes[0].surfaces[3].locked=true;const snapshot=structuredClone(show);
 expect(()=>poseCube(show,show.scenes[0].surfaces[0].id,{xDegrees:5})).toThrow('locked');expect(show).toEqual(snapshot);
});
test.each(['missing','locked','collapsed','separated','folded','NaN','large'] as const)('refuses %s cube edits without mutations',kind=>{
 const show=fixture(),faces=show.scenes[0].surfaces,id=faces[0].id;
 if(kind==='missing')faces.pop();if(kind==='locked')faces[1].locked=true;
 if(kind==='collapsed')faces.forEach(s=>s.corners=s.corners.map(()=>[10,10]) as Quad);
 if(kind==='separated')faces[1].corners[1]=[0,0];
 const before=structuredClone(show),angle=kind==='NaN'?NaN:kind==='large'?181:kind==='folded'?90:8;
 expect(()=>poseCube(show,id,{xDegrees:angle})).toThrow();expect(show).toEqual(before);
});

test('refuses an inside-out corner beyond the inferred camera horizon',()=>{
 const show=fixture();show.scenes[0].surfaces.forEach((s,i)=>s.corners=indices[i].map(id=>{
  const x=(id&1?1:0)-.5,y=(id&2?1:0)-.5,z=(id&4?1:0)-.5,w=1-.8*x-.8*y-.8*z;
  return [800+100*(-x+y)/w,450+100*(-.5*x-.5*y+z)/w] as Point;
 }) as Quad);
 expect(()=>poseCube(show,show.scenes[0].surfaces[0].id,{insideOut:true})).toThrow('horizon');
});
test('mask curve control points follow the face while retaining curve structure',()=>{
 const show=fixture(),face=show.scenes[0].surfaces[0];face.masks=[[face.corners[0],face.corners[1],face.corners[2]]];
 face.maskCurves=[[{c1:face.corners[3],c2:face.corners[2]},null,null]];
 const next=poseCube(show,face.id,{zDegrees:8}).scenes[0].surfaces[0];
 near(next.maskCurves![0][0]!.c1,next.corners[3]);near(next.maskCurves![0][0]!.c2,next.corners[2]);expect(next.maskCurves![0].slice(1)).toEqual([null,null]);
});
