import { useRef,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShaderMedia } from '../../src/features/ShaderMedia';
import { STAGE_GENERATORS } from '../../src/features/stage-shaders';
import { STAGE_CONTROLS } from '../../src/features/stage-controls';
import { newShader } from '../../src/features/shader-catalog';
import { BUNDLED_LOOPS,loopAssetUrl,loadBundledLoop } from '../../src/features/bundled-loops';
import type { ShaderSource } from '../../src/features/types';

/** Controlled fixture over the actual WebGL/video components. It owns no app or account data. */
function Fixture(){
 const [shader,setShader]=useState(newShader(STAGE_GENERATORS[0].id)),[time,setTime]=useState(3.25),[running,setRunning]=useState(false),[report,setReport]=useState('Not run');
 const picture=useRef<HTMLDivElement>(null);
 async function pixels(source:ShaderSource,seconds:number){
  setShader(source);setTime(seconds);
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const canvas=picture.current?.querySelector('canvas');if(!canvas)throw Error(`${source.preset}: renderer did not produce a canvas`);
  const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
  const ctx=copy.getContext('2d')!;ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,copy.width,copy.height).data;
 }
 function difference(a:Uint8ClampedArray,b:Uint8ClampedArray){if(a.length!==b.length)throw Error('Raster dimensions changed');let total=0;for(let i=0;i<a.length;i++)if(i%4!==3)total+=Math.abs(a[i]-b[i]);return total/(a.length*.75);}
 async function run(){
  setRunning(true);const results:unknown[]=[];
  try{
   for(const generator of STAGE_GENERATORS){
    const source=newShader(generator.id),a=await pixels(source,3.25),b=await pixels(source,4.75),motion=difference(a,b);
    if(motion<.01)throw Error(`${generator.id}: motion pixels are unchanged`);
    const changes:Record<string,number>={};
    for(const [key,spec] of Object.entries(STAGE_CONTROLS[generator.id])){
     const next={...source,parameters:{...source.parameters,[key]:source.parameters[key]===spec.max?spec.min:spec.max}};
     changes[key]=difference(a,await pixels(next,3.25));if(changes[key]<.001)throw Error(`${generator.id}: ${key} does not change pixels`);
    }
    results.push({id:generator.id,motion,changes});setReport(JSON.stringify(results,null,2));
   }
   for(const loop of BUNDLED_LOOPS){const file=await loadBundledLoop(loop);results.push({id:loop.id,bytes:file.size,integrity:'passed'});}
   setReport(JSON.stringify({status:'passed',results},null,2));
  }catch(error){setReport(JSON.stringify({status:'failed',error:String(error),results},null,2));}finally{setRunning(false);}
 }
 return <main style={{fontFamily:'system-ui',color:'#eee',background:'#111827',padding:20}}>
  <h1>Map visual library qualification</h1><p>Actual ShaderMedia and bundled video files. Uses no account or saved documents.</p>
  <button disabled={running} onClick={()=>void run()}>{running?'Checking pixels…':'Check WebGL and loop integrity'}</button>
  <label>Generator <select value={shader.preset} disabled={running} onChange={e=>setShader(newShader(e.target.value))}>{STAGE_GENERATORS.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
  <div ref={picture} style={{width:640,height:360,margin:'20px 0'}}><ShaderMedia shader={shader} timeS={time} snapshot placeholder style={{width:'100%',height:'100%'}}/></div>
  <pre role="status" style={{whiteSpace:'pre-wrap'}}>{report}</pre>
  <section style={{display:'grid',gridTemplateColumns:'repeat(2,480px)',gap:20}}>{BUNDLED_LOOPS.map(loop=><article key={loop.id}><h2>{loop.name}</h2><video aria-label={`${loop.name} playback`} width="480" height="270" src={loopAssetUrl(loop)} poster={loopAssetUrl(loop,true)} controls muted loop preload="metadata"/></article>)}</section>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
