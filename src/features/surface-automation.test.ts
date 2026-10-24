import { visualSurface } from '../visual-document';
import { surfacesAt } from '../surface-interaction';
import { setLayerBounds, boundsOf } from '../layer-transform';
import { resizedGroupGeometry, groupBounds } from '../group-interaction';
import { expect, test } from 'vitest';
import { emptyShow, newSurface, type Surface } from '../document';
import { normalizeDocument } from '../normalize-document';
import { parseShow, serializeShow } from '../show-file';
import { evaluateSurface, evaluateShow, mappingSurfaceAt } from '../playback';
import { sceneVisuals } from '../visual-render';
import { animateSurface, featureTransformAt } from './animation';
import { editSurfaceAutomation, manualSurfaceParameter, surfaceAutomationPatch } from './surface-automation';
import { DEFAULT_MODULATION, DEFAULT_LFOS } from './types';
import { runCommand, runDocumentCommand } from '../automation/commands';
import { createAgentVisual } from '../ai/visuals';
const keys = (a: number, b: number) => [{ id:'a',timeS:0,value:a,interpolation:'linear' },{ id:'b',timeS:4,value:b,interpolation:'linear' }];
const surface = () => newSurface({ width: 200, height: 100 }, 0);
const showWith = (s: Surface) => { const show=emptyShow();show.scenes[0].surfaces=[s];return normalizeDocument(show); };
test('keyframes and live motion resolve geometry, curve masks, opacity, radius and bend without editing bases',()=>{
  const base=surface();base.masks=[[[0,0],[10,0],[10,10]]];
  base.maskCurves=[[{ c1:[2,0],c2:[8,0] }]];
  const s=editSurfaceAutomation(base,{bases:{opacity:.8},animation:{xPx:keys(0,40),radiusPx:keys(0,20),bendAngleDeg:keys(-60,60)},
    bend_axis:'vertical',modulation:{xPx:{source:'midi',control:7,amount:10},opacity:{source:'audio',band:'low',range:{min:0,max:1}}}});
  const before=structuredClone(s),resolved=evaluateSurface(s,2,[],{levels:{low:.25},controls:{7:.5}});
  expect(resolved.corners[0][0]).toBeCloseTo(base.corners[0][0]+25);
  expect(resolved.masks[0][0][0]).toBe(25);expect(resolved.maskCurves?.[0][0]?.c1).toEqual([27,0]);
  expect(resolved.opacity).toBe(.25);expect(resolved.radiusPx).toBe(10);expect(resolved.bend).toEqual({axis:'vertical',angleDeg:0});
  expect(s).toEqual(before);expect(base.animation).toBeUndefined();
});
test.each(['time','lfo','audio','midi','body'] as const)('%s assignments use the common normalized inputs and bounds',source=>{
  const s=editSurfaceAutomation(surface(),{modulation:{bendAngleDeg:{...DEFAULT_MODULATION,source,range:{min:-100,max:100},bodySignal:'x'}}});
  const value=evaluateSurface(s,1,[],{levels:{level:.75,'body:x':.75},controls:{1:.75},lfos:DEFAULT_LFOS});
  expect(value.bend?.angleDeg).toBeCloseTo(source==='time'||source==='lfo'?100:50);
});
test('scene LFO uses the parent clock while time cycles and keys use surface time',()=>{
  const s=editSurfaceAutomation(surface(),{animation:{xPx:keys(0,40)},modulation:{xPx:{source:'lfo',lfoIndex:1,amount:10},rotationDeg:{source:'time',amount:20}}});
  const lfos=DEFAULT_LFOS.map((v,i)=>i===1?{...v,periodS:4}:v);
  const resolved=evaluateSurface(s,0,[],{sceneTimeS:1,lfos});
  expect(resolved.corners[0][0]).toBeCloseTo(s.corners[0][0]+10);
  expect(featureTransformAt(s,0,{sceneTimeS:1,lfos}).rotationDeg).toBe(0);
});
test('missing live inputs read zero and evaluated extremes stay within safe limits',()=>{
  const s=editSurfaceAutomation(surface(),{modulation:{opacity:{source:'body',range:{min:0,max:1}},scaleX:{source:'midi',amount:-1000},radiusPx:{source:'audio',amount:1e6},bendAngleDeg:{source:'midi',amount:1e6}}});
  expect(evaluateSurface(s,1).opacity).toBe(0);
  const full={controls:{1:1},levels:{level:1,'body:x':1}};
  expect(featureTransformAt(s,1,full).scaleX).toBe(.01);
  expect(evaluateSurface(s,1,[],full)).toMatchObject({opacity:1,radiusPx:16384,bend:{angleDeg:170}});
});
test('calibration and geometry edits retain authored zero-time geometry without live motion',()=>{
  const s=editSurfaceAutomation(surface(),{animation:{xPx:keys(10,50)},modulation:{xPx:{source:'time',waveform:'square',amount:100}}});
  expect(mappingSurfaceAt(s,3,[],true).corners).toEqual(animateSurface(s,0).corners);
  expect(featureTransformAt(s,0).xPx).toBe(10);
  expect(evaluateSurface(s,0).corners[0][0]).toBe(s.corners[0][0]+110);
});
test('composition, empty placeholders, calibration and show evaluation share motion values',()=>{
  const s=editSurfaceAutomation(surface(),{modulation:{opacity:{source:'midi',range:{min:0,max:1}},xPx:{source:'time',amount:100}}});
  const empty={...showWith(s),visuals:[],timelines:[]},inputs={controls:{1:.5}};
  expect(evaluateShow(empty,1,inputs).scenes[0].surfaces[0].opacity).toBe(.5);
  expect(sceneVisuals(empty,empty.scenes[0],1,true,undefined,inputs)[0].opacity).toBe(.5);
  const made=createAgentVisual(empty,{scene_id:empty.activeSceneId,name:'Red',source_json:JSON.stringify({kind:'color',color:'#ff0000'})});
  const v=made.show.visuals!.find(v=>v.id===made.created.clip_id)!;v.targets=[{sceneID:empty.activeSceneId,surfaceID:s.id}];
  const render=sceneVisuals(made.show,made.show.scenes[0],1,false,undefined,inputs);
  expect(render[0].opacity).toBe(.5);expect(render[0].corners).toEqual(evaluateSurface(s,1,[],inputs).corners);
  expect(sceneVisuals(made.show,made.show.scenes[0],1,false,undefined,inputs,true)[0].corners).toEqual(animateSurface(s,0).corners);
});
test('manual takeover preserves the evaluated value and unrelated motion',()=>{
  const s=editSurfaceAutomation(surface(),{animation:{opacity:keys(0,1)},modulation:{opacity:{amount:.2},xPx:{amount:20}}});
  const value=evaluateSurface(s,1).opacity,next=manualSurfaceParameter(s,'opacity',value);
  expect(next.opacity).toBeCloseTo(.45);expect(next.animation).toBeUndefined();expect(next.modulation?.opacity).toBeUndefined();expect(next.modulation?.xPx).toEqual(s.modulation?.xPx);
});
test('format12 survives file and unassigned-surface roundtrips; legacy keys keep their format',()=>{
  const legacy=showWith(editSurfaceAutomation(surface(),{animation:{xPx:keys(0,50)}}));expect(parseShow(serializeShow(legacy)).version).toBeLessThan(12);
  const s=editSurfaceAutomation(surface(),{animation:{radiusPx:keys(0,40)},modulation:{bendAngleDeg:{source:'body',bodySignal:'x',range:{min:-90,max:90}}}});
  const show=showWith(s),saved=parseShow(serializeShow(show));expect(saved.version).toBe(12);expect(saved.scenes[0].surfaces[0].modulation).toEqual(s.modulation);
  const unassigned=emptyShow();unassigned.unassignedSurfaces=[s];expect(parseShow(serializeShow(unassigned)).unassignedSurfaces?.[0].modulation).toEqual(s.modulation);
  expect(parseShow(serializeShow(unassigned)).version).toBe(12);
  expect(()=>parseShow(JSON.stringify({...show,version:13}))).toThrow('Unsupported');
});
test('file recovery removes unsupported channels and bounds new shape motion',()=>{
  const raw=showWith(surface());Object.assign(raw.scenes[0].surfaces[0],{animation:{radiusPx:[{timeS:2,value:-30},{timeS:4,value:1e9}],bendAngleDeg:[{timeS:2,value:999}]},modulation:{unknown:{amount:10},scaleX:{range:{min:-10,max:1000}},opacity:[]}});
  const s=parseShow(serializeShow(raw)).scenes[0].surfaces[0];expect(s.animation?.radiusPx?.map(k=>k.value)).toEqual([0,16384]);expect(s.animation?.bendAngleDeg?.[0].value).toBe(170);
  expect(Object.keys(s.modulation!)).toEqual(['scaleX']);expect(s.modulation?.scaleX?.range).toEqual({min:.01,max:100});
});
test.each([{bases:{opacity:2}},{animation:{bendAngleDeg:keys(-200,0)}},{animation:{unknown:keys(0,1)}},{animation:{xPx:[{timeS:0,value:1},{timeS:0,value:2}]}},{modulation:{xPx:{source:'camera'}}},{modulation:{radiusPx:{range:{min:-1,max:20}}}},{bend_axis:'diagonal'},{extra:true}])('invalid writes are atomic: %j',changes=>{
  const s=surface(),before=structuredClone(s);expect(()=>editSurfaceAutomation(s,changes)).toThrow();expect(s).toEqual(before);
});
test('saved and live commands share canonical edits, bounds, inspection and clear semantics',()=>{
  const s=surface(),show=showWith(s),args={scene_id:show.activeSceneId,surface_id:s.id,changes_json:JSON.stringify({animation:{radiusPx:keys(0,40)},modulation:{opacity:{source:'midi',range:{min:.2,max:.8}}}})};
  const saved=runCommand('map.surface.animate',new TextDecoder().decode(serializeShow(show)),args),live=runDocumentCommand('map.surface.animate',show,args);
  expect(parseShow(saved.content!)).toEqual(parseShow(serializeShow(live.document!)));expect(saved.result).toMatchObject({surface_id:s.id,surface_parameters:{radiusPx:0},modulation:{opacity:{source:'midi'}}});
  const cleared=runDocumentCommand('map.surface.animate',live.document!,{...args,changes_json:JSON.stringify({animation:{radiusPx:null},modulation:null})}).document!;
  expect(cleared.scenes[0].surfaces[0].modulation).toBeUndefined();expect(cleared.version).toBe(12);
  expect(()=>editSurfaceAutomation({...s,locked:true},{})).toThrow('locked');
  expect(()=>runDocumentCommand('map.surface.animate',show,{...args,surface_id:'missing'})).toThrow('not found');
});

test('picking, bounds and grouped resize invert the same live transform without baking assignments',()=>{
 const s=editSurfaceAutomation(surface(),{modulation:{xPx:{source:'midi',amount:200},scaleX:{source:'midi',amount:2},rotationDeg:{source:'midi',amount:80}}}),context={controls:{1:.5}};
 const visible=evaluateSurface(s,2,[],context),b=boundsOf(visible.corners),point:[number,number]=[b.x+b.width/2,b.y+b.height/2];
 expect(surfacesAt([s],point,2,context)).toEqual([s]);
 const next={x:100,y:100,width:400,height:200},geometry=setLayerBounds(s,next,2,context);
 const resolved=boundsOf(evaluateSurface({...s,...geometry},2,[],context).corners);
 for(const key of ['x','y','width','height'] as const)expect(resolved[key]).toBeCloseTo(next[key]);
 const other={...s,id:'other',corners:s.corners.map(([x,y])=>[x+300,y] as [number,number]) as Surface['corners']};
 const changes=resizedGroupGeometry([s,other],next,2,context),members=[s,other].map(p=>({...p,...changes.find(c=>c.id===p.id)!.geometry}));
 const bounds=groupBounds(members,2,context)!;for(const key of ['x','y','width','height'] as const)expect(bounds[key]).toBeCloseTo(next[key]);
 expect(members[0].modulation).toBe(s.modulation);
});
test('surface patches never modify source clips and source editor projections omit target motion',()=>{
 const s=surface(),changed=editSurfaceAutomation(s,{modulation:{xPx:{amount:100}}});
 expect(Object.keys(surfaceAutomationPatch(s,changed))).toEqual(['modulation']);
 const show=showWith(changed),created=createAgentVisual(show,{scene_id:show.activeSceneId,name:'Image',source_json:JSON.stringify({kind:'color',color:'#ffffff'})});
 const v=created.show.visuals!.find(v=>v.id===created.created.clip_id)!;v.targets=[{sceneID:show.activeSceneId,surfaceID:s.id}];
 expect(visualSurface(created.show,v).modulation).toBeUndefined();
});
