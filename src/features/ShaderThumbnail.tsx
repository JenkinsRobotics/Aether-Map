import { useEffect, useRef, useState } from 'react';
import { ShaderMedia } from './ShaderMedia';
import { PreviewQuality } from './PreviewQuality';
import type { ShaderSource } from './types';

const cache=new Map<string,string>();
let active=0;
const waiting=new Set<()=>void>();
/** A grid never mounts a WebGL context per tile. At most two snapshots render
 * concurrently, then become ordinary images and release their GPU context. */
function reserve(start:()=>void) {
 let started=false, done=false;
 const run=()=>{ if(done || active>=2) return; waiting.delete(run); started=true; active++; start(); };
 waiting.add(run); run();
 return ()=>{ if(done)return; done=true; waiting.delete(run); if(started)active--; for(const next of waiting){if(active>=2)break;next();} };
}
const quality={scale:1,maxPixelCount:320*180};
export function ShaderThumbnail({shader}: {shader:ShaderSource}) {
 return <Thumbnail key={JSON.stringify(shader)} shader={shader} cacheKey={JSON.stringify(shader)} />;
}
function Thumbnail({shader,cacheKey:key}: {shader:ShaderSource;cacheKey:string}) {
 const [image,setImage]=useState(()=>cache.get(key));
 const [rendering,setRendering]=useState(false),[failed,setFailed]=useState(false);
 const host=useRef<HTMLSpanElement>(null), release=useRef<(()=>void)|null>(null);
 useEffect(()=>{
  if(cache.has(key))return;
  let disposed=false;
  const begin=()=>{release.current=reserve(()=>{if(!disposed)setRendering(true);});};
  const observer=typeof IntersectionObserver==='undefined' ? null : new IntersectionObserver(entries=>{
   if(entries.some(entry=>entry.isIntersecting)){observer?.disconnect();begin();}
  },{rootMargin:'120px'});
  if(observer && host.current)observer.observe(host.current); else begin();
  return ()=>{disposed=true;observer?.disconnect();release.current?.();release.current=null;};
 },[key]);
 useEffect(()=>{
  if(!rendering)return;
  let raf=0, frames=0;
  const finish=()=>{setRendering(false);release.current?.();release.current=null;};
  const capture=()=>{
   const canvas=host.current?.querySelector('canvas');
   if(++frames>=4 && canvas && canvas.width>1 && canvas.height>1){
    try {const url=canvas.toDataURL('image/webp',.82);cache.set(key,url);if(cache.size>240)cache.delete(cache.keys().next().value!);setImage(url);}
    catch {setFailed(true);}
    finish();return;
   }
   if(frames>90 || host.current?.textContent?.includes('unavailable')){setFailed(true);finish();return;}
   raf=requestAnimationFrame(capture);
  };
  raf=requestAnimationFrame(capture);return()=>cancelAnimationFrame(raf);
 },[rendering,key]);
 return <span className="map-shader-thumbnail" ref={host}>
  {image ? <img src={image} alt="" /> : failed ? <span className="map-thumbnail-status">Preview unavailable</span> : <span className="map-thumbnail-status">Rendering preview…</span>}
  {rendering && <span className="map-thumbnail-render"><PreviewQuality.Provider value={quality}><ShaderMedia shader={shader} snapshot timeS={3.25} placeholder style={{width:320,height:180}} /></PreviewQuality.Provider></span>}
 </span>;
}
