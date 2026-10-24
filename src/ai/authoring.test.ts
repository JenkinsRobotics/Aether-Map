import { VISUAL_EFFECTS } from '../visual-effects';
import { describe, expect, it } from 'vitest';
import { emptyShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { parseShow, serializeShow } from '../show-file';
import { runCommand, runDocumentCommand } from '../automation/commands';
import { MapAgentEditor, type MapAgentState } from '../automation/live-workspace';
import { mappedVisualRecipe } from './program';
import { GALLERY_VISUALS } from '../features/visual-gallery';
import { mapCommands } from './catalog';
import { initialHistory, pushHistory, redoHistory, undoHistory } from '../history';
const encode = (show: ReturnType<typeof emptyShow>) => new TextDecoder().decode(serializeShow(show));
function fixture() {
  const show = normalizeDocument(emptyShow());
  const result = runDocumentCommand('map.show.runprogram', show, {program_json:JSON.stringify(mappedVisualRecipe)});
  const refs = result.result.references as Record<string, Record<string,string>>;
  return {before:show,show:result.document!,refs};
}

describe('Map AI authoring and proof', () => {
  it('executes the published recipe with real composition, stable round-trip and preserved output/focus', () => {
    const {before,show,refs} = fixture();
    expect(show.activeSceneId).toBe(before.activeSceneId); expect(show.outputs).toEqual(before.outputs);
    const reopened = parseShow(serializeShow(show));
    for (const time_s of [0,5,59,100]) {
      const {result} = runDocumentCommand('map.show.verify', reopened, {scene_id:refs.scene.scene_id,time_s});
      expect(result).toMatchObject({valid:true,layer_count:1,layers:[{kind:'shader',shader:{preset:'neon-beams'}}]});
      const corners = (result.layers as {corners:number[][]}[])[0].corners;
      expect(corners).toEqual([[80,60],[1200,60],[1200,660],[80,660]]);
    }
    expect(encode(before)).not.toContain('Agent light show');
  });
  it('shares live edits, one ordinary undo entry, read-only discovery and the saved worker', async () => {
    let history = initialHistory(normalizeDocument(emptyShow()));
    const initial = history.present;
    const state: MapAgentState = {contextKey:'test',get show(){return history.present;},available:true,writable:true,
      get canUndo(){return !!history.past.length;},get canRedo(){return !!history.future.length;},selection:{surface_ids:[],clip_id:null,asset_id:null},
      commit:show=>{history=pushHistory(history,show,null,1);},undo:()=>{history=undoHistory(history);},redo:()=>{history=redoHistory(history);}};
    const editor = new MapAgentEditor(()=>state);
    const call = (name:string,args:Record<string,unknown>={})=>editor.execute('test',{id:'x',name:'aether_map_'+name,arguments:args},new AbortController().signal);
    const result = await call('show_runprogram',{program_json:JSON.stringify(mappedVisualRecipe)}) as {references:Record<string,Record<string,string>>};
    expect(history.past).toHaveLength(1);
    const edited = history.present;
    await call('undo'); expect(history.present).toBe(initial);
    await call('redo'); expect(history.present).toBe(edited);
    const args = {clip_id:result.references.visual.clip_id,changes_json:JSON.stringify({opacity:.4,continuous:false,start_s:4,duration_s:8,effects:[{kind:'hue',amount:30}]})};
    const saved = runCommand('map.visual.edit',encode(edited),args);
    await call('visual_edit',args);
    const live = parseShow(serializeShow(history.present)).visuals!.find(v=>v.id===args.clip_id)!, disk = parseShow(saved.content!).visuals!.find(v=>v.id===args.clip_id)!;
    expect({...live,effects:live.effects?.map(({kind,amount,enabled})=>({kind,amount,enabled}))}).toEqual({...disk,effects:disk.effects?.map(({kind,amount,enabled})=>({kind,amount,enabled}))});
    state.writable=false;
    expect(await call('agent_docs',{topic:'gallery',query:'synthwave'})).toMatchObject({changed:false});
    expect(await call('show_verify',{scene_id:result.references.scene.scene_id,time_s:6})).toMatchObject({valid:true,layer_count:1});
    await expect(call('show_runprogram',{program_json:JSON.stringify(mappedVisualRecipe)})).rejects.toThrow('read-only');
  });
  it.each(['late failure','assertion','forward reference','unknown argument','duplicate id','nested program','file authority'])('refuses %s without any partial document mutation', reason => {
    const original=normalizeDocument(emptyShow()), bytes=encode(original), program=structuredClone(mappedVisualRecipe) as unknown as {version:number;steps:{id:string;command:string;arguments:Record<string,unknown>}[];assertions:unknown[]};
    if(reason==='late failure')program.steps.push({id:'bad',command:'map.visual.edit',arguments:{clip_id:'missing',changes_json:'{}'}});
    if(reason==='assertion')program.assertions=[{scene_id:{$ref:'scene.scene_id'},time_s:5,layer_count:8}];
    if(reason==='forward reference')program.steps[1].arguments.scene_id={$ref:'later.scene_id'};
    if(reason==='unknown argument')program.steps[0].arguments.surprise=true;
    if(reason==='duplicate id')program.steps[1].id='scene';
    if(reason==='nested program')program.steps[1].command='map.show.runprogram';
    if(reason==='file authority')program.steps[1].arguments.id='another-file';
    expect(()=>runDocumentCommand('map.show.runprogram',original,{program_json:JSON.stringify(program)})).toThrow();
    expect(encode(original)).toBe(bytes);
  });
  it('creates real text and color sources, configures placement/targets/timing, and replaces only one use', () => {
    const {show,refs}=fixture();
    let next=runDocumentCommand('map.visual.edit',show,{clip_id:refs.visual.clip_id,changes_json:JSON.stringify({source:{kind:'text',text:'Aether',color:'#ff3300',size:180},opacity:.7,mapping:'span',placement:{widthPercent:50},targets:[{scene_id:refs.scene.scene_id}],continuous:false,start_s:2,duration_s:4})}).document!;
    const visual=next.visuals!.find(v=>v.id===refs.visual.clip_id)!;
    expect(visual.source!.text).toMatchObject({text:'Aether',sizePx:180,color:'#ff3300'});
    expect(show.pool!.find(a=>a.id===refs.visual.asset_id)!.source.shader!.preset).toBe('neon-beams');
    expect(runDocumentCommand('map.show.verify',next,{scene_id:refs.scene.scene_id,time_s:0}).result.layer_count).toBe(0);
    expect(runDocumentCommand('map.show.verify',next,{scene_id:refs.scene.scene_id,time_s:3}).result.layer_count).toBe(1);
    next=runDocumentCommand('map.visual.edit',next,{clip_id:visual.id,changes_json:JSON.stringify({source:{kind:'color',color:'#123456'},enabled:false})}).document!;
    expect(runDocumentCommand('map.show.verify',next,{scene_id:refs.scene.scene_id,time_s:3}).result.layer_count).toBe(0);
  });
  it.each([{opacity:2},{targets:[{scene_id:'missing'}]},{source:{kind:'url',url:'https://x'}},{shader:{unknown:5}},{effects:[{kind:'fake',amount:0}]},{placement:{widthPercent:0}},{duration_s:NaN},{enabled:'yes'}])('rejects invalid configuration %j', changes => {
    const {show,refs}=fixture(), before=encode(show);
    expect(()=>runDocumentCommand('map.visual.edit',show,{clip_id:refs.visual.clip_id,changes_json:JSON.stringify(changes)})).toThrow();
    expect(encode(show)).toBe(before);
  });
  it('honors track and clip locks and diagnoses missing identities',()=>{
    const {show,refs}=fixture(), v=show.visuals!.find(v=>v.id===refs.visual.clip_id)!;
    for(const locked of [v,show.tracks!.find(t=>t.id===v.trackID)!]){
      locked.locked=true;
      expect(()=>runDocumentCommand('map.visual.edit',show,{clip_id:v.id,changes_json:'{"opacity":0.5}'})).toThrow('locked');
      locked.locked=false;
    }
    v.targets=[{sceneID:'gone'}];
    expect(runDocumentCommand('map.show.verify',show,{scene_id:refs.scene.scene_id,time_s:0}).result).toMatchObject({valid:false,issue_count:1});
  });
  it('discovery pages the real complete gallery and executable schemas with bounded responses',()=>{
    const show=normalizeDocument(emptyShow());let all:unknown[]=[];
    for(let offset=0;offset<GALLERY_VISUALS.length;offset+=5){const r=runDocumentCommand('map.agent.docs',show,{topic:'gallery',offset}).result;all.push(...r.items as unknown[]);expect(JSON.stringify(r).length).toBeLessThan(28000);}
    expect(all).toHaveLength(GALLERY_VISUALS.length);
    for(const command of mapCommands){const r=runDocumentCommand('map.agent.docs',show,{name:command.id}).result;expect((r.items as unknown[])[0]).toEqual(command);}
  });
});

it('all source effects are agent-editable and survive saved-file parsing with their actual ranges', () => {
  const {show,refs}=fixture();
  const effects=VISUAL_EFFECTS.map(e=>({kind:e.value,amount:e.initial,enabled:true}));
  const next=runDocumentCommand('map.visual.edit',show,{clip_id:refs.visual.clip_id,changes_json:JSON.stringify({effects})}).document!;
  const reopened=parseShow(serializeShow(next));
  expect(reopened.visuals!.find(v=>v.id===refs.visual.clip_id)!.effects!.map(({id:_id,...e})=>e)).toEqual(effects);
  expect(()=>runDocumentCommand('map.visual.edit',show,{clip_id:refs.visual.clip_id,changes_json:JSON.stringify({effects:[{kind:'tile',amount:9}]})})).toThrow();
  expect(()=>runDocumentCommand('map.visual.edit',show,{clip_id:refs.visual.clip_id,changes_json:JSON.stringify({effects:[{kind:'kaleido',amount:1}]})})).toThrow();
});

it('agents author and reopen effect/shader motion, merge assignments, clear them and preserve atomicity', () => {
  const {show,refs}=fixture(), original=encode(show), clip_id=refs.visual.clip_id;
  const keys=[{id:'a',timeS:0,value:0,interpolation:'linear'},{id:'b',timeS:4,value:1,interpolation:'smooth'}];
  const edit=(document:typeof show,changes:object)=>runDocumentCommand('map.visual.edit',document,{clip_id,changes_json:JSON.stringify(changes)}).document!;
  const next=edit(show,{shader:{animation:{scale:keys},modulation:{glow:{source:'midi',control:7,range:{min:0,max:2}}}},effects:[{kind:'blur',amount:20,animation:keys,modulation:{source:'audio',band:'low',range:{min:0,max:80}}}]});
  const opened=parseShow(serializeShow(next)), visual=opened.visuals!.find(v=>v.id===clip_id)!;
  expect(visual.source!.shader!.animation?.scale).toEqual(keys);
  expect(visual.source!.shader!.modulation?.glow).toMatchObject({source:'midi',control:7,range:{min:0,max:2}});
  expect(visual.effects?.[0]).toMatchObject({animation:keys,modulation:{source:'audio',band:'low',range:{min:0,max:80}}});
  const evaluated=runDocumentCommand('map.show.evaluate',opened,{scene_id:refs.scene.scene_id,time_s:2}).result.layers as {evaluated_shader:{scale:number;glow:number};effects:{amount:number}[]}[];
  expect(evaluated[0].evaluated_shader).toMatchObject({scale:.5,glow:0});expect(evaluated[0].effects[0].amount).toBe(0);
  const changed=edit(opened,{shader:{animation:{speed:keys,scale:null},modulation:{glow:null}}}).visuals!.find(v=>v.id===clip_id)!;
  expect(changed.source!.shader!.animation).toEqual({speed:keys});expect(changed.source!.shader!.modulation?.glow).toBeUndefined();
  const cleared=edit(opened,{shader:{animation:null,modulation:null}}).visuals!.find(v=>v.id===clip_id)!;
  expect(cleared.source!.shader!.animation).toBeUndefined();expect(cleared.source!.shader!.modulation).toBeUndefined();
  for(const changes of [
    {shader:{animation:{missing:keys}}}, {shader:{animation:{scale:[{timeS:-1,value:3}]}}},
    {shader:{animation:{scale:[{timeS:1,value:3},{timeS:1,value:4}]}}},
    {shader:{modulation:{scale:{source:'script'}}}}, {shader:{modulation:{scale:{source:'midi',control:1.5}}}},
    {shader:{modulation:{scale:{range:{min:2,max:1}}}}}, {shader:{modulation:{scale:{periodS:0}}}},
    {effects:[{kind:'blur',amount:20,animation:[{timeS:1,value:101}]}]},
    {effects:[{kind:'blur',amount:20,modulation:{range:{min:0,max:101}}}]},
  ]) {expect(()=>edit(show,changes)).toThrow();expect(encode(show)).toBe(original);}
});

it('body motion is authored through the same validated live/saved commands and evaluates silently offline',()=>{
 const {show,refs}=fixture(),clip_id=refs.visual.clip_id;
 const next=runDocumentCommand('map.visual.edit',show,{clip_id,changes_json:JSON.stringify({shader:{modulation:{glow:{source:'body',bodySignal:'leftHand',range:{min:.2,max:2}}}},effects:[{kind:'zoom',amount:20,modulation:{source:'body',bodySignal:'x',range:{min:0,max:100}}}]})}).document!;
 const opened=parseShow(serializeShow(next)),visual=opened.visuals!.find(v=>v.id===clip_id)!;
 expect(visual.source?.shader?.modulation?.glow).toMatchObject({source:'body',bodySignal:'leftHand'});
 expect(visual.effects?.[0].modulation).toMatchObject({source:'body',bodySignal:'x'});
 const result=runDocumentCommand('map.show.evaluate',opened,{scene_id:refs.scene.scene_id,time_s:2}).result;
 expect(result.layers).toMatchObject([{evaluated_shader:{glow:.2},effects:[{amount:0}]}]);
});
