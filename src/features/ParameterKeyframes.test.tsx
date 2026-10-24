// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { ParameterKeyframes } from './ParameterKeyframes';
import type { FeatureKeyframe } from './types';
afterEach(cleanup);
test('add, select, move, replace, remove and clear real keys with accessible controls', () => {
  function Harness(){const [keys,setKeys]=useState<FeatureKeyframe[]>();return <><ParameterKeyframes label="Blur" base={10} keys={keys} timeS={2} min={0} max={100} onChange={setKeys}/><output data-testid="keys">{JSON.stringify(keys ?? [])}</output></>;}
  render(<Harness/>);
  const keys=()=>JSON.parse(screen.getByTestId('keys').textContent!);
  const field=(name:string,value:string)=>{const input=screen.getByRole('textbox',{name});fireEvent.focus(input);fireEvent.change(input,{target:{value}});fireEvent.blur(input);};
  field('Blur keyframe time','0'); field('Blur keyframe value','20'); fireEvent.click(screen.getByRole('button',{name:'Add keyframe'}));
  fireEvent.click(screen.getByRole('button',{name:'New keyframe'}));field('Blur keyframe value','80');fireEvent.click(screen.getByRole('button',{name:'Add keyframe'}));
  expect(keys().map((k:FeatureKeyframe)=>[k.timeS,k.value])).toEqual([[0,20],[2,80]]);
  fireEvent.keyDown(screen.getByRole('button',{name:'Select Blur keyframe at 0s'}),{key:'Enter'});
  field('Blur keyframe time','1');fireEvent.change(screen.getByRole('combobox',{name:'Blur keyframe curve'}),{target:{value:'hold'}});fireEvent.click(screen.getByRole('button',{name:'Update keyframe'}));
  expect(keys()[0]).toMatchObject({timeS:1,value:20,interpolation:'hold'});
  field('Blur keyframe time','2');fireEvent.click(screen.getByRole('button',{name:'Update keyframe'}));expect(keys()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Remove keyframe'}));expect(keys()).toEqual([]);
  fireEvent.click(screen.getByRole('button',{name:'Use playhead'}));fireEvent.click(screen.getByRole('button',{name:'Add keyframe'}));
  expect(keys()[0]).toMatchObject({timeS:2,value:10});fireEvent.click(screen.getByRole('button',{name:'Clear keyframes'}));expect(keys()).toEqual([]);
});

test('undo and redo refresh the selected key without requiring reselection', () => {
  const keys: FeatureKeyframe[]=[{id:'a',timeS:2,value:30,interpolation:'linear'}];
  const {rerender}=render(<ParameterKeyframes label="Zoom" base={0} keys={keys} timeS={0} onChange={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Select Zoom keyframe at 2s'}));
  rerender(<ParameterKeyframes label="Zoom" base={0} keys={[{...keys[0],value:10}]} timeS={0} onChange={()=>{}}/>);
  expect((screen.getByRole('textbox',{name:'Zoom keyframe value'}) as HTMLInputElement).value).toBe('10');
  rerender(<ParameterKeyframes label="Zoom" base={0} keys={keys} timeS={0} onChange={()=>{}}/>);
  expect((screen.getByRole('textbox',{name:'Zoom keyframe value'}) as HTMLInputElement).value).toBe('30');
});
