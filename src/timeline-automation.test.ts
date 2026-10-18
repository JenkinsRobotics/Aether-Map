import { expect,test } from 'vitest';
import { emptyShow,type MapShow } from './document';
import { normalizeDocument } from './normalize-document';
import { addSimpleVisual } from './simple-visuals';
import { newShader } from './features/shader-catalog';
import { DEFAULT_MODULATION,DEFAULT_SHADER_TIME } from './features/types';
import { performanceParameters } from './performance/parameters';
import { automationClock,automationMarks,automationTime,automationCurve,editAutomationKey,removeAutomationKey } from './timeline-automation';
import { parseShow,serializeShow } from './show-file';
import { runCommand } from './automation/commands';
const keys=[{id:'a',timeS:1,value:10,interpolation:'linear' as const},{id:'b',timeS:3,value:90,interpolation:'hold' as const}];
function seed():MapShow{const show=addSimpleVisual(normalizeDocument(emptyShow()),{mediaId:null,rect:[0,0,100,100],fill:'#ff0000'},'Fill');show.visuals![0]={...show.visuals![0],continuous:false,startS:5,inS:1,durationS:8,motion:{animation:{opacityPercent:keys}}};return show;}
const opacity=(show:MapShow)=>performanceParameters(show,show.visuals![0],0).find(p=>p.id==='opacity')!;
test('trimmed clips project original source keys onto the shared timeline without rewriting data',()=>{
 const show=seed(),v=show.visuals![0],before=serializeShow(show),p=opacity(show),clock=automationClock(show,v,p,20);
 expect(clock.segments).toEqual([{startS:5,endS:13,sourceStartS:1,rate:1}]);expect(automationMarks(show,v,p,clock.segments).map(m=>m.timeS)).toEqual([5,7]);
 expect(automationCurve(p,clock.segments)[0].find(p=>p.timeS===7)!.value).toBe(90);expect(serializeShow(show)).toEqual(before);
 v.continuous=true;expect(automationMarks(show,v,p,automationClock(show,v,p,20).segments).map(m=>m.timeS)).toEqual([1,3]);
});
test.each([true,false])('video loop=%s projects wraps/holds and never invents an editable key during a held interval',loop=>{
 const show=seed(),v=show.visuals![0];v.source={mediaId:'movie',rect:[0,0,100,100]};v.loop=loop;show.media=[{id:'movie',name:'Video',file:'movie.mp4',kind:'video',width:100,height:100,bytes:100,duration:4}];
 const p=opacity(show),clock=automationClock(show,v,p,20),marks=automationMarks(show,v,p,clock.segments);
 expect(marks.map(m=>m.timeS)).toEqual(loop?[5,7,9,11,13]:[5,7]);
 expect(clock.segments.at(-1)!.rate).toBe(loop?1:0);
 for(const segment of clock.segments)for(const f of [.001,.25,.5,.75,.999]){const time=segment.startS+(segment.endS-segment.startS)*f;expect(segment.sourceStartS+(time-segment.startS)*segment.rate).toBeCloseTo(performanceParameters(show,v,time).find(p=>p.id==='opacity')!.timeS,5);}
});
test.each(['forward','reverse','pingpong','frozen'] as const)('shader %s clocks align numeric/color controls and exact repeated keys',mode=>{
 const show=seed(),v=show.visuals![0];v.continuous=true;const shader=newShader('neon-beams');shader.time={...DEFAULT_SHADER_TIME,offsetS:1,loopS:4,direction:mode==='frozen'?'forward':mode,frozen:mode==='frozen'};shader.animation={glow:keys};
 v.source={mediaId:null,rect:[0,0,100,100],shader,motion:{animation:{'color:shader:palette:0:hueDeg':keys}}};
 const parameters=performanceParameters(show,v,0).filter(p=>p.id==='shader:glow'||p.id==='source:color:shader:palette:0:hueDeg');expect(parameters).toHaveLength(2);
 for(const p of parameters){
  const clock=automationClock(show,v,p,12);expect(clock.dense).toBe(false);
  for(const segment of clock.segments)for(const f of [.001,.25,.5,.75,.999]){const time=segment.startS+(segment.endS-segment.startS)*f;expect(segment.sourceStartS+(time-segment.startS)*segment.rate).toBeCloseTo(performanceParameters(show,v,time).find(q=>q.id===p.id)!.timeS,5);}
  const marks=automationMarks(show,v,p,clock.segments);expect(marks.length).toBe(mode==='frozen'?0:7);
  for(const mark of marks)expect(automationTime(show,v,p,mark.timeS)).toBeCloseTo(mark.key.timeS,7);
 }
});
test('media wrapping composed with pingpong/reverse shader timing agrees with evaluated parameter clocks',()=>{
 for(const direction of ['reverse','pingpong'] as const){const show=seed(),v=show.visuals![0];show.media=[{id:'m',name:'m',file:'m.mp4',kind:'video',width:100,height:100,bytes:100,duration:3}];const shader=newShader('neon-beams');shader.time={...DEFAULT_SHADER_TIME,direction,loopS:2,offsetS:.3};v.source={mediaId:'m',rect:[0,0,100,100],shader};v.loop=true;
 const p=performanceParameters(show,v,0).find(p=>p.id==='shader:glow')!,clock=automationClock(show,v,p,20);
 for(const segment of clock.segments)for(const f of [.01,.5,.99]){const time=segment.startS+(segment.endS-segment.startS)*f;expect(segment.sourceStartS+(time-segment.startS)*segment.rate).toBeCloseTo(performanceParameters(show,v,time).find(p=>p.id==='shader:glow')!.timeS,6);}}
});
test('nested timeline holds use the exact child boundary and dense loops stay bounded',()=>{
 const show=seed(),v=show.visuals![0];show.timelines=[{id:'child',name:'Child',sceneID:show.activeSceneId,durationS:3}];v.timelineRefID='child';v.loop=false;
 const p=opacity(show),clock=automationClock(show,v,p,20);expect(clock.segments.at(-1)!.sourceStartS).toBeCloseTo(2.999999,8);expect(clock.segments.at(-1)!.rate).toBe(0);
 delete v.timelineRefID;v.continuous=true;const shader=newShader('neon-beams');shader.time={...DEFAULT_SHADER_TIME,loopS:.001};v.source={mediaId:null,rect:[0,0,100,100],shader};const q=performanceParameters(show,v,0).find(p=>p.id==='shader:glow')!;expect(automationClock(show,v,q,60)).toEqual({segments:[],dense:true});
});
test('retiming writes canonical keys, preserves IDs/modulation and deletes collisions consistently',()=>{
 const show=seed(),v=show.visuals![0];v.motion!.modulation={opacityPercent:{...DEFAULT_MODULATION,source:'midi',control:7}};const next=editAutomationKey(show,v,'opacity',8,40,'b');
 expect(next.motion!.animation!.opacityPercent).toEqual([keys[0],{...keys[1],timeS:4,value:40}]);expect(next.motion!.modulation).toEqual(v.motion!.modulation);expect(v.motion!.animation!.opacityPercent).toEqual(keys);
 const collision=editAutomationKey(show,next,'opacity',5,200,'b');expect(collision.motion!.animation!.opacityPercent).toEqual([{...keys[1],timeS:1,value:100}]);
 const removed=removeAutomationKey(show,collision,'opacity','b');expect(removed.motion!.animation?.opacityPercent).toBeUndefined();expect(removed.motion!.modulation).toEqual(v.motion!.modulation);
 const reopened=parseShow(serializeShow({...show,visuals:[next]}));expect(reopened.visuals![0].motion!.animation).toEqual(next.motion!.animation);expect(reopened.visuals![0].motion!.modulation).toEqual(parseShow(serializeShow(show)).visuals![0].motion!.modulation);
 expect(runCommand('map.show.evaluate',new TextDecoder().decode(serializeShow({...show,visuals:[next]})),{scene_id:show.activeSceneId,time_s:8}).result).toMatchObject({layers:[{opacity:.4}]});
});
test('choice and effect editing uses ordinary canonical channels and rejects invalid clocks/locks/stale IDs',()=>{
 const show=seed(),v=show.visuals![0];v.source={mediaId:null,rect:[0,0,100,100],testPattern:'grid'};v.effects=[{id:'blur',kind:'blur',enabled:true,amount:20,animation:keys}];
 const choice=editAutomationKey(show,v,'source:choice:testPattern',6,1.8);expect(choice.source!.motion!.animation!['choice:testPattern']![0]).toMatchObject({timeS:2,value:1,interpolation:'hold'});
 const effect=editAutomationKey(show,v,'effect:blur',7,50,'a');expect(effect.effects![0].animation).toEqual([{...keys[0],timeS:3,value:50}]);
 for(const next of [editAutomationKey(show,v,'opacity',1,5),editAutomationKey(show,v,'opacity',6,NaN),editAutomationKey(show,v,'opacity',6,5,'gone'),editAutomationKey(show,{...v,locked:true},'opacity',6,5)])expect(next.motion).toEqual(v.motion);
 const reverse=newShader('neon-beams');reverse.time={...DEFAULT_SHADER_TIME,direction:'reverse',loopS:0};const backwards={...v,source:{mediaId:null,rect:[0,0,100,100] as [number,number,number,number],shader:reverse}};expect(editAutomationKey(show,backwards,'shader:glow',7,1)).toBe(backwards);
});
