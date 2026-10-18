import { useState } from 'react';
import { AetherIcon,Button,IconButton,MenuButton } from '@aether/ui';
import type { MapShow } from '../document';
import type { Visual } from '../visual-model';
import { VISUAL_LOOK_SLOTS,hasVisualLook,storeVisualLook,recallVisualLook,clearVisualLook,randomVisualLook } from '../visual-looks';

/** Full appearance presets share the same operations in every editing mode. */
export function VisualPresetFields({show,visual,onChange}:{show:MapShow;visual:Visual;onChange:(visual:Visual,key?:string|null)=>void}){
 const [notice,setNotice]=useState('');
 const apply=(operation:()=>Visual,message:string)=>{try{onChange(operation(),null);setNotice(message);}catch(error){setNotice(error instanceof Error?error.message:'Could not update this preset.');}};
 const other=(show.visuals??[]).filter(v=>v.id!==visual.id&&!v.mask&&!v.timelineRefID&&show.tracks?.find(t=>t.id===v.trackID)?.kind!=='audio')
  .flatMap(v=>VISUAL_LOOK_SLOTS.filter(slot=>hasVisualLook(show,v,slot)).map(slot=>({id:JSON.stringify([v.id,slot]),label:`${v.name} · ${slot}`,visual:v,slot})));
 const stored=VISUAL_LOOK_SLOTS.filter(slot=>hasVisualLook(show,visual,slot));
 return <div aria-label="Visual presets">
  <div className="map-feature-buttons" role="group" aria-label="Appearance presets">
   {VISUAL_LOOK_SLOTS.map(slot=><span key={slot}>
    <Button aria-label={`Recall preset ${slot}`} disabled={!hasVisualLook(show,visual,slot)} onClick={()=>apply(()=>recallVisualLook(show,visual,slot),`Recalled preset ${slot}.`)}>{slot}</Button>
    <IconButton label={`Store preset ${slot}`} onClick={()=>apply(()=>storeVisualLook(show,visual,slot),`Stored preset ${slot}.`)}><AetherIcon name="save"/></IconButton>
   </span>)}
   <Button onClick={()=>apply(()=>randomVisualLook(show,visual,Math.floor(Math.random()*0x100000000)),'Randomized appearance. Undo restores the previous look.')}>Random</Button>
   <MenuButton label="Use another visual’s preset" disabled={!other.length} items={other.map(({id,label})=>({id,label}))} onSelect={id=>{const item=other.find(v=>v.id===id);if(item)apply(()=>recallVisualLook(show,visual,item.slot,item.visual),`Applied ${item.label}.`);}}>Use saved look</MenuButton>
   <MenuButton label="Clear a visual preset" disabled={!stored.length} items={stored.map(slot=>({id:slot,label:`Clear preset ${slot}`}))} onSelect={id=>{const slot=VISUAL_LOOK_SLOTS.find(s=>s===id);if(slot)apply(()=>clearVisualLook(show,visual,slot),`Cleared preset ${slot}.`);}}>Clear</MenuButton>
  </div>
  <p className="map-hint">Store source, colors, effects, opacity, fit and motion together. Recall keeps this visual’s timing, surfaces and layer order. Random changes colors and effect amounts.</p>
  {notice&&<p className="map-hint" role="status">{notice}</p>}
 </div>;
}
