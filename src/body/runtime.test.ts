// @vitest-environment jsdom
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import { bodyState,configureBody,setOutputBody,startBodyTracking,stopBodyTracking } from './runtime';
import { DEFAULT_BODY_SETTINGS, type BodyLandmark } from './signals';
const mock=vi.hoisted(()=>({track:vi.fn()}));
vi.mock('./pose-stream',()=>({trackBodyStream:mock.track}));
let frame:(points:BodyLandmark[],timeMs:number)=>void,fail:(message:string)=>void;
const dispose=vi.fn(),stop=vi.fn(),track=new EventTarget();
const stream={getTracks:()=>[{stop}],getVideoTracks:()=>[track]} as unknown as MediaStream;
const getUserMedia=vi.fn();
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});getUserMedia.mockResolvedValue(stream);mock.track.mockImplementation((_stream,onFrame,onError)=>{frame=onFrame;fail=onError;return dispose;});configureBody(DEFAULT_BODY_SETTINGS);});
afterEach(()=>{stopBodyTracking();vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();});
function torso(){return Array.from({length:33},()=>({x:.3,y:.5,z:0,visibility:1}));}
test('explicit start owns a camera/worker; fresh frames drive signals, stale frames clear, stop disposes both',async()=>{
 expect(getUserMedia).not.toHaveBeenCalled();await startBodyTracking();expect(bodyState().starting).toBe(true);expect(getUserMedia.mock.calls[0][0].audio).toBe(false);
 frame(torso(),1000);expect(bodyState()).toMatchObject({active:true,starting:false,signals:{x:.7,presence:1}});
 vi.advanceTimersByTime(750);expect(bodyState().signals).toEqual({});frame(torso(),2000);expect(bodyState().signals.presence).toBe(1);
 stopBodyTracking();expect(stop).toHaveBeenCalledTimes(1);expect(dispose).toHaveBeenCalledTimes(1);expect(bodyState()).toMatchObject({active:false,signals:{}});
 frame(torso(),3000);expect(bodyState().signals).toEqual({});
});
test('canceling a pending permission request closes a late stream without starting inference',async()=>{
 let resolve!:(stream:MediaStream)=>void;getUserMedia.mockImplementationOnce(()=>new Promise<MediaStream>(r=>{resolve=r;}));
 const pending=startBodyTracking();stopBodyTracking();resolve(stream);await pending;
 expect(stop).toHaveBeenCalledOnce();expect(mock.track).not.toHaveBeenCalled();expect(bodyState().active).toBe(false);
});
test('worker errors and camera changes stop capture, and reconnect starts a new worker',async()=>{
 await startBodyTracking();fail('Detector failed');expect(bodyState().status).toContain('Detector failed');expect(stop).toHaveBeenCalledOnce();
 await startBodyTracking();configureBody({deviceId:'second-camera'});expect(stop).toHaveBeenCalledTimes(2);expect(bodyState().active).toBe(false);
});
test('permission rejection stays off with an actionable message',async()=>{
 getUserMedia.mockRejectedValueOnce(new Error('Permission denied'));await startBodyTracking();expect(bodyState()).toMatchObject({active:false,starting:false,signals:{}});expect(bodyState().status).toContain('Permission denied');
});
test('output values never request a camera, clear on stop, and expire on editor silence',()=>{
 setOutputBody({x:.75,level:1},true);expect(bodyState().signals).toEqual({x:.75});expect(getUserMedia).not.toHaveBeenCalled();
 vi.advanceTimersByTime(7000);expect(bodyState()).toMatchObject({active:false,signals:{}});
 setOutputBody({x:.9},true);setOutputBody({},false);expect(bodyState().signals).toEqual({});
});
