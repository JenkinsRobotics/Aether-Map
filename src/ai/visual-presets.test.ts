import { expect,test } from 'vitest';
import { emptyShow,type MapShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { createAgentVisual,editAgentVisual } from './visuals';
import { runCommand,runDocumentCommand } from '../automation/commands';
import { serializeShow,parseShow } from '../show-file';
import { visualSource } from '../media-pool';
const args=(id:string,changes:unknown)=>({clip_id:id,changes_json:JSON.stringify(changes)});
function seed():MapShow{const show=normalizeDocument(emptyShow());return createAgentVisual(show,{scene_id:show.activeSceneId,name:'Title',source_json:JSON.stringify({kind:'text',text:'Hello',color:'#ff0000'})}).show;}
test('saved and live commands store/recall full looks with identical format11 output and discovery',()=>{
 const show=seed();show.visuals![0].effects=[{id:'blur',kind:'blur',amount:30,enabled:true}];const id=show.visuals![0].id,changes={opacity:.4,source_motion:{animation:{'color:text:hueDeg':[{timeS:0,value:120}]}},preset:{action:'store',slot:'A'}};
 const live=runDocumentCommand('map.visual.edit',show,args(id,changes)),saved=runCommand('map.visual.edit',new TextDecoder().decode(serializeShow(show)),args(id,changes)),stored=parseShow(saved.content!);
 expect(stored.version).toBe(11);expect(stored).toEqual(parseShow(serializeShow(live.document!)));expect(saved.result).toMatchObject({clips:[{presets:[{slot:'A',kind:'visual',media_id:null}]}]});
 const changed=editAgentVisual(stored,args(id,{opacity:1,effects:[],source:{kind:'color',color:'#0000ff'}}));
 const recalled=editAgentVisual(changed,args(id,{preset:{action:'recall',slot:'A'}}));expect(visualSource(recalled,recalled.visuals![0]).text!.text).toBe('Hello');expect(recalled.visuals![0].opacity).toBe(.4);expect(recalled.visuals![0].effects![0].amount).toBe(30);
 expect(runDocumentCommand('map.show.evaluate',recalled,{scene_id:recalled.activeSceneId,time_s:2}).result).toMatchObject({layers:[{source_parameters:{'color:text:hueDeg':120}}]});
 expect(runDocumentCommand('map.agent.docs',recalled,{topic:'sources'}).result).toHaveProperty('visual_presets');
 const clear=editAgentVisual(recalled,args(id,{preset:{action:'clear',slot:'A'}}));expect(clear.version).toBe(11);expect(clear.visuals![0].looks).toBeUndefined();
});
test('agent recall from another clip preserves target schedule and references and random seeds repeat',()=>{
 let show=seed();const original=show.visuals![0].id;show=editAgentVisual(show,args(original,{preset:{action:'store',slot:'A'}}));show=createAgentVisual(show,{scene_id:show.activeSceneId,name:'Other',source_json:JSON.stringify({kind:'color',color:'#0000ff'})}).show;
 const v=show.visuals!.at(-1)!;v.startS=5;v.inS=2;v.loop=false;v.continuous=false;const target=structuredClone(v);
 const reused=editAgentVisual(show,args(v.id,{preset:{action:'recall',slot:'A',from_clip_id:original}})),next=reused.visuals!.at(-1)!;
 for(const key of ['id','name','targets','trackID','startS','inS','durationS','loop','continuous'] as const)expect(next[key]).toEqual(target[key]);expect(next.source!.text!.text).toBe('Hello');
 const random={preset:{action:'random',seed:123}};expect(editAgentVisual(show,args(v.id,random))).toEqual(editAgentVisual(show,args(v.id,random)));
});
test.each([
 {action:'store',slot:'D'},{action:'unknown',slot:'A'},{action:'recall',slot:'A'},
 {action:'store',slot:'A',from_clip_id:'x'},{action:'clear',slot:'A',seed:2},
 {action:'recall',slot:'A',from_clip_id:'missing'},{action:'random'},
 {action:'random',seed:-1},{action:'random',seed:1.5},{action:'random',seed:4294967296},{action:'random',seed:1,slot:'A'},{action:'store',slot:'A',unknown:true},
])('invalid preset action rejects the entire edit: %j',preset=>{
 const show=seed(),before=serializeShow(show);expect(()=>editAgentVisual(show,args(show.visuals![0].id,{name:'Must not change',opacity:.1,preset}))).toThrow();expect(serializeShow(show)).toEqual(before);
});
