import { useEffect,useRef,useState } from 'react';
import { loopAssetUrl,type BundledLoop } from './bundled-loops';

export function LoopPreview({loop,playing}:{loop:BundledLoop;playing:boolean}){
 const video=useRef<HTMLVideoElement>(null),[error,setError]=useState('');
 useEffect(()=>{
  const node=video.current;if(!node)return;let current=true;
  if(playing)void node.play().then(()=>{if(current)setError('');}).catch(()=>{if(current)setError('Press Play preview to start the video.');});
  else node.pause();
  return()=>{current=false;node.pause();};
 },[loop.id,playing]);
 return <><video ref={video} src={loopAssetUrl(loop)} poster={loopAssetUrl(loop,true)} muted playsInline loop preload="metadata" aria-label={`${loop.name} video preview`}
  onError={()=>setError('Video preview unavailable. Reload the app or choose another loop.')} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain'}}/>
  {error&&<span role="status" className="map-loop-preview-error">{error}</span>}</>;
}
