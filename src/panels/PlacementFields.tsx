import { Button, FieldRow, InspectorSection, NumberField, SelectField } from '@aether/ui';
import type { Rect } from '../document';
import { alignPlacement, readVisualPlacement, type VisualPlacement } from '../visual-placement';

export function PlacementFields({value,frame,bounds,onChange}:{value?:VisualPlacement;frame:Rect;bounds?:Rect;onChange:(value:VisualPlacement|undefined)=>void}) {
  const p=readVisualPlacement(value);
  return <InspectorSection title="Position & size">
    {([['xPercent','Position X','%'],['yPercent','Position Y','%'],['widthPercent','Width','%'],['heightPercent','Height','%'],['rotationDeg','Rotation','°']] as const).map(([key,label,unit])=><FieldRow key={key} label={label}>
      <NumberField aria-label={`Asset ${label.toLowerCase()}`} value={p[key]} unit={unit} step={1} precision={2} min={(key==='widthPercent'||key==='heightPercent') ? .1 : undefined} onValueChange={v=>v!==null&&onChange(readVisualPlacement({...p,[key]:v}))}/>
    </FieldRow>)}
    {(['x','y'] as const).map(axis=><FieldRow key={axis} label={axis==='x'?'Horizontal':'Vertical'}><SelectField aria-label={axis==='x'?'Align asset horizontally':'Align asset vertically'} value="" options={[{value:'',label:'Align…'},...(['start','center','end'] as const).map((edge,i)=>({value:edge,label:(axis==='x'?['Left','Center','Right']:['Top','Middle','Bottom'])[i]}))]} onChange={e=>e.target.value&&onChange(alignPlacement(p,axis,e.target.value as 'start'|'center'|'end',frame,bounds))}/></FieldRow>)}
    <Button onClick={()=>onChange(undefined)}>Reset placement</Button>
  </InspectorSection>;
}
