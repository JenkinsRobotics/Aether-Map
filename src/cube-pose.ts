import { type MapShow, type Point, type Quad, type Surface, withSurfaceCollection, surfaceCollection, allSurfaces } from './document';
import { animateSurface } from './features/animation';
import { boundsOf, geometryFromVisible } from './layer-transform';
import { project, solveHomography } from './homography';
import { mapMaskCurves } from './mask/curves';
import { applyGroupGeometry, type GroupGeometryChange } from './group-interaction';
import { maintainCornerWelds } from './corner-welds';

type Vec3 = [number,number,number];
export interface CubePoseDelta { xDegrees?:number; yDegrees?:number; zDegrees?:number; insideOut?:boolean }
// Same incidence as cubeSurfaces. Roles follow shared corner indices, not names
// or paint order, so renaming/reordering a face cannot change its content role.
const FACE_VERTICES = [[3,2,0,1],[1,0,4,5],[0,2,6,4]] as const;
const vertex = (id:number):Vec3 => [(id&1?1:0)-.5,(id&2?1:0)-.5,(id&4?1:0)-.5];
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const close=(a:Point,b:Point)=>distance(a,b)<1e-4;

/** Recover a cube's three face roles from their shared-junction incidence. */
export function cubeFaces(members:readonly Surface[]):[Surface,Surface,Surface]|null {
 if(members.length!==3||members.some(s=>s.groupShape!=='cube'))return null;
 for(const top of members)for(const left of members)for(const right of members){
  if(new Set([top.id,left.id,right.id]).size!==3)continue;
  const q=[top,left,right].map(s=>animateSurface(s,0).corners);
  if(close(q[0][2],q[1][1])&&close(q[0][2],q[2][0])&&close(q[0][3],q[1][0])&&close(q[0][1],q[2][1])&&close(q[1][2],q[2][3]))return [top,left,right];
 }
 return null;
}

/** Householder QR solves the overdetermined camera without squaring its condition. */
function leastSquares(rows:number[][],values:number[]):number[]{
 const a=rows.map((row,i)=>[...row,values[i]]),n=rows[0].length;
 for(let k=0;k<n;k++){
  const norm=Math.hypot(...a.slice(k).map(row=>row[k]));
  if(norm<1e-9)throw Error('Cube pose needs three noncollapsed faces.');
  const v=a.slice(k).map(row=>row[k]);v[0]+=v[0]>=0?norm:-norm;
  const length=Math.hypot(...v);for(let i=0;i<v.length;i++)v[i]/=length;
  for(let j=k;j<=n;j++){
   const dot=v.reduce((sum,value,i)=>sum+value*a[k+i][j],0);
   for(let i=0;i<v.length;i++)a[k+i][j]-=2*v[i]*dot;
  }
 }
 const x=Array(n).fill(0) as number[];
 for(let i=n-1;i>=0;i--){
  if(Math.abs(a[i][i])<1e-9)throw Error('Cube pose is ambiguous at this angle.');
  x[i]=(a[i][n]-x.reduce((sum,value,j)=>j>i?sum+a[i][j]*value:sum,0))/a[i][i];
 }
 return x;
}
function camera(points:Point[]){
 const b=boundsOf(points),scale=Math.max(b.width,b.height),center:Point=[b.x+b.width/2,b.y+b.height/2];
 if(scale<1e-4)throw Error('Cube pose needs a visible cube.');
 const rows:number[][]=[],values:number[]=[];
 points.forEach((point,id)=>{
  const [x,y,z]=vertex(id),u=(point[0]-center[0])/scale,v=(point[1]-center[1])/scale;
  rows.push([x,y,z,1,0,0,0,0,-u*x,-u*y,-u*z],[0,0,0,0,x,y,z,1,-v*x,-v*y,-v*z]);values.push(u,v);
 });
 const p=leastSquares(rows,values);
 return (v:Vec3):Point=>{
  const w=1+p[8]*v[0]+p[9]*v[1]+p[10]*v[2];
  if(w<.02)throw Error('This pose crosses the projection horizon. Use a smaller turn.');
  const point:Point=[center[0]+scale*(p[0]*v[0]+p[1]*v[1]+p[2]*v[2]+p[3])/w,center[1]+scale*(p[4]*v[0]+p[5]*v[1]+p[6]*v[2]+p[7])/w];
  if(point.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw Error('Cube pose exceeds the mapping area.');
  return point;
 };
}
function rotate(v:Vec3,delta:CubePoseDelta):Vec3 {
 let [x,y,z]=v;
 for(const [axis,degrees] of [delta.xDegrees,delta.yDegrees,delta.zDegrees].entries()){
  if(degrees===undefined)continue;
  if(!Number.isFinite(degrees)||Math.abs(degrees)>180)throw Error('Pose angles must be between −180 and 180 degrees.');
  const r=degrees*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
  if(axis===0)[y,z]=[y*c-z*s,y*s+z*c];
  if(axis===1)[x,z]=[x*c+z*s,-x*s+z*c];
  if(axis===2)[x,y]=[x*c-y*s,x*s+y*c];
 }
 return delta.insideOut?[-x,-y,-z]:[x,y,z];
}
function faceSign(q:Quad):number {
 const turns=q.map((p,i)=>{const a=q[(i+1)%4],b=q[(i+2)%4];return(a[0]-p[0])*(b[1]-a[1])-(a[1]-p[1])*(b[0]-a[0]);});
 const maxEdge=Math.max(...q.map((p,i)=>distance(p,q[(i+1)%4])));
 if(turns.some(v=>Math.abs(v)<Math.max(1e-6,maxEdge*maxEdge*1e-6))||turns.some(v=>Math.sign(v)!==Math.sign(turns[0])))throw Error('This pose folds a face. Use a smaller turn.');
 return Math.sign(turns[0]);
}

/** An incremental 3D pose, baked into the canonical mapping geometry. */
export function cubePoseGeometry(members:readonly Surface[],delta:CubePoseDelta):GroupGeometryChange[]{
 const faces=cubeFaces(members);if(!faces)throw Error('Select a complete cube with three joined faces.');
 if(faces.some(s=>s.locked))throw Error('Unlock every cube face before changing its pose.');
 const visible=faces.map(s=>animateSurface(s,0)),points:Point[]=Array(7);
 visible.forEach((face,i)=>FACE_VERTICES[i].forEach((id,j)=>{points[id]??=face.corners[j];}));
 const project3=camera(points);
 const moved=points.map((point,id)=>{
  const p=vertex(id),before=project3(p),after=project3(rotate(p,delta));
  // Keep manual pin corrections; the pose starts exactly at the measured shape.
  return [point[0]+after[0]-before[0],point[1]+after[1]-before[1]] as Point;
 });
 const changes=faces.map((surface,i)=>{
  const prior=visible[i],corners=FACE_VERTICES[i].map(id=>moved[id]) as Quad;
  if(faceSign(prior.corners)!==faceSign(corners))throw Error('This pose hides one of the three faces. Use a smaller turn.');
  const h=solveHomography(prior.corners,corners),map=(p:Point)=>{
   const next=project(h,p);if(next.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw Error('Pose would move a mask outside the mapping area.');return next;
  };
  return {id:surface.id,geometry:geometryFromVisible(surface,{corners,masks:prior.masks.map(mask=>mask.map(map)),...(prior.maskCurves?{maskCurves:mapMaskCurves(prior.maskCurves,map)}:{})},0)};
 });
 return changes;
}

/** Same atomic transaction used by inspector gestures and agents. */
export function applyCubeGeometry(show:MapShow,memberID:string,changes:readonly GroupGeometryChange[]):MapShow {
 const collection=surfaceCollection(show,memberID),list=collection?.scene?.surfaces??show.unassignedSurfaces;
 const member=list.find(s=>s.id===memberID);if(!member?.folder)throw Error('Cube face not found.');
 const members=list.filter(s=>s.folder===member.folder);
 if(!cubeFaces(members)||members.some(s=>s.locked))throw Error('Cube membership or locks changed.');
 const nextList=applyGroupGeometry(list,member.folder,changes);if(nextList===list)throw Error('Cube membership changed.');
 const next=withSurfaceCollection(show,memberID,()=>nextList),welded=maintainCornerWelds(show,next);
 if(welded===show)throw Error('A locked or conflicting welded neighbour prevents this pose.');
 const prior=new Map(allSurfaces(show).map(s=>[s.id,s]));
 for(const surface of allSurfaces(welded)){
  if(surface===prior.get(surface.id))continue;
  const points=[...surface.corners,...surface.masks.flat(),...(surface.maskCurves??[]).flatMap(profile=>profile.flatMap(curve=>curve?[curve.c1,curve.c2]:[]))];
  if(points.some(p=>p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw Error('Pose exceeds the saved geometry range.');
 }
 return welded;
}
export function poseCube(show:MapShow,memberID:string,delta:CubePoseDelta):MapShow {
 const collection=surfaceCollection(show,memberID),list=collection?.scene?.surfaces??show.unassignedSurfaces;
 const member=list.find(s=>s.id===memberID);if(!member?.folder)throw Error('Cube face not found.');
 return applyCubeGeometry(show,memberID,cubePoseGeometry(list.filter(s=>s.folder===member.folder),delta));
}
