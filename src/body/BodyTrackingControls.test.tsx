// @vitest-environment jsdom
import { useState } from 'react';
import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,expect,test,vi } from 'vitest';
import { ModulationFields } from '../features/ModulationFields';
import { DEFAULT_MODULATION,type ShaderModulation } from '../features/types';
import { stopBodyTracking } from './runtime';
function Harness(){const [value,setValue]=useState<ShaderModulation|undefined>(DEFAULT_MODULATION);return value&&<ModulationFields label="Zoom" base={20} value={value} onChange={setValue}/>;}
afterEach(()=>{cleanup();stopBodyTracking();vi.unstubAllGlobals();});
test('assigning a body signal does not open a camera; the explicit button reports permission denial',async()=>{
 const getUserMedia=vi.fn().mockRejectedValue(new Error('Permission denied'));
 vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});render(<Harness/>);
 fireEvent.change(screen.getByRole('combobox',{name:'Zoom source'}),{target:{value:'body'}});
 fireEvent.change(screen.getByRole('combobox',{name:'Zoom body signal'}),{target:{value:'spread'}});
 expect((screen.getByRole('combobox',{name:'Zoom body signal'}) as HTMLSelectElement).value).toBe('spread');
 expect(getUserMedia).not.toHaveBeenCalled();
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Start body tracking'}));});
 expect(getUserMedia).toHaveBeenCalledOnce();expect(screen.getByRole('status').textContent).toContain('Permission denied');
});
