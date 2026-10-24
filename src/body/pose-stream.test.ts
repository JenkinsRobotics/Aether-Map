// @vitest-environment jsdom
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import { trackBodyStream } from './pose-stream';
let worker:FakeWorker;
class FakeWorker{
 onmessage:((event:MessageEvent)=>void)|null=null;onerror:((event:ErrorEvent)=>void)|null=null;
 postMessage=vi.fn();terminate=vi.fn();constructor(){worker=this;}
 send(data:object){this.onmessage?.({data} as MessageEvent);}
}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('Worker',FakeWorker);vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
test('model readiness without camera frames times out and cleans the worker',async()=>{
 const onError=vi.fn(),stop=trackBodyStream({} as MediaStream,vi.fn(),onError);worker.send({type:'ready'});
 await vi.advanceTimersByTimeAsync(30000);expect(onError).toHaveBeenCalledWith('Body detector did not receive a camera frame in time.');expect(worker.terminate).toHaveBeenCalledOnce();stop();expect(worker.terminate).toHaveBeenCalledOnce();
});
test('one inference is in flight; stale worker and pending bitmap cannot publish after stop',async()=>{
 vi.spyOn(HTMLMediaElement.prototype,'readyState','get').mockReturnValue(2);
 vi.spyOn(HTMLMediaElement.prototype,'currentTime','get').mockImplementation(()=>Date.now()/1000);
 const image={close:vi.fn()},bitmap=vi.fn().mockResolvedValue(image);vi.stubGlobal('createImageBitmap',bitmap);
 const onPose=vi.fn(),onError=vi.fn(),stop=trackBodyStream({} as MediaStream,onPose,onError);worker.send({type:'ready'});
 await vi.advanceTimersByTimeAsync(200);expect(bitmap).toHaveBeenCalledOnce();expect(worker.postMessage.mock.calls[1][0].type).toBe('frame');
 worker.send({type:'pose',points:[],timeMs:200});expect(onPose).toHaveBeenCalledOnce();
 let resolve!:(value:typeof image)=>void;bitmap.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 await vi.advanceTimersByTimeAsync(50);stop();resolve(image);await Promise.resolve();expect(image.close).toHaveBeenCalledOnce();
 worker.send({type:'pose',points:[],timeMs:500});expect(onPose).toHaveBeenCalledOnce();expect(onError).not.toHaveBeenCalled();
});
