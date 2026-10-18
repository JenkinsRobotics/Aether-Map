import { useState } from 'react';
import { AetherIcon, Button, FieldRow, IconButton, Inspector, InspectorSection, NumberField, SelectField, Slider, Tabs } from '@aether/ui';
import { type MapShow, type Scene } from '../document';
import { formatTime } from '../cues';
import { installerURL } from '../api';
import { describeSchedule } from '../output-schedule';
import { useMapDevices } from '../use-map-devices';
import { DeviceManager } from './DeviceManager';
import { ExportWorkspace } from './WorkspaceTray';
import { ShowPreview } from './ShowPreview';
import { RECORDING_SIZES, startRecording, stopRecording, useRecording, type RecordingSize } from '../export-video';
import './ShowWorkspace.css';

export function ShowWorkspace({show,name,documentID,dirty,urls,selectedOutputID,onSelectOutput,onAddOutput,onOpenOutput,onSave,onExportProject,onExportWireframe,onEdit,onPatchScene,timeS,playing,onPlay,onSeek}: {
  show:MapShow;name:string;documentID:string|null;dirty:boolean;urls:Record<string,string>;selectedOutputID:string|null;
  onSelectOutput:(id:string)=>void;onAddOutput:()=>void;onOpenOutput:(id:string)=>void;onSave:()=>void;
  onExportProject:()=>void;onExportWireframe:()=>void;onEdit:(next:MapShow)=>void;
  onPatchScene:(id:string,patch:Partial<Scene>)=>void;
  timeS:number;playing:boolean;onPlay:()=>void;onSeek:(time:number)=>void;
}) {
  const [tab,setTab]=useState('show'), [recordingSize,setRecordingSize]=useState<RecordingSize>('1080p');
  const {list}=useMapDevices(), recording=useRecording();
  const output=show.outputs.find(o=>o.id===selectedOutputID)??show.outputs[0];
  const showScene=show.scenes.find(s=>s.id===output?.sceneId);
  return <section className="map-show-workspace" aria-label="Show workspace">
    <header className="map-show-heading"><div><h2>{name}</h2><span>Main timelines · {show.scenes.length} scene{show.scenes.length===1?'':'s'} · {show.outputs.length} outputs</span></div>
      <Button onClick={onSave}>{!documentID?'Save show':dirty?'Save changes':'Save'}</Button></header>
    <Tabs tabs={[{id:'show',label:'Show'},{id:'players',label:'Players'},{id:'export',label:'Export'}]} activeID={tab} onSelect={setTab}/>
    <div className="map-show-body">
    {tab==='show' ? <div className="map-show-overview">
      <div className="map-show-program"><ShowPreview show={show} output={output} urls={urls} timeS={timeS} playing={playing}/>
        <div className="map-show-transport" role="toolbar" aria-label="Rehearsal controls">
          <IconButton label="Restart rehearsal" disabled={!showScene} onClick={()=>onSeek(0)}><AetherIcon name="undo"/></IconButton>
          <IconButton label={playing?'Pause rehearsal':'Play rehearsal'} disabled={!showScene&&!playing} onClick={onPlay}><AetherIcon name={playing?'pause':'play'}/></IconButton>
          <span>{formatTime(timeS)}</span><Slider ariaLabel="Rehearsal position" disabled={!showScene} min={0} max={Math.max(1,showScene?.durationS??0)} step={.1} value={timeS} onChange={onSeek}/>
        </div>
        <p className="map-hint">Preview · {output?.name??'No output'} · {showScene?.name??'No scene assigned'}. Rehearsal controls this computer; paired players follow their saved playback rules.</p>
        <section className="map-show-outputs" aria-label="Show outputs"><div className="map-show-section-heading"><h3>Outputs</h3><Button onClick={onAddOutput}>Add output</Button></div>
          {!show.outputs.length&&<p className="map-hint">Add an output, choose its scene, then connect a display or player.</p>}
          {show.outputs.map(entry=><div className="map-show-output-row" key={entry.id} data-selected={entry.id===output?.id}>
            <button className="map-show-output-select" aria-label={`Configure ${entry.name}`} aria-pressed={entry.id===output?.id} onClick={()=>{onSelectOutput(entry.id);}}>
              <AetherIcon name="window"/><span><strong>{entry.name}</strong><small>{show.scenes.find(s=>s.id===entry.sceneId)?.name??'No scene'} · {entry.kind==='edge'?(list.find(d=>d.id===entry.deviceId)?.name??'Choose a player'):entry.kind==='monitor'?'Display window':'Wireless'} · {describeSchedule(entry.schedule)}</small></span>
            </button><Button onClick={()=>entry.kind==='edge'?setTab('players'):onOpenOutput(entry.id)}>{entry.kind==='edge'?'Deploy':'Open output'}</Button>
          </div>)}
        </section>
      </div>
      <Inspector className="map-show-rules"><InspectorSection title="Playback rules">
        <FieldRow label="Scene"><SelectField aria-label="Playback scene" disabled={!output} value={showScene?.id??''} options={[{value:'',label:'No scene assigned'},...show.scenes.map(s=>({value:s.id,label:s.name}))]} onChange={e=>output?onEdit({...show,outputs:show.outputs.map(o=>o.id===output.id?{...o,sceneId:e.target.value||undefined}:o)}):undefined}/></FieldRow>
        <FieldRow label="Main length"><NumberField aria-label="Main show length" disabled={!showScene} value={showScene?.durationS??0} min={.1} unit="s" onValueChange={v=>v!==null&&showScene&&onPatchScene(showScene.id,{durationS:v})}/></FieldRow>
        <FieldRow label="Playback"><SelectField aria-label="Show playback" value={show.playback.mode} options={[{value:'loop',label:'Loop Main'},{value:'once',label:'Play once · hold end'},{value:'continuous',label:'Continuous'}]} onChange={e=>onEdit({...show,playback:{...show.playback,mode:e.target.value as MapShow['playback']['mode']}})}/></FieldRow>
        <p className="map-hint">A player starts automatically after deployment or boot. Set its start/end times and days in the selected output’s Properties. Schedules use the player’s local clock.</p>
        <FieldRow label="Blackout"><Button aria-label="Show blackout" aria-pressed={!!show.output.blackout} onClick={()=>onEdit({...show,output:{...show.output,blackout:!show.output.blackout}})}>{show.output.blackout?'On':'Off'}</Button></FieldRow>
      </InspectorSection><InspectorSection title="Delivery">
        <p className="map-hint">The player downloads the saved show, media and renderer, then renders the mapped surfaces locally. It keeps the last complete show when the network or editor is unavailable.</p>
        <Button onClick={()=>setTab('players')}>Set up or deploy a player</Button>
        <p className="map-hint">Assigned players follow saved updates automatically. Editing and saving an assigned show can update the live installation.</p>
      </InspectorSection></Inspector>
    </div> : tab==='players' ? <>
      <h3>Player devices</h3><p className="map-hint">Raspberry Pi and devices running Aether Player. Other IoT protocols are not connected here yet.</p>
      <DeviceManager show={show} documentID={documentID} dirty={dirty} installerURL={installerURL()}/>
    </> : <>
      <h3>Export & recording</h3><p className="map-hint">Deploy directly from Players for unattended playback. Project bundles preserve editable content; recording captures a rendered output.</p>
      <Inspector><InspectorSection title="Record an output">
        <FieldRow label="Resolution"><SelectField aria-label="Show recording resolution" value={recordingSize} disabled={recording.recording} options={Object.entries(RECORDING_SIZES).map(([value,s])=>({value,label:s.label}))} onChange={e=>setRecordingSize(e.target.value as RecordingSize)}/></FieldRow>
        <div className="map-show-actions"><Button disabled={!output||output.kind==='edge'} onClick={()=>output&&onOpenOutput(output.id)}>Open output to record</Button>
        <Button onClick={()=>recording.recording?stopRecording():void startRecording(name,recordingSize)}>{recording.recording?'Stop recording':'Record output…'}</Button></div>
        <p className="map-hint" role="status">{recording.status}. Choose the output window in the browser’s capture picker.</p>
      </InspectorSection></Inspector>
      <ExportWorkspace show={show} mediaUrls={urls} documentID={documentID} dirty={dirty} onExportProject={onExportProject} onExportWireframe={onExportWireframe}/>
    </>}
    </div>
  </section>;
}
