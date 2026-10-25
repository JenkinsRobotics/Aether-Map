import { expect,test } from 'vitest';
import { emptyShow,newSurface } from './document';
import { normalizeDocument } from './normalize-document';
import { addSimpleVisual } from './simple-visuals';
import { readVisualMotion,setVisualMotion,setVisualMotionBase,visualMotionAt } from './visual-motion';
import { sceneVisuals } from './visual-render';
import { visualSourceTime } from './visual-clock';
import { parseShow,serializeShow } from './show-file';
import { createTimeline,placeTimeline,currentTimelineID,scheduledVisuals } from './timelines';
import { addPoolAsset } from './media-pool';
import { DEFAULT_MODULATION, type FeatureKeyframe } from './features/types';
const keys=(a:number,b:number):FeatureKeyframe[]=>[{id:'a',timeS:0,value:a,interpolation:'linear'},{id:'b',timeS:4,value:b,interpolation:'linear'}];
function fixture(){let show=normalizeDocument(emptyShow());show.scenes[0].surfaces=[newSurface(show.output,0)];show=addSimpleVisual(show,{mediaId:null,rect:[0,0,1280,720],fill:'#f00'},'Red');return show;}
test('opacity and placement evaluate in one source clock without altering saved bases',()=>{
 const show=fixture(),v={...show.visuals![0],motion:{animation:{opacityPercent:keys(0,100),xPercent:keys(10,90),rotationDeg:keys(-20,20)}}};
 const result=visualMotionAt(v,2,100);
 expect(result.opacity).toBe(.5);expect(result.placement).toMatchObject({xPercent:50,rotationDeg:0,widthPercent:100});
 expect(v.opacity).toBe(1);expect(v.placement).toBeUndefined();
 expect(visualMotionAt(v,8,100).opacity).toBe(1);
 const picture=sceneVisuals({...show,visuals:[v]},show.scenes[0],2)[0];
 expect(picture.opacity).toBe(.5);expect(picture.visualPlacement).toEqual(result.placement);expect(picture.corners).toEqual(show.scenes[0].surfaces[0].corners);
});
test('assignments follow source/scene clocks and missing live values consistently',()=>{
 const v=fixture().visuals![0];v.motion={animation:{opacityPercent:keys(20,80)},modulation:{
  opacityPercent:{...DEFAULT_MODULATION,source:'body',bodySignal:'spread',range:{min:0,max:100}},
  xPercent:{...DEFAULT_MODULATION,source:'time',clock:'scene',periodS:4,range:{min:0,max:100}},
 }};
 expect(visualMotionAt(v,2,1).opacity).toBe(0);
 const live=visualMotionAt(v,2,1,{levels:{'body:spread':.25}});expect(live.opacity).toBe(.25);expect(live.placement!.xPercent).toBe(100);
 v.motion.modulation!.opacityPercent!.invert=true;expect(visualMotionAt(v,2,1).opacity).toBe(1);
 v.motion.modulation!.opacityPercent={...DEFAULT_MODULATION,source:'time',periodS:4,amount:1000000};
 expect(visualMotionAt(v,1,1).opacity).toBe(1);expect(visualMotionAt(v,3,1).opacity).toBe(0);
});
test('clip trim and looping drive picture curves through the normal media clock',()=>{
 const show=fixture();show.media=[{id:'movie',file:'movie.mp4',name:'Movie',bytes:10,kind:'video',width:1280,height:720,duration:4}];
 const v={...show.visuals![0],source:{mediaId:'movie',rect:[0,0,1280,720] as [number,number,number,number]},continuous:false,startS:10,inS:1,durationS:10,loop:true,motion:{animation:{opacityPercent:keys(0,100)}}};
 show.visuals=[v];expect(visualSourceTime(show,v,11)).toBe(2);expect(visualSourceTime(show,v,15)).toBe(2);
 expect(sceneVisuals(show,show.scenes[0],11)[0].opacity).toBe(.5);expect(sceneVisuals(show,show.scenes[0],15)[0].opacity).toBe(.5);
 expect(sceneVisuals(show,show.scenes[0],9)).toEqual([]);
});
test('compound opacity multiplies evaluated child opacity exactly once',()=>{
 let show=normalizeDocument(emptyShow());show=createTimeline(show,'Child');const childID=currentTimelineID(show);
 show=addSimpleVisual(show,{mediaId:null,rect:[0,0,1280,720],fill:'#fff'},'Child visual');
 const child=show.visuals![0];show={...show,activeTimelineID:undefined,visuals:[{...child,motion:{animation:{opacityPercent:keys(0,100)}}}]};
 const track=show.tracks!.find(t=>!t.timelineID&&t.kind==='video')!;show=placeTimeline(show,childID,track.id,10);
 const instance=show.visuals!.at(-1)!;show={...show,visuals:show.visuals!.map(v=>v.id===instance.id?{...v,opacity:.8,motion:{animation:{opacityPercent:keys(20,60)}}}:v)};
 const picture=sceneVisuals(show,show.scenes[0],12)[0];expect(picture.opacity).toBeCloseTo(.5*.4);
 expect(sceneVisuals(show,show.scenes[0],14)[0].opacity).toBe(.6);
});
test('manual takeover is selective and old undo snapshots retain their assignments',()=>{
 const v=fixture().visuals![0];const moving=setVisualMotion(setVisualMotion(v,'xPercent',{keys:keys(0,100)}),'opacityPercent',{keys:keys(0,100)});
 const changed=setVisualMotionBase(moving,{xPercent:72},true);
 expect(changed.placement!.xPercent).toBe(72);expect(changed.motion!.animation!.xPercent).toBeUndefined();expect(changed.motion!.animation!.opacityPercent).toEqual(keys(0,100));
 expect(moving.motion!.animation!.xPercent).toEqual(keys(0,100));expect(moving.placement).toBeUndefined();
});
test('motion survives format8 and ordinary edits cannot downgrade it; legacy shows retain their version',()=>{
 const old=fixture(),oldVersion=old.version;expect(parseShow(serializeShow(old)).version).toBe(oldVersion);
 const show={...old,visuals:[setVisualMotion(old.visuals![0],'opacityPercent',{keys:keys(0,100)})]};
 const reopened=parseShow(serializeShow(show));expect(reopened.version).toBe(8);expect(reopened.visuals![0].motion).toEqual(show.visuals[0].motion);
 const changed=createTimeline(addPoolAsset(normalizeDocument(reopened),{mediaId:null,rect:[0,0,50,50],fill:'#0f0'},'Green'),'Another');
 expect(changed.version).toBe(8);expect(parseShow(serializeShow(changed)).version).toBe(8);
 expect(()=>parseShow(JSON.stringify({...show,version:14}))).toThrow('Unsupported show version');
});
test('file recovery bounds channels, drops unknown fields and excludes compound placement',()=>{
 const raw={animation:{opacityPercent:keys(-10,1000),unknown:keys(1,2)},modulation:{widthPercent:{...DEFAULT_MODULATION,range:{min:-10,max:9000}},__proto__:{source:'audio'}}};
 const read=readVisualMotion(raw)!;expect(read.animation!.opacityPercent!.map(k=>k.value)).toEqual([0,100]);expect(Object.keys(read.animation!)).toEqual(['opacityPercent']);
 expect(read.modulation!.widthPercent!.range).toEqual({min:.1,max:2000});
 expect(readVisualMotion(raw,true)).toEqual({animation:read.animation});expect(readVisualMotion(null)).toBeUndefined();
});
test('a trimmed child uses its local keys and root scene LFO clock across distinct instances',()=>{
 let show=createTimeline(fixture(),'Child'),childID=currentTimelineID(show);
 show=addSimpleVisual(show,{mediaId:null,rect:[0,0,100,100],fill:'#fff'},'Nested');
 const nested=show.visuals!.at(-1)!;
 show={...show,activeTimelineID:undefined,visuals:show.visuals!.map(v=>v.id===nested.id?{...v,motion:{animation:{opacityPercent:keys(0,100)},modulation:{xPercent:{...DEFAULT_MODULATION,source:'time',clock:'scene',periodS:8,range:{min:0,max:100}}}}}:v)};
 const main=show.tracks!.find(t=>!t.timelineID&&t.kind==='video')!.id;
 show=placeTimeline(show,childID,main,8);const first=show.visuals!.at(-1)!;
 show=placeTimeline(show,childID,main,9);show={...show,visuals:show.visuals!.map(v=>v.id===first.id?{...v,inS:1}:v)};
 const uses=scheduledVisuals(show,10).filter(v=>v.visual.id.endsWith(nested.id));
 expect(uses).toHaveLength(2);expect(uses.map(v=>v.visual.opacity)).toEqual([.75,.25]);
 expect(uses.map(v=>v.visual.placement!.xPercent)).toEqual([100,100]);expect(new Set(uses.map(v=>v.visual.id)).size).toBe(2);
});
test('Repeat and Span preserve the same visual motion and take supplied live inputs',()=>{
 const show=fixture();show.scenes[0].surfaces.push(newSurface(show.output,1));
 const base=show.visuals![0],surfaces=show.scenes[0].surfaces;
 const visual={...base,targets:surfaces.map(s=>({sceneID:show.activeSceneId,surfaceID:s.id})),motion:{modulation:{opacityPercent:{...DEFAULT_MODULATION,source:'audio' as const,range:{min:0,max:100}},rotationDeg:{...DEFAULT_MODULATION,source:'midi' as const,control:7,range:{min:-90,max:90}}}}};
 for(const mapping of ['repeat','span'] as const){
  const pictures=sceneVisuals({...show,visuals:[{...visual,mapping}]},show.scenes[0],2,false,undefined,{levels:{level:.6},controls:{7:.75}});
  expect(pictures).toHaveLength(mapping==='repeat'?2:1);expect(pictures.every(p=>p.opacity===.6&&p.visualPlacement?.rotationDeg===45)).toBe(true);
 }
});
