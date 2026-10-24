import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { BUNDLED_LOOPS, GALLERY_LOOPS, loadBundledLoop, loopAssetUrl, loopCredit } from './bundled-loops';
import { emptyShow, type MediaRef } from '../document';
import { normalizeDocument } from '../normalize-document';
import { addSimpleVisual, replaceSimpleVisual, moveSimpleVisual, simpleVisuals } from '../simple-visuals';
import { parseShow, serializeShow } from '../show-file';
import { projectExport } from '../automation/project-export';
import { visualSource } from '../media-pool';
import { recentVisuals } from './visual-gallery';

afterEach(()=>vi.unstubAllGlobals());
function globals(){vi.stubGlobal('document',{baseURI:'http://localhost:8780/map/index.html'});vi.stubGlobal('crypto',webcrypto);}
test('every bundled file passes integrity validation and becomes ordinary imported video',async()=>{
 globals();
 for(const loop of BUNDLED_LOOPS){
  const bytes=readFileSync(new URL(`../../public/visual-loops/${loop.file}`,import.meta.url));
  const fetcher=vi.fn().mockResolvedValue(new Response(bytes));vi.stubGlobal('fetch',fetcher);
  const file=await loadBundledLoop(loop);
  expect(file.type).toBe('video/mp4');expect(file.name).toBe(`${loop.name}.mp4`);expect(file.size).toBe(loop.bytes);
  expect(Buffer.from(await file.arrayBuffer()).equals(bytes)).toBe(true);
  expect(fetcher.mock.calls[0][0]).toContain(`/visual-loops/${loop.file}`);
  expect(readFileSync(new URL(`../../public/visual-loops/${loop.poster}`,import.meta.url)).byteLength).toBeGreaterThan(1000);
 }
});
test('unknown, missing, truncated and corrupted assets fail before import',async()=>{
 globals();const loop=BUNDLED_LOOPS[0];const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await expect(loadBundledLoop({...loop,id:'../../private'})).rejects.toThrow('Unknown');expect(fetcher).not.toHaveBeenCalled();
 fetcher.mockResolvedValueOnce(new Response('',{status:401}));await expect(loadBundledLoop(loop)).rejects.toThrow('Sign in');
 fetcher.mockResolvedValueOnce(new Response('',{status:404}));await expect(loadBundledLoop(loop)).rejects.toThrow('404');
 fetcher.mockResolvedValueOnce(new Response(new Uint8Array(3)));await expect(loadBundledLoop(loop)).rejects.toThrow('incomplete');
 fetcher.mockResolvedValueOnce(new Response(new Uint8Array(loop.bytes)));await expect(loadBundledLoop(loop)).rejects.toThrow('integrity');
 expect(loopAssetUrl({...loop,file:'../../private'})).toContain(loop.file);
});
test('imported loops survive layer moves, replacement, save/reopen and ordinary export media enumeration',()=>{
 let show=normalizeDocument(emptyShow());
 const media:MediaRef[]=BUNDLED_LOOPS.slice(0,2).map((loop,i)=>({id:`m-${i}`,file:`m-${i}.mp4`,name:loop.name,kind:'video',bytes:loop.bytes,width:loop.width,height:loop.height,duration:loop.duration,credit:loopCredit}));
 show=normalizeDocument({...show,media});
 for(const m of media)show=addSimpleVisual(show,{mediaId:m.id,rect:[0,0,m.width,m.height]},m.name);
 const ids=show.visuals!.map(v=>v.id),before=show;
 show=moveSimpleVisual(show,ids[1],'back');
 expect(simpleVisuals(show).map(v=>v.id)).toEqual([ids[1],ids[0]]);
 show=replaceSimpleVisual(show,ids[0],{mediaId:media[1].id,rect:[0,0,1280,720]},'Replacement');
 show={...show,visuals:show.visuals!.map(v=>v.id===ids[0]?{...v,effects:[{id:'blur',kind:'blur',amount:2,enabled:true}]}:v)};
 const reopened=parseShow(serializeShow(show));
 expect(reopened.media.map(m=>m.credit)).toEqual([loopCredit,loopCredit]);
 expect(visualSource(reopened,reopened.visuals!.find(v=>v.id===ids[0])!).mediaId).toBe(media[1].id);
 expect(reopened.visuals!.find(v=>v.id===ids[0])!.effects![0].kind).toBe('blur');
 expect(projectExport({name:'Loops.aethermap',content:new TextDecoder().decode(serializeShow(reopened))}).media).toEqual(media.map(m=>m.file));
 expect(visualSource(before,before.visuals![0]).mediaId).toBe(media[0].id); // previous undo snapshot remains intact
});
test('loop recent history is supported only by pickers which accept media',()=>{
 const id=GALLERY_LOOPS[0].id,raw=JSON.stringify([id,id,'missing']);
 expect(recentVisuals(raw)).toEqual([]);
 expect(recentVisuals(raw,GALLERY_LOOPS.map(v=>v.id))).toEqual([id]);
});
