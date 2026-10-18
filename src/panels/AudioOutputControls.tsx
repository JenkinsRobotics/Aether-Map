import { AetherIcon, IconButton, Slider } from '@aether/ui';
import { readAudioOutput, type AudioOutput } from '../audio-output';
export function AudioOutputControls({ value, onChange }: { value?: AudioOutput; onChange:(value:AudioOutput) => void }) {
  const output = readAudioOutput(value);
  return <div className="map-master-audio" role="group" aria-label="Master output audio">
    <IconButton appearance="plain" label={output.muted ? 'Unmute master output' : 'Mute master output'} aria-pressed={output.muted} onClick={() => onChange({ ...output, muted:!output.muted })}><AetherIcon name="audio" /></IconButton>
    <span className="map-master-volume"><Slider ariaLabel="Master output volume" min={0} max={100} step={1} value={Math.round(output.volume*100)} onChange={volume => onChange({ ...output, volume:volume/100 })} showValue={false} /></span>
    <output title="Master output volume">{Math.round(output.volume*100)}%</output>
    <IconButton appearance="plain" label="Dim master output by 20 dB" aria-pressed={output.dimmed} onClick={() => onChange({ ...output, dimmed:!output.dimmed })}><span className="map-control-letter">DIM</span></IconButton>
  </div>;
}
