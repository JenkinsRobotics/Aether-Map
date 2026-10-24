// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useLiveOutput } from './output-live';
import { audioState, setOutputAudio } from './audio';
import { midiState, setOutputMidi } from './midi';
import { bodyState,setOutputBody,stopBodyTracking } from '../body/runtime';
import { SILENT_LEVELS } from './audio-analysis';

const channels: FakeChannel[] = [];
class FakeChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  posted: unknown[] = [];
  closed = false;
  constructor(public name: string) { channels.push(this); }
  postMessage(data: unknown) { this.posted.push(data); }
  close() { this.closed = true; }
}
function Harness({ role }: { role: 'editor' | 'output' }) { useLiveOutput('reference', role); return null; }
beforeEach(() => { channels.length = 0; vi.stubGlobal('BroadcastChannel', FakeChannel); });
afterEach(() => { cleanup(); stopBodyTracking(); setOutputAudio(SILENT_LEVELS, false); setOutputMidi({}, false); vi.unstubAllGlobals(); });
test('editor sends current levels on output arrival and subsequent controller changes', () => {
  render(<Harness role="editor" />); const channel = channels[0];
  act(() => { setOutputAudio({ low: .2, mid: .4, high: .6, level: .8 }, true, .75); setOutputMidi({ 74: .9 }, true); setOutputBody({x:.8},true); });
  expect(channel.posted.at(-1)).toMatchObject({ type: 'controls', levels: { level: .8 }, controls: { 74: .9 }, midiOn: true });
  act(() => { channel.onmessage?.({ data: { from: 'projector', type: 'hello' } } as MessageEvent); });
  expect(channel.posted.at(-1)).toMatchObject({ type: 'controls', audioOn: true, beat: .75, controls: { 74: .9 }, body:{x:.8},bodyOn:true });
  cleanup(); const count = channel.posted.length;
  setOutputMidi({ 74: 0 }, false); expect(channel.posted).toHaveLength(count); expect(channel.closed).toBe(true);
});
test('output consumes editor input without device permission and clears it on disconnect', () => {
  render(<Harness role="output" />); const channel = channels[0];
  act(() => { channel.onmessage?.({ data: { from: 'editor', type: 'controls', levels: { low: 1, mid: .5, high: 0, level: .4 }, audioOn: true, beat: .9, controls: { 7: .5 }, midiOn: true,body:{x:.6},bodyOn:true } } as MessageEvent); });
  expect(audioState().levels.low).toBe(1); expect(audioState().beat).toBe(.9); expect(midiState().controls[7]).toBe(.5);
  expect(bodyState().signals).toEqual({x:.6});
  act(()=>{channel.onmessage?.({data:{from:'another-output',type:'bye'}} as MessageEvent);});
  expect(bodyState().signals).toEqual({x:.6});
  act(()=>{channel.onmessage?.({data:{from:'editor',type:'bye'}} as MessageEvent);});
  expect(bodyState().signals).toEqual({});
  expect(midiState().controls).toEqual({});expect(audioState().listening).toBe(false);
  expect(channel.posted).toHaveLength(1); // Hello only, no feedback loop.
  cleanup(); expect(audioState().listening).toBe(false); expect(audioState().beat).toBe(0); expect(midiState().controls).toEqual({});
});
