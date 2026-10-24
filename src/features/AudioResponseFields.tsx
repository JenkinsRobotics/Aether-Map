import { AetherIcon, Button, FieldRow, InspectorSection, ParameterRow, SelectField } from '@aether/ui';
import { startAudio, stopAudio, useAudio } from '../live/audio';
import { AudioControls } from '../live/AudioControls';
import { applyAudioResponse, type AudioResponse } from './audio-response';
import type { ShaderSource } from './types';
import { modulationLabel } from './shader-parameter-controls';

export function AudioResponseFields({ shader, onChange }: { shader: ShaderSource; onChange: (shader: ShaderSource) => void }) {
  const audio = useAudio();
  const cycle = shader.modulation?.scale;
  const tempo = cycle && (!cycle.source || cycle.source === 'time') && cycle.periodS > 0 ? 60 / cycle.periodS : null;
  const responses = [...new Set(Object.values(shader.modulation ?? {}).filter(value => value.source === 'audio').map(modulationLabel))];
  return <section aria-label="Audio reactive visualization">
    <InspectorSection title="Audio response">
    <FieldRow label="Quick setup" help="Assigns scale or rotation to sound. Fine-tune or clear each assignment in its modulation controls.">
      <SelectField aria-label="Audio response preset" value="" placeholder="Choose a response…"
        options={[{ value: 'beat', label: 'Beat pulse' }, { value: 'bass', label: 'Bass pulse' },
          { value: 'treble', label: 'Treble shimmer' }, { value: 'mix', label: 'Full mix' }, { value: 'tempo', label: 'Tempo pulse (BPM)' }]}
        onChange={event => event.target.value && onChange(applyAudioResponse(shader, event.target.value as AudioResponse))} />
    </FieldRow>
    {responses.length > 0 && <p className="map-hint">Assigned audio: {responses.join(', ')}</p>}
    {tempo !== null && <ParameterRow label="Tempo" ariaLabel="Visual tempo" icon={<AetherIcon name="history" />}
      help="Manual pulse tempo. Press Play to run it on the scene clock."
      value={Math.round(tempo * 100) / 100} min={30} max={240} unit="BPM" sliderRange={{ min: 30, max: 240 }}
      onChange={bpm => onChange({ ...shader, modulation: { ...shader.modulation, scale: { ...cycle!, periodS: 60 / bpm } } })} />}
    <FieldRow label="Microphone"><Button aria-pressed={audio.listening} title={audio.status} onClick={() => audio.listening ? stopAudio() : void startAudio()}>
      <AetherIcon name="audio" />{audio.listening ? 'Audio on' : 'Audio off'}
    </Button></FieldRow>
    <p className="map-hint" role="status">{audio.status}</p>
    <FieldRow label="Input level"><meter className="map-audio-meter" aria-label="Visual audio input level" min={0} max={1} value={audio.levels.level} /></FieldRow>
    <FieldRow label="Beat pulse"><meter className="map-audio-meter" aria-label="Detected beat pulse" min={0} max={1} value={audio.beat} /></FieldRow>
    <AudioControls />
    </InspectorSection>
  </section>;
}
