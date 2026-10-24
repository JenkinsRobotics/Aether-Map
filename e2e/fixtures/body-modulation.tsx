import { useEffect,useRef,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { trackBodyStream } from '../../src/body/pose-stream';
import { bodySignals,DEFAULT_BODY_SETTINGS } from '../../src/body/signals';
import { setOutputBody,useBody } from '../../src/body/runtime';
import { BodyPoseOverlay } from '../../src/body/BodyTrackingControls';
import { useLiveOutput } from '../../src/live/output-live';
import { useLiveLevels } from '../../src/live/use-live-levels';
import { VisualEffects } from '../../src/features/VisualEffects';
import { ShaderMedia } from '../../src/features/ShaderMedia';
import { shaderAt } from '../../src/features/shader-motion';
import { newShader } from '../../src/features/shader-catalog';
import { DEFAULT_MODULATION } from '../../src/features/types';
import '@aether/ui/tokens.css';
import '@aether/ui/widgets.css';
const isOutput=new URLSearchParams(location.search).has('output');
const shader={...newShader('neon-beams'),modulation:{glow:{...DEFAULT_MODULATION,source:'body' as const,bodySignal:'x' as const,range:{min:.1,max:2}}}};
const effect={id:'body-zoom',kind:'zoom' as const,enabled:true,amount:0,modulation:{...DEFAULT_MODULATION,source:'body' as const,bodySignal:'x' as const,range:{min:0,max:100}}};
function Fixture(){
 const canvas=useRef<HTMLCanvasElement>(null),position=useRef(0),blank=useRef(false),stop=useRef<()=>void>(()=>{});
 const [running,setRunning]=useState(false),[status,setStatus]=useState('Ready — uses a local test image, not your camera.'),[count,setCount]=useState(0),[points,setPoints]=useState<Parameters<typeof bodySignals>[0]>([]);
 const body=useBody(),levels=useLiveLevels();useLiveOutput('pose-qualification',isOutput?'output':'editor');
 useEffect(()=>()=>stop.current(),[]);
 const start=async()=>{
  setRunning(true);setStatus('Loading real local pose model…');let raf=0;
  try{
   const image=new Image();image.src='./pose.jpg';await image.decode();const node=canvas.current!,ctx=node.getContext('2d')!;
   const draw=()=>{ctx.fillStyle='#777';ctx.fillRect(0,0,640,480);if(!blank.current)ctx.drawImage(image,position.current,26,640,427);raf=requestAnimationFrame(draw);};draw();
   const stream=node.captureStream(20);const dispose=trackBodyStream(stream,(landmarks)=>{setPoints(landmarks);const values=bodySignals(landmarks,{...DEFAULT_BODY_SETTINGS,mirror:false});setOutputBody(values,true);setCount(c=>c+1);setStatus(landmarks.length?'Real pose inference active':'No body detected');},message=>{setStatus(message);stop.current();});
   stop.current=()=>{dispose();cancelAnimationFrame(raf);stream.getTracks().forEach(t=>t.stop());setRunning(false);setOutputBody({},false);};
  }catch(error){setStatus(String(error));cancelAnimationFrame(raf);setRunning(false);}
 };
 return <main style={{maxWidth:1100,margin:'20px auto',fontFamily:'sans-serif',color:'#ddd',background:'#171923',padding:20}}>
 <h1>Map body modulation — {isOutput?'output receiver':'real detector fixture'}</h1><p role="status">{status}</p>
 {!isOutput&&<><button disabled={running} onClick={()=>void start()}>Start image stream</button><button disabled={!running} onClick={()=>{stop.current();setStatus('Stopped');}}>Stop image stream</button>
 <button onClick={()=>{position.current=-110;blank.current=false;}}>Position left</button><button onClick={()=>{position.current=110;blank.current=false;}}>Position right</button><button onClick={()=>{position.current=0;blank.current=false;}}>Center</button><button onClick={()=>{blank.current=true;}}>Empty frame</button>
 <div className="map-body-preview" style={{width:400,height:300}}><canvas ref={canvas} width="640" height="480" style={{width:'100%',height:'100%'}}/><BodyPoseOverlay points={points}/></div></>}
 <pre aria-label="Detector results">{JSON.stringify({frames:count,landmarks:points.length,active:body.active,signals:body.signals,glow:shaderAt(shader,0,levels).parameters.glow},null,2)}</pre>
 <div style={{position:'relative',width:640,height:360,overflow:'hidden',background:'#000'}}><VisualEffects timeS={0} effects={[effect]}><ShaderMedia shader={shader} timeS={0} style={{position:'absolute',inset:0}} placeholder/></VisualEffects></div>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
