import { useState } from 'react';
import { AetherIcon, Button, Dialog, FieldRow, IconButton, TextField } from '@aether/ui';
import type { MapShow } from '../document';
import { currentTimelineID, MAIN_TIMELINE } from '../timelines';
export function TimelineTabs({ show, onOpen, onCreate }: { show:MapShow; onOpen:(id:string) => void; onCreate:(name:string) => void }) {
  const [name, setName] = useState<string | null>(null);
  const advanced = show.timelineMode === 'advanced';
  const tabs = [{ id:MAIN_TIMELINE, name:'Main' }, ...(show.timelines ?? []).filter(t => t.sceneID === show.activeSceneId && (advanced || t.surfaceID))];
  const create = () => { if (name?.trim()) { onCreate(name.trim()); setName(null); } };
  return <>
    <div className="map-sequence-tabs-row">
      <div className="map-sequence-tabs" role="tablist" aria-label="Timelines" onKeyDown={event => {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')), index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        const next = event.key === 'ArrowRight' ? (index+1)%buttons.length : event.key === 'ArrowLeft' ? (index+buttons.length-1)%buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : -1;
        if (next >= 0) { event.preventDefault(); buttons[next].focus(); buttons[next].click(); }
      }}>
        {tabs.map(tab => <button type="button" role="tab" key={tab.id} aria-selected={currentTimelineID(show) === tab.id} tabIndex={currentTimelineID(show) === tab.id ? 0 : -1} onClick={() => onOpen(tab.id)}><AetherIcon name="timeline-tracks" /><span>{tab.name}</span></button>)}
      </div>
      {advanced && <IconButton appearance="plain" label="New timeline" onClick={() => setName(`Timeline ${(show.timelines?.length ?? 0)+1}`)}><AetherIcon name="plus" /></IconButton>}
    </div>
    <Dialog open={name !== null} title="New timeline" onClose={() => setName(null)} actions={<><Button onClick={() => setName(null)}>Cancel</Button><Button primary disabled={!name?.trim()} onClick={create}>Create</Button></>}>
      <FieldRow label="Name"><TextField aria-label="Timeline name" value={name ?? ''} onChange={e => setName(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') create(); }} /></FieldRow>
    </Dialog>
  </>;
}
