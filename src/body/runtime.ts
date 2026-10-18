import { useEffect, useSyncExternalStore } from 'react';
import { bodySignals, DEFAULT_BODY_SETTINGS, readBodySettings, readBodySignals, smoothBodySignals, type BodyLandmark, type BodySettings, type BodySignals } from './signals';

const SETTINGS_KEY='aether-map.body-settings';
function loadSettings(){try{return readBodySettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)??'{}'));}catch{return DEFAULT_BODY_SETTINGS;}}
export interface BodyState { active:boolean; starting:boolean; remote:boolean; status:string; signals:BodySignals; points:BodyLandmark[]; settings:BodySettings; stream?:MediaStream }
let state:BodyState={active:false,starting:false,remote:false,status:'Body tracking is off',signals:{},points:[],settings:loadSettings()};
const listeners=new Set<()=>void>();
const publish=(patch:Partial<BodyState>)=>{state={...state,...patch};for(const fn of listeners)fn();};
export const subscribeBody=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const bodyState=()=>state;
export const useBody=()=>useSyncExternalStore(subscribeBody,bodyState);
let generation=0,cleanup:(()=>void)|undefined,expiry:ReturnType<typeof setTimeout>|undefined,lastAt=0;
export function configureBody(patch:Partial<BodySettings>){
  const settings=readBodySettings({...state.settings,...patch});
  if(settings.deviceId!==state.settings.deviceId&&(state.active||state.starting))stopBodyTracking();
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{/* Optional device preference. */}
  publish({settings, signals:bodySignals(state.points,settings)});
}
export function stopBodyTracking(){
  generation++;cleanup?.();cleanup=undefined;clearTimeout(expiry);lastAt=0;
  state.stream?.getTracks().forEach(track=>track.stop());
  publish({active:false,starting:false,remote:false,status:'Body tracking is off',signals:{},points:[],stream:undefined});
}
/** Called from an explicit operator action, never by opening a saved show. */
export async function startBodyTracking(){
  if(state.active||state.starting)return;
  const request=++generation;
  if(!navigator.mediaDevices?.getUserMedia){publish({status:'Body tracking needs HTTPS or localhost and camera support.'});return;}
  publish({starting:true,remote:false,signals:{},status:'Waiting for camera permission…'});
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{...(state.settings.deviceId?{deviceId:{exact:state.settings.deviceId}}:{}),width:{ideal:640},height:{ideal:480},frameRate:{ideal:20,max:30}}});
    if(request!==generation){stream.getTracks().forEach(t=>t.stop());return;}
    publish({stream,status:'Loading body detector…'});
    const {trackBodyStream}=await import('./pose-stream');
    if(request!==generation)return;
    const fail=(message:string)=>{if(request!==generation)return;stopBodyTracking();publish({status:`Body tracking unavailable: ${message}`});};
    stream.getVideoTracks()[0]?.addEventListener('ended',()=>fail('Camera disconnected.'),{once:true});
    cleanup=trackBodyStream(stream,(points,timeMs)=>{
      if(request!==generation)return;
      clearTimeout(expiry);
      const measured=bodySignals(points,state.settings),signals=smoothBodySignals(state.signals,measured,lastAt?(timeMs-lastAt)/1000:1,state.settings.smoothingS);lastAt=timeMs;
      publish({active:true,starting:false,points,signals,status:signals.presence?'Body tracked':'Step back so your shoulders and hips are visible'});
      expiry=setTimeout(()=>{if(request===generation)publish({points:[],signals:{},status:'No fresh body frames'});},750);
    },fail);
  }catch(error){if(request===generation){stopBodyTracking();publish({status:`Camera could not connect: ${(error as Error).message}`});}}
}
/** The editor sends values, not video, to local output windows. No permission request. */
export function setOutputBody(signals:unknown,active:boolean){
  if(state.stream||state.starting)return;
  clearTimeout(expiry);
  publish({remote:true,active,signals:active?readBodySignals(signals):{},points:[],status:active?'Body signals from editor':'Editor body tracking is off'});
  if(active)expiry=setTimeout(()=>publish({active:false,signals:{},status:'Editor body signals disconnected'}),7000);
}
export function useBodyCleanup(){useEffect(()=>()=>stopBodyTracking(),[]);}
