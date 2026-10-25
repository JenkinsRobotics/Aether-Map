import { expect,test } from 'vitest';
import { DEFAULT_TEXT,emptyShow,type Surface } from './document';
import { normalizeDocument } from './normalize-document';
import { addSimpleVisual,visualIsLocked } from './simple-visuals';
import { visualSource,removePoolAsset } from './media-pool';
import { storeVisualLook,recallVisualLook,clearVisualLook,randomVisualLook,hasVisualLook,VISUAL_LOOK_SLOTS } from './visual-looks';
import { parseShow,serializeShow } from './show-file';
import { mediaUsage,removeUnusedMedia } from './media-usage';
import { sceneVisuals } from './visual-render';
import { newShader,SHADERS } from './features/shader-catalog';
import { storeShaderLook } from './features/shader-looks';
import { DEFAULT_MODULATION,DEFAULT_TRACKER } from './features/types';
import { DEFAULT_CHROMA_KEY } from './media/chroma-key';
import { projectExport } from './automation/project-export';
const base:Surface['source']={mediaId:null,rect:[0,0,320,180]};
const key=[{id:'k',timeS:0,value:120,interpolation:'hold' as const}];
const seed=(source:Surface['source']={...base,text:{...DEFAULT_TEXT,text:'Title',color:'#ff0000'}})=>addSimpleVisual(normalizeDocument(emptyShow()),source,'Title');
function rich(){const show=seed(),v=show.visuals![0];v.source={...visualSource(show,v),motion:{animation:{'color:text:hueDeg':key}}};v.opacity=.4;v.mapping='span';v.placement={xPercent:10,yPercent:5,widthPercent:120,heightPercent:80,rotationDeg:15};v.motion={animation:{opacityPercent:[{...key[0],value:60}]}};v.effects=[{id:'blur',kind:'blur',amount:20,enabled:true,animation:[{...key[0],value:40}],modulation:{...DEFAULT_MODULATION,source:'midi',control:7}}];return show;}
test('full snapshots retain source/effect/visual motion and authored values without aliasing',()=>{
 const show=rich(),v=show.visuals![0],before=structuredClone(v),a=storeVisualLook(show,v,'A');
 expect(a.looks!.A).toMatchObject({source:v.source,opacity:.4,mapping:'span',placement:v.placement,motion:v.motion,effects:v.effects});expect(v).toEqual(before);
 const modified={...a,source:{...base,fill:'#0000ff'},opacity:.9,mapping:'repeat' as const,placement:undefined,motion:undefined,effects:[]};
 const restored=recallVisualLook(show,modified,'A');expect(restored.source).toEqual(v.source);expect(restored.opacity).toBe(.4);expect(restored.effects).toEqual(v.effects);expect(restored.motion).toEqual(v.motion);expect(restored.placement).toEqual(v.placement);
 restored.source!.text!.color='#ffffff';restored.effects![0].amount=1;expect(a.looks!.A!.source.text!.color).toBe('#ff0000');expect(a.looks!.A!.effects![0].amount).toBe(20);
 expect(a.looks!.A).not.toHaveProperty('looks');expect(a.looks!.A).not.toHaveProperty('targets');expect(a.looks!.A).not.toHaveProperty('startS');
});
test('recall and cross-visual reuse preserve clip identity, timing, assignments, visibility and compositing order',()=>{
 const show=rich(),a=storeVisualLook(show,show.visuals![0],'A');show.visuals=[a];const other=addSimpleVisual(show,{...base,fill:'#123456'},'Other'),target={...other.visuals![1],enabled:false,startS:8,durationS:6,inS:2,loop:false,continuous:false,legacyTrack:'legacy',color:'#123456'};
 const next=recallVisualLook(other,target,'A',a);
 for(const field of ['id','assetID','name','trackID','enabled','startS','durationS','inS','loop','continuous','legacyTrack','color','targets'] as const)expect(next[field],field).toEqual(target[field]);
 expect(next.source).toEqual(a.looks!.A!.source);expect(next.looks).toEqual({});expect(other.visuals![0].source).toEqual(show.visuals![0].source);
});
test('A/B/C are independently stored, cleared, serialized and evaluated through format11',()=>{
 const show=rich();let v=show.visuals![0];for(const [i,slot] of VISUAL_LOOK_SLOTS.entries())v=storeVisualLook(show,{...v,opacity:.2+i*.2},slot);show.visuals=[v];
 const saved=parseShow(serializeShow(show));expect(saved.version).toBe(11);expect(saved.visuals![0].looks).toEqual(JSON.parse(JSON.stringify(v.looks)));
 const recalled=recallVisualLook(saved,saved.visuals![0],'B');expect(recalled.opacity).toBe(.4);
 const rendered=sceneVisuals({...saved,visuals:[recalled]},saved.scenes[0],2)[0];expect(rendered.source.text!.color).toBe('#00ff00');expect(rendered.opacity).toBe(.6);
 const cleared=clearVisualLook(saved,recalled,'B');expect(hasVisualLook(saved,cleared,'B')).toBe(false);expect(cleared.looks!.A).toEqual(v.looks!.A);expect(parseShow(serializeShow({...saved,visuals:[cleared]})).version).toBe(11);
 expect(()=>parseShow(JSON.stringify({...saved,version:14}))).toThrow('Unsupported');expect(parseShow(serializeShow(seed())).version).toBe(6);
});
test('older shader presets keep shader-only semantics and survive changing to another source type',()=>{
 let shader=storeShaderLook(newShader('tunnel'),'A');shader=storeShaderLook({...shader,parameters:{...shader.parameters,scale:2}},'B');shader.parameters.scale=5;
 const show=seed({...base,shader});const v={...show.visuals![0],opacity:.3,effects:[{id:'b',kind:'blur' as const,amount:30,enabled:true}]};
 const old=recallVisualLook(show,v,'A');expect(old.opacity).toBe(.3);expect(old.effects).toEqual(v.effects);expect(old.source!.shader!.parameters.scale).toBe(shader.looks!.A!.parameters.scale);expect(old.looks!.A!.shaderOnly).toBe(true);
 const other=addSimpleVisual({...show,visuals:[old]},{...base,fill:'#00ff00'},'Fill'),fill=storeVisualLook(other,other.visuals![1],'C');
 const green=recallVisualLook(other,old,'C',fill);expect(green.source!.fill).toBe('#00ff00');expect(hasVisualLook(other,green,'B')).toBe(true);
 const back=recallVisualLook(other,green,'B');expect(back.source!.shader!.parameters.scale).toBe(2);expect(back.opacity).toBe(green.opacity);
 const stored=storeVisualLook(show,old,'C');for(const entry of Object.values(stored.looks!))expect(entry!.source.shader).not.toHaveProperty('looks');
 const clear=clearVisualLook(show,stored,'A');expect(hasVisualLook(show,clear,'A')).toBe(false);expect(hasVisualLook(show,clear,'B')).toBe(true);
 const reopened=parseShow(serializeShow({...show,visuals:[clear]}));expect(hasVisualLook(reopened,reopened.visuals![0],'A')).toBe(false);expect(reopened.visuals![0].looks!.B!.shaderOnly).toBe(true);
});
test('media retained only in a stored look cannot be deleted through either cleanup path',()=>{
 const show=seed();show.media=[{id:'photo',file:'photo.png',name:'Photo',kind:'image',width:320,height:180,bytes:100}];
 const ready=normalizeDocument(show);let v=storeVisualLook(ready,{...ready.visuals![0],source:{...base,mediaId:'photo'}},'A');v={...v,source:{...base,fill:'#ff0000'}};
 const withLook={...ready,visuals:[v],pool:ready.pool!.filter(a=>a.source.mediaId!=='photo')};expect(mediaUsage(withLook,'photo')).toBe(1);expect(removeUnusedMedia(withLook,'photo')).toBe(withLook);
 const pool=ready.pool!.find(a=>a.source.mediaId==='photo')!;const pooled={...withLook,pool:[...withLook.pool!,pool]};expect(removePoolAsset(pooled,pool.id)).toBe(pooled);
 const restored=recallVisualLook(withLook,v,'A');expect(restored.source!.mediaId).toBe('photo');
 const portable=serializeShow(withLook),reopened=parseShow(portable);expect(projectExport({name:'Presets.aethermap',content:new TextDecoder().decode(portable)}).media).toEqual(['photo.png']);expect(recallVisualLook(reopened,reopened.visuals![0],'A').source!.mediaId).toBe('photo');
 const cleared=clearVisualLook(withLook,v,'A');expect(removeUnusedMedia({...withLook,visuals:[cleared]},'photo').media).toEqual([]);
 expect(()=>recallVisualLook({...withLook,media:[]},v,'A')).toThrow('media is unavailable');
});
test.each(['locked','track','audio','mask','timeline'])('preset writes reject %s without mutation',kind=>{
 const show=rich(),v=storeVisualLook(show,show.visuals![0],'A');show.visuals=[v];
 if(kind==='locked')v.locked=true;if(kind==='track')show.tracks!.find(t=>t.id===v.trackID)!.locked=true;if(kind==='audio')show.tracks!.find(t=>t.id===v.trackID)!.kind='audio';if(kind==='mask')v.mask=true;if(kind==='timeline')v.timelineRefID='other';
 const before=structuredClone(show);for(const op of [()=>storeVisualLook(show,v,'B'),()=>recallVisualLook(show,v,'A'),()=>clearVisualLook(show,v,'A'),()=>randomVisualLook(show,v,1)])expect(op).toThrow();expect(show).toEqual(before);if(kind==='locked'||kind==='track')expect(visualIsLocked(show,v)).toBe(true);
});
test('randomization is repeatable and preserves scheduling, geometry, slots and device connection fields',()=>{
 const show=rich(),v=storeVisualLook(show,show.visuals![0],'A'),a=randomVisualLook(show,v,123),b=randomVisualLook(show,v,123);
 expect(a).toEqual(b);expect(a.source).not.toEqual(v.source);expect(a.looks).toEqual(v.looks);expect(a.placement).toEqual(v.placement);expect(a.motion).toEqual(v.motion);expect(a.targets).toEqual(v.targets);expect(a.effects![0].animation).toBeUndefined();expect(a.source!.motion?.animation?.['color:text:hueDeg']).toBeUndefined();
 const camera=seed({...base,webcam:{...DEFAULT_TRACKER,deviceId:'camera-one'}}),cv=camera.visuals![0],next=randomVisualLook(camera,cv,1);expect(next.source!.webcam).toEqual(visualSource(camera,cv).webcam);expect(next.effects![0].kind).toBe('vintage');
 const keyed=seed({...base,mediaId:'photo',chromaKey:DEFAULT_CHROMA_KEY});expect(randomVisualLook(keyed,keyed.visuals![0],1).source!.chromaKey).toEqual(DEFAULT_CHROMA_KEY);
 for(const value of [-1,.5,NaN,Infinity,0x100000000])expect(()=>randomVisualLook(show,v,value)).toThrow('seed');
});
test('random shader variations stay valid and include all original and upstream generators',()=>{
 for(const entry of SHADERS){const show=seed({...base,shader:newShader(entry.id)}),v=show.visuals![0];const a=randomVisualLook(show,v,12),saved=parseShow(serializeShow({...show,visuals:[a]}));expect(a.source!.shader!.preset).toBe(entry.id);expect(saved.visuals![0].source!.shader!.parameters).toEqual(a.source!.shader!.parameters);expect(a.targets).toEqual(v.targets);}
});
test('bounded file recovery strips recursive slots, arbitrary fields, non-picture legacy entries and extra effects',()=>{
 const show=rich(),v=storeVisualLook(show,show.visuals![0],'A');const raw=JSON.parse(new TextDecoder().decode(serializeShow({...show,visuals:[v]})));
 raw.visuals[0].looks.A.opacity=99;raw.visuals[0].looks.A.targets=[{sceneID:'wrong'}];raw.visuals[0].looks.A.looks={A:{}};raw.visuals[0].looks.A.effects=Array.from({length:20},(_,i)=>({id:String(i),kind:'blur',amount:300}));raw.visuals[0].looks.Z=raw.visuals[0].looks.A;raw.visuals[0].looks.B={shaderOnly:true,source:{fill:'#fff'}};
 const looks=parseShow(JSON.stringify(raw)).visuals![0].looks!;expect(Object.keys(looks)).toEqual(['A']);expect(looks.A!.opacity).toBe(1);expect(looks.A!.effects).toHaveLength(12);expect(looks.A!.effects![0].amount).toBe(100);expect(looks.A).not.toHaveProperty('targets');expect(looks.A).not.toHaveProperty('looks');
});
