import type { BodyLandmark } from './signals';
/** One inference frame in flight; the detector lives off the render thread. */
export function trackBodyStream(stream: MediaStream, onPose:(points:BodyLandmark[],timeMs:number)=>void, onError:(message:string)=>void):()=>void {
  const worker = new Worker(new URL('./pose-worker.ts',import.meta.url),{type:'module'});
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;
  let stopped=false,busy=true,timer=0,lastTime=-1;
  const startup=window.setTimeout(()=>fail('Body detector did not receive a camera frame in time.'),30000);
  let timeout=0;
  const stop=()=>{if(stopped)return;stopped=true;clearTimeout(timer);clearTimeout(timeout);clearTimeout(startup);worker.terminate();video.pause();video.srcObject=null;};
  const fail=(message:string)=>{if(stopped)return;stop();onError(message);};
  const tick=async()=>{
    if(stopped)return;
    if(!busy&&video.readyState>=2&&lastTime!==video.currentTime){
      busy=true;lastTime=video.currentTime;
      try{
        const image=await createImageBitmap(video);
        if(stopped){image.close();return;}
        timeout=window.setTimeout(()=>fail('Body detector stopped responding.'),10000);
        worker.postMessage({type:'frame',image,timeMs:performance.now()},[image]);
      }catch(error){fail((error as Error).message);return;}
    }
    timer=window.setTimeout(tick,50);
  };
  worker.onmessage=event=>{
    if(stopped)return;const m=event.data;
    if(m.type==='error'){fail(m.message);return;}
    if(m.type==='ready'||m.type==='pose'){clearTimeout(timeout);busy=false;}
    if(m.type==='pose'){clearTimeout(startup);onPose(m.points,m.timeMs);}
  };
  worker.onerror=event=>fail(event.message);
  const base=new URL('vendor/mediapipe',new URL(import.meta.env.BASE_URL,document.baseURI)).href;
  worker.postMessage({type:'init',base});
  void video.play().then(tick).catch((error:Error)=>fail(error.message));
  return stop;
}
