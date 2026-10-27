// @vitest-environment jsdom
import {act, cleanup, renderHook, waitFor} from '@testing-library/react';
import {useState} from 'react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {emptyShow} from './document';
import {parseShow, serializeShow} from './show-file';
import {recoveryKey, SaveError} from '@aether/session/autosave';
import {listRecoveryBackups, storeRecoveryBackup} from '@aether/session/autosave-recovery';
import {useMapAutosave} from './use-map-autosave';
const api = vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),create:vi.fn(),rename:vi.fn(),owner:vi.fn()}));
vi.mock('./api',()=>({hosted:true,library:api,fromBase64:(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0))}));
vi.mock('@aether/session/autosave',async importOriginal=>({...await importOriginal<object>(),sessionOwner:api.owner}));
beforeEach(()=>api.owner.mockResolvedValue('review-user'));
afterEach(()=>{cleanup();sessionStorage.clear();localStorage.clear();vi.resetAllMocks();});
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

const file = {id:'show',name:'Show.aethermap',revision:1,writable:true};
const key = recoveryKey('map','review-user','show:Main');
function live(remote = text()) {
 history.replaceState(null,'','/map/?document=show');
 api.read.mockResolvedValue({...file,data_base64:btoa(remote)});
 api.save.mockResolvedValue({...file,revision:2});
 const onError=vi.fn(),setDirty=vi.fn();
 return renderHook(()=>{
   const [show,reset]=useState(()=>JSON.parse(remote)),[paused,setPaused]=useState(false);
   const value=useMapAutosave({text:new TextDecoder().decode(serializeShow(show)),reset,setDirty,onError,paused});
   return {...value,show,replace:reset,setPaused,edit:(name:string)=>reset({...show,scenes:show.scenes.map((s: {name:string})=>({...s,name}))})};
 });
}
it('retains expired-session edits and resumes after checking the authenticated server revision',async()=>{
 const hook=live();await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 api.owner.mockRejectedValueOnce(new SaveError('Sign in',401));
 act(()=>hook.result.current.edit('Moved surface and added rectangle'));
 await waitFor(()=>expect(hook.result.current.saveState.status).toBe(401),{timeout:2500});
 expect(api.save).not.toHaveBeenCalled();expect(listRecoveryBackups(key)).toHaveLength(1);
 await act(()=>hook.result.current.retry());
 expect(api.save).toHaveBeenCalledWith('show',1,expect.anything(),'Main');
 expect(new TextDecoder().decode(api.save.mock.calls[0][2])).toContain('Moved surface and added rectangle');
 expect(hook.result.current.saveState.phase).toBe('saved');expect(listRecoveryBackups(key)).toHaveLength(0);
});
it('does not allow an older tab to overwrite newer server edits',async()=>{
 const hook=live();await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 act(()=>hook.result.current.edit('Old tab changes'));
 const newest=structuredClone(hook.result.current.show);newest.scenes[0].name='Newer server changes';
 api.read.mockResolvedValue({...file,revision:2,data_base64:btoa(JSON.stringify(newest))});
 await act(()=>hook.result.current.retry());
 expect(api.save).not.toHaveBeenCalled();expect(hook.result.current.saveState.status).toBe(409);
 expect(hook.result.current.show.scenes[0].name).toBe('Old tab changes');
 expect(listRecoveryBackups(key)[0].record.text).toContain('Old tab changes');
});
it('refreshes a clean older tab without saving its stale content back to the server',async()=>{
 const hook=live();await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 const newest=structuredClone(hook.result.current.show);newest.scenes[0].name='Newer server changes';
 api.read.mockResolvedValue({...file,revision:2,data_base64:btoa(JSON.stringify(newest))});
 await act(()=>hook.result.current.retry());
 expect(hook.result.current.show.scenes[0].name).toBe('Newer server changes');expect(api.save).not.toHaveBeenCalled();
});
it('offers a closed tab’s persistent draft and recovers it only after an explicit choice',async()=>{
 const remote=text(),draft=JSON.parse(remote);draft.scenes[0].name='Recovered moved surface';
 storeRecoveryBackup({id:'closed-tab',key,updated:123,record:{base:{file,name:file.name},text:JSON.stringify(draft),blocked:'Sign in',blockedStatus:401}});
 const hook=live(remote);await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 expect(hook.result.current.recoveries).toHaveLength(1);expect(api.save).not.toHaveBeenCalled();
 expect(hook.result.current.show.scenes[0].name).not.toBe('Recovered moved surface');
 await act(()=>hook.result.current.recover('closed-tab'));
 expect(hook.result.current.show.scenes[0].name).toBe('Recovered moved surface');
 await act(()=>hook.result.current.retry());
 expect(hook.result.current.saveState.phase).toBe('saved');expect(listRecoveryBackups(key)).toEqual([]);
});
it('refuses to save an open account’s changes after another account signs in',async()=>{
 const hook=live();await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 api.owner.mockResolvedValue('other-account');act(()=>hook.result.current.edit('Private draft'));
 await act(()=>hook.result.current.retry());
 expect(api.save).not.toHaveBeenCalled();expect(hook.result.current.saveState.status).toBe(401);
 expect(listRecoveryBackups(key)[0].record.text).toContain('Private draft');
});
it('confirms the actual saved bytes after a lost reply even when parsing adds defaults',async()=>{
 const hook=live();await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 act(()=>hook.result.current.replace({...hook.result.current.show,tracks:[{id:'t',name:'V1',kind:'video',targets:[],enabled:true,locked:false}]}));
 api.save.mockRejectedValueOnce(new SaveError('Lost reply',0,false));
 await act(async()=>{await expect(hook.result.current.save()).rejects.toThrow('Lost reply');});
 const accepted=new TextDecoder().decode(api.save.mock.calls[0][2]);
 expect(new TextDecoder().decode(serializeShow(parseShow(accepted)))).not.toBe(accepted);
 api.read.mockResolvedValue({...file,revision:2,data_base64:btoa(accepted)});
 await act(()=>hook.result.current.retry());
 expect(hook.result.current.saveState.phase).toBe('saved');expect(api.save).toHaveBeenCalledTimes(1);
 expect(listRecoveryBackups(key)).toEqual([]);
});
it('does not reset the document and undo history when a focus check finds the same revision',async()=>{
 const hook=live();await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 const same=hook.result.current.show;await act(()=>hook.result.current.retry());
 expect(hook.result.current.show).toBe(same);expect(api.save).not.toHaveBeenCalled();
});
it('does not replace the document when a gesture starts during a server check',async()=>{
 const hook=live();await waitFor(()=>expect(hook.result.current.ready).toBe(true));
 const same=hook.result.current.show;let resolve!:(value:unknown)=>void;
 api.read.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 let pending!:Promise<void>;act(()=>{pending=hook.result.current.retry();});
 await waitFor(()=>expect(resolve).toBeTypeOf('function'));
 act(()=>hook.result.current.setPaused(true));
 await act(async()=>{resolve({...file,revision:2,data_base64:btoa(text())});await pending;});
 expect(hook.result.current.show).toBe(same);expect(api.save).not.toHaveBeenCalled();
});
