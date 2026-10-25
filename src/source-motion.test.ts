import { expect,test } from 'vitest';
import { DEFAULT_TEXT,emptyShow,newSurface,type Surface } from './document';
import { DEFAULT_MODULATION,DEFAULT_TRACKER,type FeatureKeyframe } from './features/types';
import { DEFAULT_CHROMA_KEY } from './media/chroma-key';
import { SOURCE_MOTION_PARAMETERS,sourceParameters,sourceMotionAt,setSourceMotion,setSourceMotionBases,manualSourceEdit,readSourceMotion } from './source-motion';
import { addSimpleVisual } from './simple-visuals';
import { normalizeDocument } from './normalize-document';
import { visualSource } from './media-pool';
import { sceneVisuals } from './visual-render';
import { sourcePictureStyle } from './source-picture';
import { createTimeline,currentTimelineID,placeTimeline,scheduledVisuals } from './timelines';
import { parseShow,serializeShow } from './show-file';
import { performanceParameters,setPerformanceMotion } from './performance/parameters';
import { midiAssignments } from './live/midi-assignments';
const keys=(a:number,b:number):FeatureKeyframe[]=>[{id:'a',timeS:0,value:a,interpolation:'linear'},{id:'b',timeS:4,value:b,interpolation:'linear'}];
const base:Surface['source']={mediaId:null,rect:[0,0,320,180]};
const media={id:'image',name:'Image',file:'image.png',kind:'image' as const,width:320,height:180,bytes:10};
const seed=(source:Surface['source']=base)=>addSimpleVisual(normalizeDocument(emptyShow()),source,'Visual');
const numeric=(source:Surface['source'],m?:typeof media)=>sourceParameters(source,m).filter(p=>SOURCE_MOTION_PARAMETERS.some(s=>s.key===p.key));
test('only effective numeric source controls appear, with renderer precedence and media limits',()=>{
 expect(numeric({...base,text:DEFAULT_TEXT,fill:'#fff'}).map(p=>p.key)).toEqual(['textSizePx','textLineHeight','textLetterSpacingPx']);
 expect(numeric({...base,fill:'#fff',fillGradient:{kind:'radial',angleDeg:0,stops:[]}}).map(p=>p.key)).toEqual(['fillOpacityPercent']);
 expect(numeric({...base,tracker:DEFAULT_TRACKER,text:DEFAULT_TEXT}).map(p=>p.key)).toEqual(['trackerScale']);
 expect(numeric({...base,webcam:DEFAULT_TRACKER,text:DEFAULT_TEXT})).toEqual([]);
 expect(numeric({...base,drawing:{strokes:[]}})).toEqual([]);
 expect(numeric({...base,mediaId:media.id,chromaKey:DEFAULT_CHROMA_KEY},media).map(p=>[p.key,p.max])).toEqual([
  ['cropLeftPx',319],['cropTopPx',179],['cropWidthPx',320],['cropHeightPx',180],['keySimilarityPercent',100],['keySoftnessPercent',100],['keySpillPercent',100],
 ]);
});
test('all non-media source numeric channels produce actual source properties without mutating bases',()=>{
 const cases:[Surface['source'],string,number,Record<string,unknown>][]=[
  [{...base,text:DEFAULT_TEXT},'textSizePx',120,{text:{sizePx:120}}],
  [{...base,text:DEFAULT_TEXT},'textLineHeight',2,{text:{lineHeight:2}}],
  [{...base,text:DEFAULT_TEXT},'textLetterSpacingPx',-4,{text:{letterSpacingPx:-4}}],
  [{...base,fill:'#fff'},'fillOpacityPercent',40,{fillOpacity:.4}],
  [{...base,fillGradient:{kind:'linear',angleDeg:0,stops:[]}},'gradientAngleDeg',90,{fillGradient:{angleDeg:90}}],
  [{...base,tracker:DEFAULT_TRACKER},'trackerScale',2,{tracker:{scale:2}}],
  [{...base,drawing:{strokes:[],replay:{durationS:10,loop:true}}},'drawingDurationS',3,{drawing:{replay:{durationS:3,loop:true}}}],
 ];
 for(const [source,key,value,result] of cases){const before=structuredClone(source),moving={...source,motion:readSourceMotion({animation:{[key]:keys(value,value)}})};expect(sourceMotionAt(moving,2,2)).toMatchObject(result);expect(source).toEqual(before);}
});
test('media crop clamps jointly, is order independent and drives the real warp; key amounts remain normalized',()=>{
 const source:Surface['source']={...base,mediaId:media.id,chromaKey:DEFAULT_CHROMA_KEY,motion:{animation:{cropLeftPx:keys(0,300),cropTopPx:keys(0,100),cropWidthPx:keys(320,300),cropHeightPx:keys(180,100),keySimilarityPercent:keys(0,100),keySoftnessPercent:keys(0,100),keySpillPercent:keys(0,100)}}};
 const value=sourceMotionAt(source,4,4,{},undefined,media);expect(value.rect).toEqual([300,100,20,80]);expect(value.chromaKey).toMatchObject({similarity:1,softness:1,spill:1});expect(source.rect).toEqual([0,0,320,180]);
 const surface={...newSurface({width:320,height:180},0),source:value};expect(sourcePictureStyle(surface,media).clipPath).toBe('inset(100px 0px 0px 300px round 0px)');
 expect(setSourceMotionBases(source,{cropLeftPx:0,cropWidthPx:200},media).rect).toEqual(setSourceMotionBases(source,{cropWidthPx:200,cropLeftPx:0},media).rect);
 const live=setSourceMotion(source,'cropLeftPx',{modulation:{...DEFAULT_MODULATION,source:'midi',control:7,range:{min:0,max:319}}});
 expect(sourceMotionAt(live,0,0,{controls:{7:1}},undefined,media).rect).toEqual([319,0,1,180]);
});
test('time, LFO, audio, MIDI and body assignments share range/Flip and leave authored data intact',()=>{
 const source={...base,fill:'#fff'},m={...DEFAULT_MODULATION,range:{min:0,max:100}};
 expect(sourceMotionAt(setSourceMotion(source,'fillOpacityPercent',{modulation:m}),1,10).fillOpacity).toBe(1);
 expect(sourceMotionAt(setSourceMotion(source,'fillOpacityPercent',{modulation:{...m,source:'lfo'}}),3,1).fillOpacity).toBe(1);
 for(const [assignment,inputs] of [
  [{source:'audio'}, {levels:{level:.25}}], [{source:'midi',control:2},{controls:{2:.25}}], [{source:'body',bodySignal:'spread'},{levels:{'body:spread':.25}}],
 ] as const){const moving=setSourceMotion(source,'fillOpacityPercent',{modulation:{...m,...assignment}});expect(sourceMotionAt(moving,2,10,inputs).fillOpacity).toBe(.25);expect(sourceMotionAt(moving,2,10).fillOpacity).toBe(0);expect(sourceMotionAt(setSourceMotion(source,'fillOpacityPercent',{modulation:{...m,...assignment,invert:true}}),2,10,inputs).fillOpacity).toBe(.75);}
 expect(source).toEqual({...base,fill:'#fff'});
 const keyed=setSourceMotion({...base,mediaId:media.id,chromaKey:DEFAULT_CHROMA_KEY},'keySimilarityPercent',{keys:keys(20,80)});
 const disabled=manualSourceEdit(keyed,{...keyed,chromaKey:{...keyed.chromaKey!,enabled:false}});expect(disabled.motion).toEqual(keyed.motion);expect(sourceMotionAt(disabled,2,2).chromaKey!.similarity).toBe(.2);
 expect(sourceMotionAt({...disabled,chromaKey:{...disabled.chromaKey!,enabled:true}},2,2).chromaKey!.similarity).toBe(.5);
});
test('nested uses sample their own trimmed source clocks and a shared scene clock exactly once',()=>{
 let show=createTimeline(normalizeDocument(emptyShow()),'Child');const child=currentTimelineID(show);
 show=addSimpleVisual(show,{...base,text:DEFAULT_TEXT,motion:{animation:{textSizePx:keys(20,100)},modulation:{textLetterSpacingPx:{...DEFAULT_MODULATION,source:'time',clock:'scene',periodS:8,range:{min:0,max:10}}}}},'Nested');
 const id=show.visuals!.at(-1)!.id;show={...show,activeTimelineID:undefined};const track=show.tracks!.find(t=>!t.timelineID&&t.kind==='video')!.id;
 show=placeTimeline(show,child,track,8);const first=show.visuals!.at(-1)!.id;show=placeTimeline(show,child,track,9);show.visuals=show.visuals!.map(v=>v.id===first?{...v,inS:1}:v);
 const uses=scheduledVisuals(show,10).filter(v=>v.visual.id.endsWith(id));expect(uses.map(v=>v.visual.source!.text!.sizePx)).toEqual([80,40]);expect(uses.map(v=>v.visual.source!.text!.letterSpacingPx)).toEqual([10,10]);
 const pictures=sceneVisuals(show,show.scenes[0],10);expect(pictures.map(p=>p.source.text!.sizePx)).toEqual([80,40]);expect(show.pool![0].source.text!.sizePx).toBe(96);
});
test('pool, explicit and legacy assignments survive format9 and ordinary source replacement stays separate',()=>{
 const source=setSourceMotion({...base,text:DEFAULT_TEXT},'textSizePx',{keys:keys(20,100)}),show=seed(source);
 const old=seed({...base,text:DEFAULT_TEXT});expect(parseShow(serializeShow(old)).version).toBe(old.version);
 const reopened=normalizeDocument(parseShow(serializeShow(show)));expect(reopened.version).toBe(9);expect(visualSource(reopened,reopened.visuals![0]).motion).toEqual(source.motion);
 const legacy=emptyShow(),surface=newSurface(legacy.output,0);legacy.unassignedSurfaces=[{...surface,source}];expect(parseShow(serializeShow(legacy)).version).toBe(9);
 legacy.unassignedSurfaces=[{...surface,clips:[{id:'clip',source,startS:0,durationS:10,inS:0,loop:false}]}];expect(parseShow(serializeShow(legacy)).unassignedSurfaces[0].clips[0].source!.motion).toEqual(source.motion);
 expect(()=>parseShow(JSON.stringify({...show,version:14}))).toThrow('Unsupported');
 const malformed=readSourceMotion({animation:{textSizePx:keys(-20,1e8),constructor:keys(1,2)},modulation:{trackerScale:{...DEFAULT_MODULATION,range:{min:-4,max:99}}}})!;expect(malformed.animation!.textSizePx!.map(k=>k.value)).toEqual([1,10000]);expect(Object.keys(malformed.animation!)).toEqual(['textSizePx']);expect(malformed.modulation!.trackerScale!.range).toEqual({min:.1,max:5});
});
test('Performance manual takeover, ordinary source edits and MIDI feedback use canonical assignments',()=>{
 let show=seed({...base,text:DEFAULT_TEXT,motion:{animation:{textSizePx:keys(20,100)},modulation:{textLineHeight:{...DEFAULT_MODULATION,source:'midi',control:17,range:{min:1,max:3}}}}});
 const v=show.visuals![0],p=performanceParameters(show,v,2).find(p=>p.sourceKey==='textSizePx')!;expect(p.value).toBe(60);expect(p.set(45)).toBe(v);
 const manual=p.set(p.value,true);expect(manual.source!.text!.sizePx).toBe(60);expect(manual.source!.motion?.animation).toBeUndefined();expect(manual.source!.motion!.modulation!.textLineHeight!.control).toBe(17);
 expect(midiAssignments(show,v.id)).toEqual({assigned:[17],focused:[17]});
 const source=visualSource(show,v);expect(manualSourceEdit(source,{...source,text:{...source.text!,sizePx:55}}).motion?.animation).toBeUndefined();expect(source.motion!.animation!.textSizePx).toHaveLength(2);
 show={...show,tracks:show.tracks!.map(t=>({...t,locked:true}))};const locked=performanceParameters(show,v,2).find(p=>p.sourceKey==='textSizePx')!;expect(locked.set(20,true)).toBe(v);expect(setPerformanceMotion(show,v,locked,{keys:[]})).toBe(v);
});
