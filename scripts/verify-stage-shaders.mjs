import { build } from 'vite';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const dest=resolve('.verification/visual-library-2026-10-14');await mkdir(dest,{recursive:true});
await writeFile(`${dest}/shader-entry.ts`,"export { STAGE_GENERATORS } from '../../src/features/stage-shaders';\nexport { STAGE_CONTROLS } from '../../src/features/stage-controls';\n");
await build({configFile:false,publicDir:false,ssr:{noExternal:true},build:{ssr:`${dest}/shader-entry.ts`,outDir:dest,emptyOutDir:false,minify:false,rollupOptions:{output:{entryFileNames:'shader-entry.mjs'}}}});
const {STAGE_GENERATORS,STAGE_CONTROLS}=await import(pathToFileURL(`${dest}/shader-entry.mjs`));
const compile=spawnSync('clang++',['-std=c++17','-framework','OpenGL','scripts/stage-shader-probe.cpp','-o',`${dest}/shader-probe`],{encoding:'utf8'});
assert.equal(compile.status,0,compile.stderr);
function pixels(bytes){let start=0;for(let i=0;i<3;i++)start=bytes.indexOf(10,start)+1;return bytes.subarray(start);}
function difference(a,b){assert.equal(a.length,b.length);return a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;}
const results=[];
for(const entry of STAGE_GENERATORS){
 const fragment=`${dest}/${entry.id}.frag`;
 await writeFile(fragment,entry.fragment.replace('#version 300 es','#version 410 core').replace('precision highp float;',''));
 async function render(name,seconds,params=entry.params,width=640){
  const colors=entry.colors.map((hex,i)=>`uColor${i}=${[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)/255).join(',')}`);
  const uniforms=Object.entries(params).map(([key,value])=>`u${key[0].toUpperCase()+key.slice(1)}=${value}`);
  const out=`${dest}/${entry.id}-${name}.ppm`,run=spawnSync(`${dest}/shader-probe`,[fragment,out,String(seconds),String(width),...colors,...uniforms],{encoding:'utf8'});
  assert.equal(run.status,0,`${entry.id} ${name}: ${run.stderr}`);
  return {pixels:pixels(await readFile(out)),...JSON.parse(run.stdout)};
 }
 const a=await render('default',3.25),b=await render('moving',4.75);
 const mean=a.pixels.reduce((s,v)=>s+v,0)/a.pixels.length;
 const variance=a.pixels.reduce((s,v)=>s+(v-mean)**2,0)/a.pixels.length;
 assert.ok(variance>4,`${entry.id}: blank or uniform output`);
 const motion=difference(a.pixels,b.pixels);assert.ok(motion>.05,`${entry.id}: no visible motion`);
 const controls={};
 for(const [key,spec] of Object.entries(STAGE_CONTROLS[entry.id])){
  const changed=await render(key,3.25,{...entry.params,[key]:entry.params[key]===spec.max?spec.min:spec.max});
  controls[key]=difference(a.pixels,changed.pixels);assert.ok(controls[key]>.001,`${entry.id}: inactive control ${key}`);
 }
 const hd=await render('1080p',3.25,entry.params,1920);
 results.push({id:entry.id,renderer:a.renderer,mean,variance,motion_pixel_change:motion,control_pixel_changes:controls,frame_ms_640x360:a.frame_ms,frame_ms_1920x1080:hd.frame_ms});
 console.log(JSON.stringify(results.at(-1)));
}
await writeFile(`${dest}/native-shader-qualification.json`,JSON.stringify({scope:'Native CGL compute with only GLSL version/precision declarations adapted. Not browser/WebGL or UI acceptance.',results},null,2)+'\n');
