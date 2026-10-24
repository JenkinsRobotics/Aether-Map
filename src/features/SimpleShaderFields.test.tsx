// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SimpleShaderFields } from './SimpleShaderFields';
import { newShader } from './shader-catalog';
afterEach(cleanup);
test('simple color and motion edits retain advanced modulation, stored looks and unrelated parameters', () => {
  const shader = { ...newShader('synthwave'), parameters: { ...newShader('synthwave').parameters, rotation: 23 }, modulation: { glow: { source: 'time' as const, amount: 1, periodS: 4, waveform: 'sine' as const, phase: 0 } } };
  const onChange = vi.fn(); render(<SimpleShaderFields shader={shader} onChange={onChange} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Visual direction' }), { target: { value: 'reverse' } });
  const next = onChange.mock.calls.at(-1)![0];
  expect(next.time.direction).toBe('reverse'); expect(next.parameters.rotation).toBe(23);
  expect(next.modulation).toEqual(shader.modulation); expect(next.colors).toEqual(shader.colors);
  expect(screen.queryByRole('button', { name: 'Animate a parameter' })).toBeNull();
});

test('Simple exposes real persisted presets, tempo and clearable parameter modulation', () => {
  function Harness() { const [shader,setShader]=useState(newShader('synthwave')); return <><SimpleShaderFields shader={shader} onChange={setShader}/><output data-testid="shader">{JSON.stringify(shader)}</output></>; }
  render(<Harness/>);
  const shader=()=>JSON.parse(screen.getByTestId('shader').textContent!);
  fireEvent.click(screen.getByRole('button',{name:'Store preset A'})); const saved=shader().looks.A;
  fireEvent.click(screen.getByRole('button',{name:'Random'}));
  fireEvent.click(screen.getByRole('button',{name:'Recall preset A'}));
  expect(shader().colors).toEqual(saved.colors); expect(shader().parameters).toEqual(saved.parameters);
  fireEvent.click(screen.getByRole('button',{name:'Audio, tempo & modulation'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Audio response preset'}),{target:{value:'tempo'}});
  expect(shader().modulation.scale.clock).toBe('scene'); expect(shader().modulation.scale.periodS).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button',{name:'Clear Overall scale modulation'}));
  expect(shader().modulation.scale).toBeUndefined();
  fireEvent.change(screen.getByRole('combobox',{name:'Animate visual parameter'}),{target:{value:'glow'}});
  expect(shader().modulation.glow.range).toBeTruthy();
});

 test('negative advanced parameters get ordered modulation ranges in Simple mode', () => {
  const shader = newShader('synthwave'); shader.parameters.rotation = -45;
  const change = vi.fn(); render(<SimpleShaderFields shader={shader} onChange={change}/>);
  fireEvent.click(screen.getByRole('button',{name:'Audio, tempo & modulation'}));
  fireEvent.change(screen.getByRole('combobox',{name:'Animate visual parameter'}),{target:{value:'rotation'}});
  expect(change.mock.calls.at(-1)![0].modulation.rotation.range).toEqual({min:-45,max:0});
});


test('new generators expose their meaningful controls with usable numeric precision',()=>{
 const onChange=vi.fn();render(<SimpleShaderFields shader={newShader('electric-storm')} onChange={onChange}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'Visual width'}),{target:{value:'0.0035'}});
 fireEvent.blur(screen.getByRole('textbox',{name:'Visual width'}));
 expect(onChange.mock.calls.at(-1)![0].parameters.width).toBe(.0035);
 fireEvent.change(screen.getByRole('textbox',{name:'Visual bolts'}),{target:{value:'4'}});
 fireEvent.blur(screen.getByRole('textbox',{name:'Visual bolts'}));
 expect(onChange.mock.calls.at(-1)![0].parameters.bolts).toBe(4);
});
