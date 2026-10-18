// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { configureMidi, midiState, setMidiAssignments, setOutputMidi, startMidi, startMidiFeedback, stopMidi, stopMidiFeedback } from './midi';
import { launchControlXLMessage, launchControlXLPort } from './launch-control-xl';

type FakeInput = {id:string;name:string;state:string;onmidimessage:((e:{data:Uint8Array})=>void)|null;close:ReturnType<typeof vi.fn>};
function input(id:string):FakeInput { return {id,name:id,state:'connected',onmidimessage:null,close:vi.fn().mockResolvedValue(undefined)}; }
function fixture() {
 const a=input('Launch Control XL'),b=input('Other input');
 const output={id:'out',name:'Launch Control XL',state:'connected',send:vi.fn(),close:vi.fn().mockResolvedValue(undefined)};
 const other={...output,id:'other',name:'Synth',send:vi.fn(),close:vi.fn().mockResolvedValue(undefined)};
 const inputs=new Map([[a.id,a],[b.id,b]]),outputs=new Map([[output.id,output],[other.id,other]]);
 const access={inputs,outputs,onstatechange:null as (()=>void)|null};
 const request=vi.fn().mockResolvedValue(access);vi.stubGlobal('navigator',{requestMIDIAccess:request});
 const cc=(port:FakeInput,control:number,value:number,channel=0)=>port.onmidimessage?.({data:new Uint8Array([0xb0|channel,control,value])});
 return {a,b,output,other,access,request,cc};
}
beforeEach(()=>{vi.useFakeTimers();stopMidi();configureMidi({inputId:'',outputId:'',channel:0});setMidiAssignments([]);});
afterEach(()=>{stopMidi();vi.useRealTimers();vi.unstubAllGlobals();});
test('documented LED bytes address only a valid CC/channel and use copy/clear flags',()=>{
 expect(launchControlXLMessage(13,0,0,false)).toEqual([144,13,28]);
 expect(launchControlXLMessage(74,15,.5,true)).toEqual([159,74,46]);
 expect(launchControlXLMessage(7,8,1,true)).toEqual([152,7,63]);
 expect(launchControlXLMessage(7,8,1,false)).toEqual([152,7,60]);
 expect(launchControlXLMessage(7,8,1,false,true)).toEqual([152,7,12]);
 expect(()=>launchControlXLMessage(128,0,0,false)).toThrow();expect(()=>launchControlXLMessage(1,16,0,false)).toThrow();
 expect(launchControlXLPort('LaunchControl XL')).toBe(true);expect(launchControlXLPort('Launch Control XL HUI')).toBe(false);
});
test('ordinary input works without output, learning ignores notes and records the channel',async()=>{
 const f=fixture();await startMidi();f.cc(f.a,74,127,8);
 expect(midiState()).toMatchObject({connected:true,controls:{74:1},lastControl:74,lastChannel:8});
 const serial=midiState().eventSerial;
 f.a.onmidimessage?.({data:new Uint8Array([0x90,74,63])});f.a.onmidimessage?.({data:new Uint8Array([0xb0,74])});
 expect(midiState().eventSerial).toBe(serial);expect(f.output.send).not.toHaveBeenCalled();
});
test('selects an input, clears stale values and stops receiving the other desk',async()=>{
 const f=fixture();await startMidi();f.cc(f.a,7,127);f.cc(f.b,8,64);
 configureMidi({inputId:f.a.id});expect(midiState().controls).toEqual({});
 f.cc(f.b,8,100);expect(midiState().controls).toEqual({});f.cc(f.a,7,32);expect(midiState().controls[7]).toBe(32/127);
});
test('permission races cannot resurrect a stopped session or attach duplicate listeners',async()=>{
 const f=fixture();let resolve!:(a:typeof f.access)=>void;f.request.mockImplementation(()=>new Promise(done=>{resolve=done;}));
 const pending=startMidi();await startMidi();expect(f.request).toHaveBeenCalledTimes(1);expect(midiState().starting).toBe(true);
 stopMidi();resolve(f.access);await pending;
 expect(midiState().connected).toBe(false);expect(f.a.onmidimessage).toBeNull();expect(f.access.onstatechange).toBeNull();
});
test('permission failure and unsupported browsers remain stopped with an actionable status',async()=>{
 vi.stubGlobal('navigator',{});await startMidi();expect(midiState().status).toMatch(/no Web MIDI/);
 const f=fixture();f.request.mockRejectedValue(Error('Permission denied'));await startMidi();expect(midiState()).toMatchObject({starting:false,connected:false,status:'Permission denied'});
});
test('LED output is opt-in, uses mapped/selected controls, coalesces changes and clears removed assignments',async()=>{
 const f=fixture();setMidiAssignments([13,14],[14]);await startMidi();configureMidi({outputId:'out',channel:8});
 expect(f.output.send).not.toHaveBeenCalled();startMidiFeedback();
 expect(f.output.send.mock.calls).toEqual([[[152,13,28]],[[152,14,29]]]);
 f.cc(f.a,13,20,8);f.cc(f.a,13,70,8);f.cc(f.a,13,127,8);vi.advanceTimersByTime(25);
 expect(f.output.send.mock.calls.at(-1)).toEqual([[152,13,60]]);expect(f.output.send).toHaveBeenCalledTimes(3);
 f.cc(f.a,13,126,8);vi.advanceTimersByTime(25);expect(f.output.send).toHaveBeenCalledTimes(3);
 setMidiAssignments([14],[14]);vi.advanceTimersByTime(25);expect(f.output.send.mock.calls.at(-1)).toEqual([[152,13,12]]);
 stopMidiFeedback();expect(f.output.send.mock.calls.at(-1)).toEqual([[152,14,12]]);expect(f.other.send).not.toHaveBeenCalled();
});
test('routing changes clear the old channel and require a new explicit feedback start',async()=>{
 const f=fixture();await startMidi();setMidiAssignments([13]);configureMidi({outputId:'out'});startMidiFeedback();
 configureMidi({channel:4});expect(f.output.send.mock.calls.at(-1)).toEqual([[144,13,12]]);expect(midiState().feedback).toBe(false);
 vi.advanceTimersByTime(100);expect(f.output.send).toHaveBeenCalledTimes(2);
 startMidiFeedback();expect(f.output.send.mock.calls.at(-1)).toEqual([[148,13,28]]);
});
test('disconnect removes held values, falls back to remaining input and never auto-resumes feedback',async()=>{
 const f=fixture();await startMidi();f.cc(f.b,13,32);f.cc(f.a,13,127);setMidiAssignments([13]);configureMidi({outputId:'out'});startMidiFeedback();
 f.a.state='disconnected';f.output.state='disconnected';f.access.onstatechange?.();
 expect(f.a.onmidimessage).toBeNull();expect(midiState().controls[13]).toBe(32/127);expect(midiState().feedback).toBe(false);expect(midiState().lastControl).toBeNull();
 f.a.state='connected';f.output.state='connected';f.access.onstatechange?.();expect(midiState().feedback).toBe(false);
 const count=f.output.send.mock.calls.length;vi.advanceTimersByTime(100);expect(f.output.send).toHaveBeenCalledTimes(count);
});
test('a failed send stops feedback while MIDI input continues',async()=>{
 const f=fixture();await startMidi();setMidiAssignments([13]);configureMidi({outputId:'out'});f.output.send.mockImplementation(()=>{throw Error('Disconnected');});startMidiFeedback();
 expect(midiState()).toMatchObject({connected:true,feedback:false});expect(midiState().feedbackStatus).toContain('Disconnected');
 f.cc(f.a,13,32);expect(midiState().controls[13]).toBe(32/127);
});
test('feedback refuses unrelated ports, and stop/pagehide clears only owned LEDs',async()=>{
 const f=fixture();await startMidi();setMidiAssignments([13]);configureMidi({outputId:'other'});startMidiFeedback();expect(midiState().feedback).toBe(false);expect(f.other.send).not.toHaveBeenCalled();
 configureMidi({outputId:'out'});startMidiFeedback();window.dispatchEvent(new Event('pagehide'));
 expect(f.output.send.mock.calls).toEqual([[[144,13,28]],[[144,13,12]]]);expect(f.output.close).toHaveBeenCalled();expect(f.a.close).toHaveBeenCalled();expect(f.a.onmidimessage).toBeNull();expect(midiState().controls).toEqual({});
});
test('forwarded output levels do not acquire MIDI or send lights, and silence clears stale controls',()=>{
 const f=fixture();setMidiAssignments([13]);setOutputMidi({13:4,14:-1,128:.5,15:NaN},true);startMidiFeedback();
 expect(midiState().controls).toEqual({13:1,14:0});expect(f.request).not.toHaveBeenCalled();expect(f.output.send).not.toHaveBeenCalled();expect(midiState().feedback).toBe(false);
 setOutputMidi({13:1},false);expect(midiState().controls).toEqual({});
});
