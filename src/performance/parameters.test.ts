import { expect, test } from 'vitest';
import { emptyShow } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addSimpleVisual } from '../simple-visuals';
import { visualSource } from '../media-pool';
import { newShader, SHADERS, shaderOptions } from '../features/shader-catalog';
import { DEFAULT_MODULATION } from '../features/types';
import { performanceParameters, setPerformanceMotion } from './parameters';
import { effectValueAt } from '../features/effect-motion';
import { newVisualEffect, VISUAL_EFFECTS } from '../visual-effects';
import { parseShow, serializeShow } from '../show-file';

const seed = () => addSimpleVisual(normalizeDocument(emptyShow()), { mediaId: null, rect: [0, 0, 1280, 720], shader: newShader('neon-beams') }, 'Neon');
test('every catalog numeric control gets a finite usable interval and own source override', () => {
  for (const entry of SHADERS) {
    const show = seed(), visual = { ...show.visuals![0], source: { mediaId:null, rect:[0,0,1280,720] as [number,number,number,number], shader:newShader(entry.id) } };
    const controls = performanceParameters(show, visual, 0).filter(p => p.group === 'Shader');
    const keys = Object.keys(visual.source.shader.parameters).filter(k => typeof visual.source.shader.parameters[k] === 'number' && !shaderOptions(entry.id, k));
    expect(controls.map(p => p.shaderKey)).toEqual(keys);
    for (const control of controls) {
      expect(control.min).toBeLessThan(control.max); expect(control.base).toBeGreaterThanOrEqual(control.min); expect(control.base).toBeLessThanOrEqual(control.max);
      const next = control.set(control.base + control.step, true);
      expect(visualSource(show,next).shader!.parameters[control.shaderKey!]).toBeCloseTo(control.base+control.step);
    }
  }
});
test('manual takeover captures evaluated keys and modulation while preserving sibling and reusable sources', () => {
  const show = seed(), source = visualSource(show, show.visuals![0]);
  const visual = { ...show.visuals![0], source: { ...source, shader: { ...source.shader!,
    modulation:{glow:{...DEFAULT_MODULATION,source:'midi' as const,control:7,range:{min:0,max:4}},speed:{...DEFAULT_MODULATION}},
    animation:{glow:[{id:'k',timeS:0,value:2,interpolation:'linear' as const}]} } } };
  const p = performanceParameters(show, visual, 2, {}, {7:.75}).find(p=>p.shaderKey==='glow')!;
  expect(p.value).toBe(3); expect(p.set(1)).toBe(visual);
  const next=p.set(p.value,true), shader=next.source!.shader!;
  expect(shader.parameters.glow).toBe(3);expect(shader.modulation?.glow).toBeUndefined();expect(shader.animation?.glow).toBeUndefined();expect(shader.modulation?.speed).toEqual(DEFAULT_MODULATION);
  expect(visualSource(show,show.visuals![0])).toEqual(source);
  const restored=parseShow(serializeShow({...show,visuals:[next]}));expect(restored.visuals![0].source!.shader).toMatchObject({parameters:{glow:3}});
});
test('all effects use renderer evaluation, bounded values and stable IDs with duplicate kinds', () => {
  const show=seed(),visual={...show.visuals![0],effects:VISUAL_EFFECTS.map((e,i)=>({...newVisualEffect(e.value,`e${i}`),modulation:{...DEFAULT_MODULATION,source:'midi' as const,control:1,range:{min:e.min,max:e.max}}}))};
  for(const p of performanceParameters(show,visual,3,{}, {1:.6}).filter(p=>p.effectID)){
    const effect=visual.effects.find(e=>e.id===p.effectID)!;
    expect(p.value).toBe(effectValueAt(effect,3,3,{}, {1:.6}));
    const next=p.set(p.value,true);expect(next.effects!.find(e=>e.id===p.effectID)!.amount).toBe(p.value);
    expect(next.effects!.find(e=>e.id===p.effectID)!.modulation).toBeUndefined();
    expect(p.set(Infinity,true)).toBe(visual);
  }
});
test('motion assignments, visual locks and track locks preserve document boundaries', () => {
  const show=seed(),visual=show.visuals![0],p=performanceParameters(show,visual,0).find(p=>p.shaderKey==='glow')!;
  const moved=setPerformanceMotion(show,visual,p,{modulation:DEFAULT_MODULATION});expect(moved.source!.shader!.modulation!.glow).toEqual(DEFAULT_MODULATION);
  const locked={...visual,locked:true};expect(performanceParameters(show,locked,0)[0].set(20)).toBe(locked);expect(setPerformanceMotion(show,locked,p,{})).toBe(locked);
  const lockedShow={...show,tracks:show.tracks!.map(t=>({...t,locked:true}))};expect(performanceParameters(lockedShow,visual,0)[0].set(20)).toBe(visual);
  expect(setPerformanceMotion(lockedShow,visual,p,{})).toBe(visual);
});
test('timed visuals and shaped shader clocks agree with effect and shader keys', () => {
  const show=seed(),source=visualSource(show,show.visuals![0]);
  const keys=[{id:'a',timeS:0,value:0,interpolation:'linear' as const},{id:'b',timeS:4,value:4,interpolation:'linear' as const}];
  const visual={...show.visuals![0],continuous:false,startS:10,durationS:8,source:{...source,shader:{...source.shader!,time:{offsetS:1,loopS:0,direction:'forward' as const,frozen:false},animation:{glow:keys}}},effects:[{...newVisualEffect('zoom','zoom'),animation:keys}]};
  const p=performanceParameters(show,visual,12);expect(p.find(p=>p.shaderKey==='glow')!.value).toBe(3);expect(p.find(p=>p.effectID==='zoom')!.value).toBe(2);
});
