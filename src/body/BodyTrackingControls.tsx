import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, FieldRow, NumberField, SelectField } from '@aether/ui';
import { listCameras } from '../live/cameras';
import { configureBody, startBodyTracking, stopBodyTracking, useBody } from './runtime';
import { BODY_SIGNALS, type BodyLandmark } from './signals';
import './BodyTrackingControls.css';

const BONES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
export function BodyPoseOverlay({points,mirror=false,confidence=.5}:{points:readonly BodyLandmark[];mirror?:boolean;confidence?:number}){
  const at=(i:number)=>({x:(mirror?1-points[i].x:points[i].x)*100,y:points[i].y*100});
  const visible=(i:number)=>points[i]&&points[i].visibility>=confidence;
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Tracked body pose">
    {BONES.filter(([a,b])=>visible(a)&&visible(b)).map(([a,b])=><line key={`${a}-${b}`} x1={at(a).x} y1={at(a).y} x2={at(b).x} y2={at(b).y}/>)}
    {points.map((p,i)=>visible(i)&&<circle key={i} cx={(mirror?1-p.x:p.x)*100} cy={p.y*100} r=".7"/>)}
  </svg>;
}
/** Device setup is shared across all body assignments; the assignment itself lives in the show. */
export function BodyTrackingControls(){
  const state=useBody(),video=useRef<HTMLVideoElement>(null);
  const [open,setOpen]=useState(false),[devices,setDevices]=useState<MediaDeviceInfo[]>([]),[error,setError]=useState('');
  const refresh=()=>void listCameras().then(setDevices).catch(()=>setError('Could not list cameras. Connect the default camera to grant access.'));
  useEffect(()=>{
    const node=video.current;if(!node||!open)return;
    node.srcObject=state.stream??null;
    if(state.stream)void node.play().catch(()=>setError('Camera preview could not play. Tracking can still continue.'));
    return()=>{node.pause();node.srcObject=null;};
  },[state.stream,open]);
  return <section className="map-body-controls" aria-label="Body tracking setup">
    <p role="status">{state.status}</p>
    <div className="map-body-buttons"><Button onClick={()=>state.active||state.starting?stopBodyTracking():void startBodyTracking()}>{state.active||state.starting?'Stop body tracking':'Start body tracking'}</Button>
      <Button aria-expanded={open} onClick={()=>{setOpen(v=>!v);if(!open)refresh();}}>Configure tracking</Button></div>
    {open&&<>
      <div className="map-body-preview"><video ref={video} muted playsInline style={{transform:state.settings.mirror?'scaleX(-1)':undefined}}/><BodyPoseOverlay points={state.points} mirror={state.settings.mirror} confidence={state.settings.confidence}/></div>
      <FieldRow label="Camera"><SelectField aria-label="Body tracking camera" value={state.settings.deviceId} options={[{value:'',label:'System default'},...devices.map((d,i)=>({value:d.deviceId,label:d.label||`Camera ${i+1}`}))]}
        onChange={e=>configureBody({deviceId:e.target.value})}/></FieldRow>
      <Button onClick={refresh}>Refresh cameras</Button>
      <Checkbox label="Mirror body movement" checked={state.settings.mirror} onChange={e=>configureBody({mirror:e.target.checked})}/>
      <FieldRow label="Smoothing"><NumberField aria-label="Body tracking smoothing" value={state.settings.smoothingS} min={0} max={2} step={.05} unit="s" onValueChange={v=>v!==null&&configureBody({smoothingS:v})}/></FieldRow>
      <FieldRow label="Confidence"><NumberField aria-label="Body tracking confidence" value={state.settings.confidence} min={.1} max={.95} step={.05} onValueChange={v=>v!==null&&configureBody({confidence:v})}/></FieldRow>
      <div className="map-body-meters">{BODY_SIGNALS.map(signal=><label key={signal.value}><span>{signal.label}</span><meter min={0} max={1} value={state.signals[signal.value]??0} aria-label={signal.label}/><output>{state.signals[signal.value]===undefined?'—':`${Math.round(state.signals[signal.value]!*100)}%`}</output></label>)}</div>
      <p className="map-hint">Stand where the camera can see your shoulders and hips. Hidden landmarks and lost tracking send zero. One person is tracked. Camera frames stay on this device; output windows receive the measured values. Stop tracking when finished.</p>
      {error&&<p role="status">{error}</p>}
    </>}
  </section>;
}
/** A visible stop action survives closing the parameter's detail controls. */
export function BodyTrackingStatus(){const state=useBody();return state.active||state.starting?<Button title={state.status} onClick={stopBodyTracking}>Stop body tracking</Button>:null;}
