import { expect,test } from 'vitest';
import { emptyShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addSimpleVisual } from '../simple-visuals';
import { parseShow,serializeShow } from '../show-file';
import { runDocumentCommand,runCommand } from '../automation/commands';
import { createTimeline,currentTimelineID,placeTimeline } from '../timelines';
import { editAgentVisual } from './visuals';
const keys=[{timeS:0,value:0},{timeS:4,value:100}];
const seed=()=>addSimpleVisual(normalizeDocument(emptyShow()),{mediaId:null,rect:[0,0,100,100],fill:'#fff'},'White');
const args=(id:string,changes:unknown)=>({clip_id:id,changes_json:JSON.stringify(changes)});
test('agent and saved worker use format8 curves, inspect authored motion and evaluate derived placement',()=>{
 const show=seed(),id=show.visuals![0].id;
 const saved=runCommand('map.visual.edit',new TextDecoder().decode(serializeShow(show)),args(id,{motion:{animation:{opacityPercent:keys,xPercent:keys},modulation:{widthPercent:{source:'midi',control:9,range:{min:25,max:75}}}}}));
 const next=parseShow(saved.content!);expect(next.version).toBe(8);
 expect(saved.result).toMatchObject({clips:[{id,motion:{animation:{opacityPercent:[{timeS:0,value:0},{timeS:4,value:100}]}}}]});
 const evaluated=runDocumentCommand('map.show.evaluate',next,{scene_id:next.activeSceneId,time_s:2}).result;
 expect(evaluated).toMatchObject({layers:[{opacity:.5,placement:{xPercent:50,widthPercent:25}}]});
 const merge=editAgentVisual(next,args(id,{motion:{animation:{rotationDeg:[{timeS:0,value:35}],opacityPercent:null}}}));
 expect(merge.visuals![0].motion?.animation?.opacityPercent).toBeUndefined();
 expect(merge.visuals![0].motion?.animation?.xPercent).toHaveLength(2);expect(merge.visuals![0].motion?.modulation?.widthPercent).toBeTruthy();
 const base=editAgentVisual(merge,args(id,{placement:{xPercent:12}}));expect(base.visuals![0].motion).toEqual(merge.visuals![0].motion);
 const clear=editAgentVisual(base,args(id,{motion:null}));expect(clear.visuals![0].motion).toBeUndefined();expect(clear.version).toBe(8);
 expect(show.visuals![0].motion).toBeUndefined();
});
test.each([
 {animation:{unknown:keys}}, {animation:{opacityPercent:[{timeS:0,value:101}]}},
 {animation:{xPercent:[{timeS:0,value:0},{timeS:0,value:1}]}},
 {modulation:{widthPercent:{range:{min:0,max:100}}}},
 {modulation:{opacityPercent:{range:{min:80,max:20}}}},
 {modulation:{xPercent:{source:'banana'}}}, {extra:1},
])('rejects malformed motion atomically: %j',motion=>{
 const show=seed(),before=serializeShow(show);
 expect(()=>editAgentVisual(show,args(show.visuals![0].id,{name:'Would change',opacity:.2,motion}))).toThrow();
 expect(serializeShow(show)).toEqual(before);
});
test('compound opacity is editable but placement/source edits and locked tracks are refused',()=>{
 let show=createTimeline(seed(),'Group'),child=currentTimelineID(show);show={...show,activeTimelineID:undefined};
 show=placeTimeline(show,child,show.tracks!.find(t=>!t.timelineID&&t.kind==='video')!.id,0);
 const id=show.visuals!.at(-1)!.id;
 const next=editAgentVisual(show,args(id,{motion:{animation:{opacityPercent:keys}}}));expect(next.visuals!.at(-1)!.motion?.animation?.opacityPercent).toHaveLength(2);
 for(const change of [{motion:{animation:{xPercent:keys}}},{placement:{xPercent:30}},{source:{kind:'color',color:'#fff'}}])expect(()=>editAgentVisual(show,args(id,change))).toThrow();
 const locked={...show,tracks:show.tracks!.map(t=>({...t,locked:true}))};expect(()=>editAgentVisual(locked,args(id,{motion:null}))).toThrow('locked');
});
