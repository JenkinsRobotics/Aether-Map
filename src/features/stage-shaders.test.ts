import { expect,test } from 'vitest';
import { STAGE_GENERATORS } from './stage-shaders';
import { STAGE_CONTROLS } from './stage-controls';
import { SHADERS,newShader } from './shader-catalog';
import { parameterSliderRange,parameterStep } from './shader-parameter-controls';
import { performanceParameters } from '../performance/parameters';
import { emptyShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addSimpleVisual } from '../simple-visuals';
import { parseShow,serializeShow } from '../show-file';
import { visualSource } from '../media-pool';
import { shaderAt } from './shader-motion';
import { DEFAULT_MODULATION } from './types';
import { runDocumentCommand } from '../automation/commands';

test('40+ actual generators exclude image filters and preset variations',()=>{
 expect(SHADERS.filter(s=>!s.image).length).toBeGreaterThanOrEqual(40);
 expect(new Set(SHADERS.map(s=>s.id)).size).toBe(SHADERS.length);
 expect(new Set(STAGE_GENERATORS.map(s=>s.fragment)).size).toBe(STAGE_GENERATORS.length);
});
test('new generator controls remain editable and share appropriate precision in performance',()=>{
 for(const entry of STAGE_GENERATORS){
  const shader=newShader(entry.id);const show=addSimpleVisual(normalizeDocument(emptyShow()),{mediaId:null,rect:[0,0,1280,720],shader},entry.label);
  const controls=performanceParameters(show,show.visuals![0],0);
  for(const [key,value] of Object.entries(entry.params)){
   const spec=STAGE_CONTROLS[entry.id][key];expect(value).toBeGreaterThanOrEqual(spec.min);expect(value).toBeLessThanOrEqual(spec.max);
   const control=controls.find(c=>c.shaderKey===key)!;
   expect(control.min).toBe(spec.min);expect(control.max).toBe(spec.max);expect(control.step).toBe(parameterStep(key,entry.id));
   expect(parameterSliderRange(key,entry.id)).toEqual({min:spec.min,max:spec.max});
   const changed=control.set(spec.max,true);expect(changed.source!.shader!.parameters[key]).toBe(spec.max);
  }
 }
});
test('new sources support saved curves and live assignments through the same evaluator',()=>{
 for(const entry of STAGE_GENERATORS){
  const shader=newShader(entry.id),key=Object.keys(entry.params)[0];const spec=STAGE_CONTROLS[entry.id][key];
  shader.animation={[key]:[{id:'a',timeS:0,value:spec.min,interpolation:'linear'},{id:'b',timeS:4,value:spec.max,interpolation:'linear'}]};
  let show=addSimpleVisual(normalizeDocument(emptyShow()),{mediaId:null,rect:[0,0,1280,720],shader},entry.label);
  show=parseShow(serializeShow(show));const saved=visualSource(show,show.visuals![0]).shader!;
  expect(shaderAt(saved,2).parameters[key]).toBeCloseTo((spec.min+spec.max)/2);
  saved.modulation={[key]:{...DEFAULT_MODULATION,source:'audio',range:{min:spec.min,max:spec.max}}};
  expect(shaderAt(saved,2,{level:0}).parameters[key]).toBe(spec.min);
  expect(shaderAt(saved,2,{level:1}).parameters[key]).toBe(spec.max);
  const docs=runDocumentCommand('map.agent.docs',show,{topic:'gallery',query:entry.id}).result;
  expect(docs.items).toEqual(expect.arrayContaining([expect.objectContaining({id:`${entry.id}:0`})]));
 }
});
