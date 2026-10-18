import { expect,test } from 'vitest';
import { emptyShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { createAgentVisual,editAgentVisual } from './visuals';
import { runCommand,runDocumentCommand } from '../automation/commands';
import { parseShow,serializeShow } from '../show-file';
import { visualSource } from '../media-pool';
const args=(id:string,changes:unknown)=>({clip_id:id,changes_json:JSON.stringify(changes)});
function seed(){const show=normalizeDocument(emptyShow());return createAgentVisual(show,{scene_id:show.activeSceneId,name:'Title',source_json:JSON.stringify({kind:'text',text:'Hello'})}).show;}
test('saved and live agents edit/inspect/evaluate the same source motion and clearing retains format9',()=>{
 const show=seed(),id=show.visuals![0].id;
 const edit=args(id,{source_parameters:{textSizePx:80},source_motion:{animation:{textSizePx:[{timeS:0,value:20},{timeS:4,value:100}]},modulation:{textLineHeight:{source:'midi',control:7,range:{min:1,max:3}}}}});
 const live=runDocumentCommand('map.visual.edit',show,edit),saved=runCommand('map.visual.edit',new TextDecoder().decode(serializeShow(show)),edit),next=parseShow(saved.content!);
 expect(next.version).toBe(9);expect(next).toEqual(parseShow(serializeShow(live.document!)));
 expect(saved.result).toMatchObject({clips:[{source_parameters:{textSizePx:80},source_motion:{animation:{textSizePx:[{value:20},{value:100}]}}}]});
 expect(runDocumentCommand('map.show.evaluate',next,{scene_id:next.activeSceneId,time_s:2}).result).toMatchObject({layers:[{source_parameters:{textSizePx:60,textLineHeight:1}}]});
 const base=editAgentVisual(next,args(id,{source_parameters:{textSizePx:40}}));expect(visualSource(base,base.visuals![0]).motion).toEqual(visualSource(next,next.visuals![0]).motion);
 const partial=editAgentVisual(base,args(id,{source_motion:{animation:{textSizePx:null}}}));expect(visualSource(partial,partial.visuals![0]).motion!.animation).toBeUndefined();
 const cleared=editAgentVisual(partial,args(id,{source_motion:null}));expect(cleared.version).toBe(9);expect(visualSource(cleared,cleared.visuals![0]).motion).toBeUndefined();expect(show.version).toBe(6);
});
test.each([{source_parameters:{cropLeftPx:2}},{source_parameters:{textSizePx:0}},{source_motion:{animation:{textSizePx:[{timeS:1,value:30},{timeS:1,value:50}]}}},{source_motion:{modulation:{textSizePx:{range:{min:50,max:20}}}}},{source_motion:{unknown:{}}},{source_motion:{modulation:{textSizePx:{source:'camera'}}}}])('invalid source edits reject atomically: %j',change=>{
 const show=seed(),before=serializeShow(show);expect(()=>editAgentVisual(show,args(show.visuals![0].id,{name:'Should not change',...change}))).toThrow();expect(serializeShow(show)).toEqual(before);
});
test('agent-created media displays media, offers bounded crop and has order independent base edits',()=>{
 const show=normalizeDocument(emptyShow());show.media=[{id:'image',file:'image.png',name:'Image',kind:'image',width:320,height:180,bytes:10}];
 const created=createAgentVisual(show,{scene_id:show.activeSceneId,name:'Image',source_json:JSON.stringify({kind:'media',media_id:'image'})}).show,id=created.visuals![0].id;
 expect(visualSource(created,created.visuals![0]).fill).toBeUndefined();
 for(const values of [{cropLeftPx:300,cropWidthPx:100},{cropWidthPx:100,cropLeftPx:300}]){const edited=editAgentVisual(created,args(id,{source_parameters:values}));expect(visualSource(edited,edited.visuals![0]).rect).toEqual([300,0,20,180]);}
 expect(()=>editAgentVisual(created,args(id,{source_motion:{animation:{cropLeftPx:[{timeS:0,value:320}]}}}))).toThrow();
});
test('color and choice commands discover names, use format10 and agree across live/saved evaluation',()=>{
 const show=seed(),id=show.visuals![0].id;
 const changes={source_parameters:{'color:text:hueDeg':0,'color:text:saturationPercent':100,'color:text:brightnessPercent':100},source_motion:{animation:{'color:text:hueDeg':[{timeS:0,value:0},{timeS:4,value:240}],'choice:textAlign':[{timeS:0,value:0},{timeS:4,value:2}]},modulation:{'color:textBackground:alphaPercent':{source:'midi',control:20,range:{min:0,max:100}}}}};
 const live=runDocumentCommand('map.visual.edit',show,args(id,changes)),saved=runCommand('map.visual.edit',new TextDecoder().decode(serializeShow(show)),args(id,changes)),next=parseShow(saved.content!);
 expect(next.version).toBe(10);expect(next).toEqual(parseShow(serializeShow(live.document!)));
 expect(saved.result).toMatchObject({clips:[{source_parameter_specs:expect.arrayContaining([{key:'choice:textAlign',label:'Text alignment',min:0,max:3,step:1,unit:'',options:['Left','Center','Right','Justify'],interpolation:'hold'}])}]});
 const early=runDocumentCommand('map.show.evaluate',next,{scene_id:next.activeSceneId,time_s:2}).result;
 expect(early).toMatchObject({layers:[{source_parameters:{'color:text:hueDeg':120,'choice:textAlign':0}}]});
 const exact=runDocumentCommand('map.show.evaluate',next,{scene_id:next.activeSceneId,time_s:4}).result;
 expect(exact).toMatchObject({layers:[{source_parameters:{'color:text:hueDeg':240,'choice:textAlign':2}}]});
 expect(visualSource(next,next.visuals![0]).motion!.animation!['choice:textAlign']!.every(k=>k.interpolation==='hold')).toBe(true);
 const cleared=editAgentVisual(next,args(id,{source_motion:null}));expect(cleared.version).toBe(10);
});
test.each([
 {source_parameters:{'choice:textAlign':.5}}, {source_parameters:{'choice:textAlign':4}},
 {source_parameters:{'color:text:hueDeg':361}}, {source_parameters:{'color:fill:hueDeg':90}},
 {source_motion:{animation:{'choice:textAlign':[{timeS:0,value:1.2}]}}},
 {source_motion:{animation:{'choice:textAlign':[{timeS:0,value:1,interpolation:'linear'}]}}},
 {source_motion:{animation:{'choice:textAlign':[{timeS:0,value:4}]}}},
 {source_motion:{modulation:{'choice:textAlign':{range:{min:0,max:4}}}}},
])('invalid color/choice command fails atomically: %j',changes=>{
 const show=seed(),before=serializeShow(show);expect(()=>editAgentVisual(show,args(show.visuals![0].id,{name:'Must not change',...changes}))).toThrow();expect(serializeShow(show)).toEqual(before);
});
test('a full source refuses a new assignment atomically instead of dropping an existing channel',()=>{
 const show=seed(),v=show.visuals![0];v.source={...visualSource(show,v),motion:{animation:Object.fromEntries(Array.from({length:256},(_,i)=>[`color:shader:parameter:c${i}:hueDeg`,[{id:'key',timeS:0,value:0,interpolation:'hold' as const}]]))}};
 const before=serializeShow(show);expect(()=>editAgentVisual(show,args(v.id,{name:'Must not change',source_motion:{animation:{'color:text:hueDeg':[{timeS:0,value:120}]}}}))).toThrow('at most 256');expect(serializeShow(show)).toEqual(before);
});
