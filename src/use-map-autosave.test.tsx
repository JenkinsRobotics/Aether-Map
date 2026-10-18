// @vitest-environment jsdom
import {cleanup, renderHook, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {emptyShow} from './document';
import {serializeShow} from './show-file';
import {recoveryKey} from '@aether/session/autosave';
import {useMapAutosave} from './use-map-autosave';
const api = vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),create:vi.fn(),rename:vi.fn()}));
vi.mock('./api',()=>({hosted:true,library:api,fromBase64:(value:string)=>atob(value)}));
vi.mock('@aether/session/autosave',async importOriginal=>({...await importOriginal<object>(),sessionOwner:async()=>'review-user'}));
afterEach(()=>{cleanup();sessionStorage.clear();vi.clearAllMocks();});
const text = ()=>new TextDecoder().decode(serializeShow(emptyShow()));
function open(draft:string, remote:string|null, revision=2){
 history.replaceState(null,'','/map/?document=show');
 const base={file:{id:'show',name:'Show.aethermap',revision:1,writable:true},name:'Show.aethermap'};
 sessionStorage.setItem(recoveryKey('map','review-user','show:Main'),JSON.stringify({base,text:draft,blocked:'A save was interrupted.'}));
 if(remote===null)api.read.mockRejectedValue(new TypeError('offline'));
 else api.read.mockResolvedValue({...base.file,revision,data_base64:btoa(remote)});
 const reset=vi.fn(),setDirty=vi.fn(),onError=vi.fn();
 const hook=renderHook(()=>useMapAutosave({text:draft,reset,setDirty,onError,paused:false}));
 return {...hook,reset,onError};
}
it('confirms an interrupted save from fresh identical server content without creating another revision',async()=>{
 const draft=text(); const hook=open(draft,draft);
 await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 expect(hook.result.current.saveState.phase).toBe('saved');
 expect(hook.result.current.file?.revision).toBe(2);
 expect(sessionStorage.getItem(recoveryKey('map','review-user','show:Main'))).toBeNull();
 expect(api.save).not.toHaveBeenCalled();expect(api.create).not.toHaveBeenCalled();
});
it('preserves divergent local work when a fresh server revision differs',async()=>{
 const remote=text();const show=JSON.parse(remote);show.scenes[0].name='Local edits';
 const draft=JSON.stringify(show);const hook=open(draft,remote);
 await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 expect(hook.result.current.saveState.phase).toBe('conflict');
 expect(hook.reset.mock.calls[0][0].scenes[0].name).toBe('Local edits');
 expect(api.save).not.toHaveBeenCalled();
});
it('does not treat offline metadata as confirmation of a save',async()=>{
 const hook=open(text(),null);
 await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 expect(hook.result.current.saveState.phase).toBe('conflict');
 expect(sessionStorage.getItem(recoveryKey('map','review-user','show:Main'))).not.toBeNull();
 expect(api.save).not.toHaveBeenCalled();
});
