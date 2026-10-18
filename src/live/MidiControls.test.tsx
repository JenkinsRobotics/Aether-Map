// @vitest-environment jsdom
import {useEffect,useState} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {MidiControlsButton} from './MidiControls';
import {ModulationFields} from '../features/ModulationFields';
import {DEFAULT_MODULATION} from '../features/types';
import {configureMidi,midiState,setMidiAssignments,stopMidi} from './midi';

beforeEach(()=>{stopMidi();configureMidi({inputId:'',outputId:'',channel:0});setMidiAssignments([]);});
afterEach(()=>{cleanup();stopMidi();vi.unstubAllGlobals();});
function fake(){
 const input={id:'in',name:'Launch Control XL',state:'connected',onmidimessage:null as ((event:{data:Uint8Array})=>void)|null};
 const output={id:'out',name:'Launch Control XL',state:'connected',send:vi.fn()};
 const access={inputs:new Map([[input.id,input]]),outputs:new Map([[output.id,output]]),onstatechange:null};
 const request=vi.fn().mockResolvedValue(access);vi.stubGlobal('navigator',{requestMIDIAccess:request});return {input,output,request};
}
test('shared setup opens without permissions; explicit start, output/channel choice and enable send real protocol bytes',async()=>{
 const f=fake();setMidiAssignments([13],[13]);render(<MidiControlsButton/>);
 fireEvent.click(screen.getByRole('button',{name:'MIDI'}));expect(f.request).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Start MIDI'}));await waitFor(()=>expect(midiState().connected).toBe(true));
 fireEvent.change(screen.getByRole('combobox',{name:'MIDI feedback output'}),{target:{value:'out'}});
 fireEvent.change(screen.getByRole('combobox',{name:'MIDI feedback channel'}),{target:{value:'8'}});
 expect(f.output.send).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Enable controller lights'}));
 expect(f.output.send).toHaveBeenLastCalledWith([152,13,29]);
 fireEvent.click(screen.getByRole('button',{name:'Stop MIDI'}));expect(f.output.send).toHaveBeenLastCalledWith([152,13,12]);expect(midiState().feedback).toBe(false);
});
test('MIDI Learn still assigns the next CC through the shared parameter model, with accessible setup and channel shortcut',async()=>{
 const f=fake();
 function Harness(){const [value,setValue]=useState({...DEFAULT_MODULATION,source:'midi' as const,control:1});
  useEffect(()=>{setMidiAssignments([value.control],[value.control]);},[value.control]);
  return <ModulationFields label="Glow" base={1} value={value} onChange={v=>v&&setValue({...value,...v,source:'midi'})}/>;
 }
 render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'MIDI Learn'}));await waitFor(()=>expect(f.input.onmidimessage).not.toBeNull());
 act(()=>f.input.onmidimessage?.({data:new Uint8Array([184,27,100])}));
 expect(Number((screen.getByRole('textbox',{name:'Glow controller'}) as HTMLInputElement).value)).toBe(27);expect(midiState().assigned).toEqual([27]);
 fireEvent.click(screen.getByText('Configure MIDI'));fireEvent.click(screen.getByRole('button',{name:'Use last input channel (9)'}));
 expect(midiState().settings.channel).toBe(8);expect(f.output.send).not.toHaveBeenCalled();
});
