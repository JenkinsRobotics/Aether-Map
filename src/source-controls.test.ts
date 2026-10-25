import { expect,test } from 'vitest';
import { sourceColor,sourceColorHex } from './source-color';
import { COLOR_CHANNELS,extendedSourceParameters } from './source-controls';
import { sourceMotionAt,setSourceMotion,setSourceMotionBases,manualSourceEdit,readSourceMotion,sourceMotionIsFull,sourceParameters,type SourceMotionKey } from './source-motion';
import { DEFAULT_TEXT,emptyShow,newSurface,type Surface } from './document';
import { DEFAULT_MODULATION,DEFAULT_TRACKER,type FeatureKeyframe } from './features/types';
import { DEFAULT_CHROMA_KEY } from './media/chroma-key';
import { NATIVE_SHADER_IDS } from './features/original-shader-presets';
import { newShader,SHADERS,shaderOptions } from './features/shader-catalog';
import { normalizeDocument } from './normalize-document';
import { addSimpleVisual } from './simple-visuals';
import { serializeShow,parseShow } from './show-file';
import { visualSource } from './media-pool';
import { performanceParameters,setPerformanceMotion } from './performance/parameters';
import { sceneVisuals } from './visual-render';
import { midiAssignments } from './live/midi-assignments';
const base:Surface['source']={mediaId:null,rect:[0,0,320,180]};
const keys=(a:number,b:number):FeatureKeyframe[]=>[{id:'a',timeS:0,value:a,interpolation:'linear'},{id:'b',timeS:4,value:b,interpolation:'linear'}];
test.each(['#f00','#ff0000','#ff0000ff','rgb(255, 0, 0)','rgb(100% 0% 0% / 100%)','hsl(0 100% 50%)','hsl(1turn 100% 50%)','hsl(-360deg, 100%, 50%)','red'])('DOM-free color parser agrees for %s',value=>{
 expect(sourceColor(value)).toEqual({hueDeg:0,saturationPercent:100,brightnessPercent:100,alphaPercent:100});expect(sourceColorHex(sourceColor(value)!)).toBe('#ff0000');
});
test('alpha, short hex, achromatic colors, unit hues and invalid colors are deterministic',()=>{
 expect(sourceColor('#0f08')?.alphaPercent).toBeCloseTo(8/15*100);expect(sourceColor('rgba(0,255,0,.25)')?.alphaPercent).toBe(25);
 expect(sourceColor('transparent')?.alphaPercent).toBe(0);expect(sourceColor('hsl(200grad 100% 50%)')?.hueDeg).toBe(180);
 expect(sourceColor('hsl(3.141592653589793rad 100% 50%)')?.hueDeg).toBe(180);expect(sourceColorHex(sourceColor('#888')!)).toBe('#888888');
 for(const value of ['var(--color)','url(x)','#12345','rgb(1 2)','rgb(Infinity 0 0)','hsl(2 3 4)','hsl(1e308rad 100% 50%)','rgb(1rad 2 3)','constructor'])expect(sourceColor(value)).toBeUndefined();
});
test('HSV components apply together without losing hue at zero saturation and do not rewrite untouched colors',()=>{
 const source={...base,fill:'#ff0000'};
 const moving=setSourceMotion(setSourceMotion(source,'color:fill:hueDeg',{keys:keys(0,240)}),'color:fill:saturationPercent',{keys:keys(0,100)});
 expect(sourceMotionAt(moving,2,2).fill).toBe('#80ff80');expect(sourceMotionAt(moving,4,4).fill).toBe('#0000ff');expect(source.fill).toBe('#ff0000');
 expect(sourceMotionAt(setSourceMotion(source,'fillOpacityPercent',{keys:keys(100,0)}),2,2).fill).toBe('#ff0000');
 expect(setSourceMotionBases(source,{'color:fill:hueDeg':240,'color:fill:saturationPercent':100}).fill).toBe('#0000ff');
});
test('gradient colors keep required hex6 storage and alpha in the existing stop opacity',()=>{
 const source:Surface['source']={...base,fill:'#ffffff',fillGradient:{kind:'linear',angleDeg:0,stops:[{offset:0,color:'#ff0000',opacity:1},{offset:1,color:'#0000ff',opacity:.5}]}};
 const moving=setSourceMotion(setSourceMotion(source,'color:gradient:0:hueDeg',{keys:keys(0,240)}),'color:gradient:0:alphaPercent',{keys:keys(100,0)});
 const value=sourceMotionAt(moving,2,2);expect(value.fillGradient!.stops).toEqual([{offset:0,color:'#00ff00',opacity:.5},{offset:1,color:'#0000ff',opacity:.5}]);
 const show=addSimpleVisual(normalizeDocument(emptyShow()),value,'Gradient');expect(parseShow(serializeShow(show)).pool![0].source.fillGradient).toEqual(value.fillGradient);expect(parseShow(serializeShow(show)).version).toBe(10);
});
test('text, background, tracker, key and shader colors target their actual render fields',()=>{
 for(const [source,key,read] of [
  [{...base,text:{...DEFAULT_TEXT,color:'#ff0000'}},'color:text:hueDeg',(s:Surface['source'])=>s.text!.color],
  [{...base,text:{...DEFAULT_TEXT,background:'#ff0000'}},'color:textBackground:hueDeg',(s:Surface['source'])=>s.text!.background],
  [{...base,tracker:{...DEFAULT_TRACKER,color:'#ff0000'}},'color:tracker:hueDeg',(s:Surface['source'])=>s.tracker!.color],
  [{...base,mediaId:'image',chromaKey:{...DEFAULT_CHROMA_KEY,color:'#ff0000'}},'color:chroma:hueDeg',(s:Surface['source'])=>s.chromaKey!.color],
  [{...base,shader:{preset:'mesh-gradient',colors:['#ff0000'],parameters:{colorBack:'#ff0000'}}},'color:shader:palette:0:hueDeg',(s:Surface['source'])=>s.shader!.colors[0]],
  [{...base,shader:{preset:'mesh-gradient',colors:['#ff0000'],parameters:{colorBack:'#ff0000'}}},'color:shader:parameter:colorBack:hueDeg',(s:Surface['source'])=>s.shader!.parameters.colorBack],
 ] as [Surface['source'],SourceMotionKey,(s:Surface['source'])=>unknown][])expect(read(sourceMotionAt(setSourceMotion(source,key,{keys:keys(0,240)}),2,2))).toBe('#00ff00');
 expect(sourceParameters({...base,mediaId:'image',chromaKey:DEFAULT_CHROMA_KEY}).some(p=>p.key==='color:chroma:alphaPercent')).toBe(false);
});
test('every gallery-authored color format and choice has a valid automation binding',()=>{
 let colors=0,choices=0;
 for(const entry of SHADERS)for(let i=0;i<entry.presets.length;i++){
  const shader=newShader(entry.id,i),specs=extendedSourceParameters({...base,shader});
  shader.colors.forEach((_,index)=>{expect(specs.find(p=>p.key===`color:shader:palette:${index}:hueDeg`),entry.id).toBeTruthy();expect(specs.some(p=>p.key===`color:shader:palette:${index}:alphaPercent`)).toBe(!NATIVE_SHADER_IDS.has(entry.id));colors++;});
  for(const [key,value] of Object.entries(shader.parameters)){
   if(shaderOptions(entry.id,key)||typeof value==='boolean'){expect(specs.find(p=>p.key===`choice:shader:${key}`),`${entry.id}.${key}=${value}`).toBeTruthy();choices++;}
   else if(typeof value==='string'){expect(specs.find(p=>p.key===`color:shader:parameter:${key}:hueDeg`),`${entry.id}.${key}=${value}`).toBeTruthy();colors++;}
  }
 }
 expect(colors).toBeGreaterThan(200);expect(choices).toBeGreaterThan(20);
});
test('choice keys hold at boundaries, modulation quantizes into real named options and media defaults match rendering',()=>{
 const source={...base,text:DEFAULT_TEXT};const moving=setSourceMotion(source,'choice:textAlign',{keys:keys(0,2)});
 expect(moving.motion!.animation!['choice:textAlign']!.every(k=>k.interpolation==='hold')).toBe(true);
 expect(sourceMotionAt(moving,3.999,99).text!.align).toBe('left');expect(sourceMotionAt(moving,4,99).text!.align).toBe('right');
 const live=setSourceMotion(source,'choice:textAlign',{modulation:{...DEFAULT_MODULATION,source:'midi',control:7,range:{min:0,max:3}}});
 expect([0,.2,.5,1].map(v=>sourceMotionAt(live,0,0,{controls:{7:v}}).text!.align)).toEqual(['left','center','right','justify']);
 expect(sourceParameters({...base,mediaId:'image'}).find(p=>p.key==='choice:fit')?.base).toBe(2);
 const shader=newShader('dithering'),spec=sourceParameters({...base,shader}).find(p=>p.key==='choice:shader:shape')!;
 expect(sourceMotionAt(setSourceMotion({...base,shader},spec.key,{keys:keys(1,1)}),0,0).shader!.parameters.shape).toBe(shaderOptions('dithering','shape')![1]);
});
test('all supported source choices write real properties without changing unrelated source state',()=>{
 const cases:[Surface['source'],string,number,Record<string,unknown>][]=[
  [{...base,text:DEFAULT_TEXT},'choice:textItalic',1,{text:{italic:true}}],
  [{...base,webcam:DEFAULT_TRACKER},'choice:cameraMirror',0,{webcam:{mirror:false}}],
  [{...base,tracker:DEFAULT_TRACKER},'choice:cameraFlip',1,{tracker:{flipY:true}}],
  [{...base,tracker:DEFAULT_TRACKER},'choice:trackerStyle',2,{tracker:{style:'wire'}}],
  [{...base,tracker:DEFAULT_TRACKER},'choice:trackerHand',2,{tracker:{hand:'right'}}],
  [{...base,testPattern:'grid'},'choice:testPattern',1,{testPattern:'bars'}],
  [{...base,drawing:{strokes:[],replay:{durationS:2,loop:false}}},'choice:drawingLoop',1,{drawing:{replay:{loop:true}}}],
  [{...base,fillGradient:{kind:'linear',angleDeg:90,stops:[]}},'choice:gradientKind',1,{fillGradient:{kind:'radial',angleDeg:90}}],
  [{...base,mediaId:'image'},'choice:fit',1,{fit:'cover'}],
  [{...base,shader:{preset:'test',colors:[],parameters:{enabled:true}}},'choice:shader:enabled',0,{shader:{parameters:{enabled:false}}}],
 ];
 for(const [source,key,value,expected] of cases){const before=structuredClone(source);expect(sourceMotionAt({...source,motion:readSourceMotion({animation:{[key]:keys(value,value)}})},2,2)).toMatchObject(expected);expect(source).toEqual(before);}
});
test('colors use common live signals and source-time curves with shared scene-time LFO',()=>{
 for(const [assignment,inputs] of [[{source:'audio'},{levels:{level:.5}}],[{source:'midi',control:7},{controls:{7:.5}}],[{source:'body',bodySignal:'spread'},{levels:{'body:spread':.5}}]] as const){
  const moving=setSourceMotion({...base,fill:'#ff0000'},'color:fill:hueDeg',{modulation:{...DEFAULT_MODULATION,...assignment,range:{min:0,max:240}}});
  expect(sourceMotionAt(moving,100,100,inputs).fill).toBe('#00ff00');expect(sourceMotionAt(moving,100,100).fill).toBe('#ff0000');
 }
 const moving=setSourceMotion({...base,fill:'#ff0000'},'color:fill:hueDeg',{modulation:{...DEFAULT_MODULATION,source:'time',clock:'scene',periodS:4,range:{min:0,max:240}}});expect(sourceMotionAt(moving,2,1).fill).toBe('#0000ff');
});
test('manual color edits clear the touched color binding only, channel takeover stays selective and locks hold',()=>{
 let source:Surface['source']={...base,text:{...DEFAULT_TEXT,color:'#ff0000'}};
 for(const ch of COLOR_CHANNELS)source=setSourceMotion(source,`color:text:${ch.key}`,{keys:keys(0,100)});
 source=setSourceMotion(source,'color:textBackground:alphaPercent',{keys:keys(0,100)});
 const manual=manualSourceEdit(source,{...source,text:{...source.text!,color:'#00ff00'}});expect(Object.keys(manual.motion!.animation!)).toEqual(['color:textBackground:alphaPercent']);
 let show=addSimpleVisual(normalizeDocument(emptyShow()),source,'Title');const v=show.visuals![0],p=performanceParameters(show,v,2).find(p=>p.sourceKey==='color:text:hueDeg')!;
 expect(p.set(10)).toBe(v);expect(p.set(10,true).source!.motion!.animation!['color:text:hueDeg']).toBeUndefined();expect(p.set(10,true).source!.motion!.animation!['color:text:saturationPercent']).toBeTruthy();
 show={...show,tracks:show.tracks!.map(t=>({...t,locked:true}))};const locked=performanceParameters(show,v,2).find(p=>p.sourceKey==='color:text:hueDeg')!;expect(locked.set(10,true)).toBe(v);expect(setPerformanceMotion(show,v,p,{keys:[]})).toBe(v);
});
test('format10 survives pool, explicit and legacy sources, while numeric-only format9 and plain shows stay compatible',()=>{
 const source=setSourceMotion({...base,fill:'#ff0000'},'color:fill:hueDeg',{keys:keys(0,240)});
 const show=addSimpleVisual(normalizeDocument(emptyShow()),source,'Color'),reopened=parseShow(serializeShow(show));expect(reopened.version).toBe(10);expect(visualSource(reopened,reopened.visuals![0]).motion).toEqual(source.motion);
 expect(sceneVisuals(reopened,reopened.scenes[0],2)[0].source.fill).toBe('#00ff00');
 const legacy=emptyShow();legacy.unassignedSurfaces=[{...newSurface(legacy.output,0),source}];expect(parseShow(serializeShow(legacy)).version).toBe(10);
 legacy.unassignedSurfaces=[{...newSurface(legacy.output,0),clips:[{id:'c',source,startS:0,durationS:4,inS:0,loop:false}]}];expect(parseShow(serializeShow(legacy)).unassignedSurfaces[0].clips[0].source!.motion).toEqual(source.motion);
 expect(parseShow(serializeShow(addSimpleVisual(normalizeDocument(emptyShow()),setSourceMotion({...base,fill:'#fff'},'fillOpacityPercent',{keys:keys(0,100)}),'Old'))).version).toBe(9);
 expect(()=>parseShow(JSON.stringify({...show,version:14}))).toThrow('Unsupported');
});
test('malformed or oversized assignments stay bounded and MIDI discovery includes new channels',()=>{
 const motion=readSourceMotion({animation:{'color:fill:hueDeg':keys(-10,400),'choice:textAlign':keys(.2,2.8),'color:shader:parameter:constructor:hueDeg':keys(0,1),'color:gradient:16:hueDeg':keys(0,1)},modulation:{'color:fill:alphaPercent':{...DEFAULT_MODULATION,source:'midi',control:5,range:{min:-5,max:120}}}})!;
 expect(motion.animation!['color:fill:hueDeg']!.map(k=>k.value)).toEqual([0,360]);expect(motion.animation!['choice:textAlign']!.map(k=>[k.value,k.interpolation])).toEqual([[0,'hold'],[3,'hold']]);expect(Object.keys(motion.animation!)).toHaveLength(2);expect(motion.modulation!['color:fill:alphaPercent']!.range).toEqual({min:0,max:100});
 const show=addSimpleVisual(normalizeDocument(emptyShow()),{...base,fill:'#ff0000',motion},'Live');expect(midiAssignments(show,show.visuals![0].id)).toEqual({assigned:[5],focused:[5]});
 const oversized=readSourceMotion({animation:Object.fromEntries(Array.from({length:300},(_,i)=>[`color:shader:parameter:c${i}:hueDeg`,keys(0,1)]))});expect(Object.keys(oversized!.animation!)).toHaveLength(256);
 const full={...base,fill:'#ff0000',motion:oversized};expect(sourceMotionIsFull(full,'color:fill:hueDeg')).toBe(true);expect(setSourceMotion(full,'color:fill:hueDeg',{keys:keys(0,100)})).toBe(full);expect(sourceMotionIsFull(full,'color:shader:parameter:c0:hueDeg')).toBe(false);
});
test('shader color/choice keys honor freeze, offset, loop and reverse; Performance edits that same clock',()=>{
 const baseShader={preset:'mesh-gradient',colors:['#ff0000'],parameters:{enabled:true},time:{offsetS:1,loopS:0,direction:'forward' as const,frozen:true}};
 const moving=setSourceMotion(setSourceMotion({...base,shader:baseShader},'color:shader:palette:0:hueDeg',{keys:keys(0,240)}),'choice:shader:enabled',{keys:keys(0,1)});
 expect(sourceMotionAt(moving,20,20).shader!.colors[0]).toBe('#ffff00');expect(sourceMotionAt(moving,20,20).shader!.parameters.enabled).toBe(false);
 const show=addSimpleVisual(normalizeDocument(emptyShow()),moving,'Shader');expect(performanceParameters(show,show.visuals![0],20).find(p=>p.sourceKey==='color:shader:palette:0:hueDeg')!.timeS).toBe(1);
 const reverse={...moving,shader:{...moving.shader!,time:{offsetS:0,loopS:4,direction:'reverse' as const,frozen:false}}};expect(sourceMotionAt(reverse,1,1).shader!.colors[0]).toBe('#00ffff');
 const scene=setSourceMotion(moving,'color:shader:palette:0:hueDeg',{modulation:{...DEFAULT_MODULATION,source:'time',clock:'scene',periodS:4,range:{min:0,max:240}}});expect(sourceMotionAt(scene,20,1).shader!.colors[0]).toBe('#0000ff');
});
