import { expect,test } from 'vitest';
import { parameterModulation } from '../ai/parameter-motion';
import { newVisual } from '../visual-document';
import { emptyShow } from '../document';
import { parseShow,serializeShow } from '../show-file';
import { newFeature } from '../features/new-feature';
import { DEFAULT_MODULATION, type ShaderSource } from '../features/types';
import { effectValueAt } from '../features/effect-motion';
import { shaderAt } from '../features/shader-motion';
const modulation={...DEFAULT_MODULATION,source:'body' as const,bodySignal:'leftHand' as const,periodS:0,range:{min:2,max:6}};
test('body measurements drive bounded shader/effect values independent of clocks, with explicit loss and flip',()=>{
 const shader:ShaderSource={preset:'test',colors:[],parameters:{scale:99},modulation:{scale:modulation}};
 expect(shaderAt(shader,80,{'body:leftHand':.25}).parameters.scale).toBe(3);
 expect(shaderAt(shader,0,{'body:leftHand':.25,level:1}).parameters.scale).toBe(3);
 expect(shaderAt(shader,0).parameters.scale).toBe(2);
 expect(shaderAt(shader,0,{'body:leftHand':Infinity}).parameters.scale).toBe(2);
 expect(shaderAt({...shader,modulation:{scale:{...modulation,invert:true}}},0,{'body:leftHand':.25}).parameters.scale).toBe(5);
 const effect={id:'test',kind:'zoom' as const,amount:99,enabled:true,modulation:{...modulation,range:{min:0,max:100}}};
 expect(effectValueAt(effect,0,900,{'body:leftHand':.6})).toBe(60);expect(effectValueAt(effect,900)).toBe(0);
 expect(shader.parameters.scale).toBe(99);
});
test('body assignments survive file recovery for source and post-effect without storing a camera preference',()=>{
 const show=emptyShow(),surface=newFeature('shader',show.output,0);
 surface.source.shader={...surface.source.shader!,modulation:{scale:modulation}};
 const visual=newVisual(show,surface.source,[{sceneID:show.activeSceneId}]);
 visual.effects=[{id:'test',kind:'zoom',amount:50,enabled:true,modulation}];show.visuals=[visual];show.scenes[0].surfaces=[surface];
 const source=parseShow(serializeShow(show)).scenes[0].surfaces[0].source;
 expect(source.shader?.modulation?.scale).toMatchObject(modulation);expect(parseShow(serializeShow(show)).visuals?.[0].effects?.[0].modulation).toMatchObject(modulation);
 expect(new TextDecoder().decode(serializeShow(show))).not.toContain('deviceId');
});
test('agent authoring accepts named body signals and rejects malformed assignments',()=>{
 expect(parameterModulation({source:'body',bodySignal:'spread',range:{min:1,max:3}})).toMatchObject({source:'body',bodySignal:'spread',range:{min:1,max:3}});
 expect(()=>parameterModulation({source:'body',bodySignal:'head'})).toThrow('Invalid modulation bodySignal');
 expect(()=>parameterModulation({source:'body',deviceId:'camera'})).toThrow();
 expect(()=>parameterModulation({source:'body',range:{min:4,max:2}})).toThrow();
});
