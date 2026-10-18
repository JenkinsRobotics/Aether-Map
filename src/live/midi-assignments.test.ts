import {expect,test} from 'vitest';
import {emptyShow,newSurface} from '../document';
import {normalizeDocument} from '../normalize-document';
import {createAgentVisual,editAgentVisual} from '../ai/visuals';
import {midiAssignments} from './midi-assignments';
import {DEFAULT_MODULATION} from '../features/types';

test('manual/agent visual, shader and effect assignments project once and selected source uses share focus',()=>{
 const base=emptyShow();base.scenes[0].surfaces=[newSurface(base.output,0)];
 const created=createAgentVisual(normalizeDocument(base),{scene_id:base.activeSceneId,name:'Neon',source_json:JSON.stringify({kind:'gallery',id:'neon-beams:0'})});
 const id=created.created.clip_id;
 const show=editAgentVisual(created.show,{clip_id:id,changes_json:JSON.stringify({
  motion:{modulation:{opacityPercent:{source:'midi',control:7}}},
  shader:{modulation:{glow:{source:'midi',control:13}}},
  effects:[{kind:'zoom',amount:0,modulation:{source:'midi',control:14}}],
 })});
 expect(midiAssignments(show,id)).toEqual({assigned:[7,13,14],focused:[7,13,14]});
 expect(midiAssignments(show,null)).toEqual({assigned:[7,13,14],focused:[]});
 const cleared=editAgentVisual(show,{clip_id:id,changes_json:JSON.stringify({motion:null,shader:{modulation:null},effects:[]})});
 expect(midiAssignments(cleared,id)).toEqual({assigned:[],focused:[]});
});
test('legacy surface sources and clip assignments use the same CC numbers and do not activate devices',()=>{
 const show=emptyShow(),surface=newSurface(show.output,0);show.scenes[0].surfaces=[surface];
 surface.source.shader={preset:'neon-beams',parameters:{},colors:['#fff'],modulation:{glow:{...DEFAULT_MODULATION,source:'midi',control:22}}};
 surface.clips=[{id:'clip',startS:0,durationS:10,inS:0,loop:false,source:{mediaId:null,rect:[0,0,100,100],shader:{preset:'neon-beams',parameters:{},colors:['#fff'],modulation:{glow:{...DEFAULT_MODULATION,source:'midi',control:33}}}}}];
 expect(midiAssignments(show,'clip')).toEqual({assigned:[22,33],focused:[33]});
 expect(midiAssignments(show,surface.id)).toEqual({assigned:[22,33],focused:[22,33]});
});

test('surface geometry assignments contribute to controller lights and selected-surface focus',()=>{
 const show=emptyShow(),surface=newSurface(show.output,0);show.scenes[0].surfaces=[surface];
 surface.modulation={xPx:{...DEFAULT_MODULATION,source:'midi',control:29},opacity:{...DEFAULT_MODULATION,source:'audio'}};
 expect(midiAssignments(show,null)).toEqual({assigned:[29],focused:[]});
 expect(midiAssignments(show,surface.id)).toEqual({assigned:[29],focused:[29]});
});
