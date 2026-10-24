import { expect, test } from 'vitest';
import { DEFAULT_LFOS, DEFAULT_MODULATION, type FeatureKeyframe } from './types';
import { readParameterAnimation, readParameterKeys } from './parameter-animation';
import { shaderAt } from './shader-motion';
import { effectValueAt } from './effect-motion';
import { newShader } from './shader-catalog';
import { readGeneratedSources } from './read-features';
import { recallShaderLook, storeShaderLook, randomShaderLook } from './shader-looks';

const keys: FeatureKeyframe[] = [{id:'a',timeS:0,value:0,interpolation:'linear'},{id:'b',timeS:4,value:100,interpolation:'linear'}];
test('effect curves scrub deterministically, clamp to domain, and do not alter authored values', () => {
  const effect = {id:'blur',kind:'blur' as const,amount:25,enabled:true,animation:keys};
  expect([0,2,4,1,10].map(t=>effectValueAt(effect,t))).toEqual([0,50,100,25,100]);
  expect(effect.amount).toBe(25); expect(effect.animation).toBe(keys);
  expect(effectValueAt({...effect,animation:[{...keys[0],interpolation:'hold'},keys[1]]},3)).toBe(0);
  expect(effectValueAt({...effect,animation:[{...keys[0],interpolation:'smooth'},keys[1]]},1)).toBe(15.625);
  expect(effectValueAt({...effect,kind:'tile'},.22)).toBe(6);
  expect(effectValueAt({...effect,kind:'tile'},4)).toBe(8);
});
test('local curves precede additive motion; LFOs and explicit scene cycles use the show clock', () => {
  const effect={id:'x',kind:'blur' as const,amount:20,enabled:true,animation:keys,modulation:{...DEFAULT_MODULATION,source:'time' as const,amount:10,periodS:4}};
  expect(effectValueAt(effect,1,3)).toBeCloseTo(35);
  expect(effectValueAt({...effect,modulation:{...effect.modulation,clock:'scene'}},1,3)).toBeCloseTo(15);
  expect(effectValueAt({...effect,modulation:{...effect.modulation,source:'lfo',lfoIndex:0}},1,3,undefined,undefined,[{...DEFAULT_LFOS[0],periodS:4},...DEFAULT_LFOS.slice(1)])).toBeCloseTo(15);
});
test('audio/MIDI ranges, flip and silence resolve to bounded actual effect amounts', () => {
  const effect={id:'x',kind:'zoom' as const,amount:20,enabled:true,animation:keys,modulation:{...DEFAULT_MODULATION,source:'audio' as const,band:'low' as const,range:{min:0,max:100}}};
  expect(effectValueAt(effect,2,0,{low:.75})).toBe(75);
  expect(effectValueAt({...effect,modulation:{...effect.modulation,invert:true}},2,0,{low:.75})).toBe(25);
  expect(effectValueAt(effect,2)).toBe(0);
  expect(effectValueAt({...effect,modulation:{...effect.modulation,source:'midi',control:7}},2,0,undefined,{7:.4})).toBe(40);
});
test('shader lanes evaluate only existing numeric parameters and persist inside presets', () => {
  const shader={...newShader('tunnel'),parameters:{scale:2,speed:1,color:'#fff'},animation:{scale:keys,color:keys,missing:keys},modulation:{scale:{...DEFAULT_MODULATION,source:'time' as const,amount:5,periodS:4}}};
  const evaluated=shaderAt(shader,1);
  expect(evaluated.parameters).toEqual({scale:30,speed:1,color:'#fff'});
  expect(shader.parameters.scale).toBe(2);
  const stored=storeShaderLook(shader,'A');
  const read=readGeneratedSources({shader:randomShaderLook(stored,()=>.5)}).shader!;
  expect(read.animation).toEqual(shader.animation);
  expect(recallShaderLook(read,'A').animation).toEqual(shader.animation);
});
test('file recovery bounds motion and deterministically merges duplicate IDs/times', () => {
  const read=readParameterKeys([{...keys[1],id:'same',value:200},{...keys[0],timeS:-4},{...keys[1],id:'same',timeS:2,value:50},{timeS:3,value:NaN},{timeS:Infinity,value:4},{timeS:900000,value:-4}],0,100);
  expect(read.map(k=>[k.timeS,k.value])).toEqual([[0,0],[2,50],[604800,0]]);
  const raw=JSON.parse('{"__proto__":[],"constructor":[],"scale":[{"timeS":1,"value":2}]}');
  expect(Object.keys(readParameterAnimation(raw))).toEqual(['scale']);
  expect(readParameterKeys(Array.from({length:1010},(_,i)=>({timeS:i,value:i})))).toHaveLength(1000);
});
