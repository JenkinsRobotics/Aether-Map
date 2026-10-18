import { useState } from 'react';
import { AetherIcon, Button, Dialog, FieldRow, Inspector, SelectField } from '@aether/ui';
import { configureMidi, startMidi, stopMidi, startMidiFeedback, stopMidiFeedback, useMidi } from './midi';
import { launchControlXLPort } from './launch-control-xl';

export function MidiControls() {
  const midi = useMidi();
  const outputs = midi.outputs.filter(p => launchControlXLPort(p.name));
  return <section aria-label="MIDI setup">
    <Button onClick={() => midi.connected || midi.starting ? stopMidi() : void startMidi()}>{midi.starting ? 'Cancel MIDI connection' : midi.connected ? 'Stop MIDI' : 'Start MIDI'}</Button>
    <p role="status">{midi.status}</p>
    <FieldRow label="Input"><SelectField aria-label="MIDI input" value={midi.settings.inputId} disabled={!midi.connected}
      options={[{ value: '', label: 'All MIDI inputs' }, ...midi.inputs.map(p => ({ value: p.id, label: p.name })),
        ...(midi.settings.inputId && !midi.inputs.some(p => p.id === midi.settings.inputId) ? [{ value: midi.settings.inputId, label: 'Selected input disconnected' }] : [])]}
      onChange={e => configureMidi({ inputId: e.target.value })}/></FieldRow>
    <p className="map-hint">Open a parameter’s Motion controls, choose MIDI fader, then MIDI Learn and move a knob. Assignments are saved with the show; device connections stay in this window.</p>
    {midi.lastControl !== null && <p>Last input: CC {midi.lastControl}, channel {(midi.lastChannel ?? 0) + 1} · {Math.round((midi.controls[midi.lastControl] ?? 0) * 100)}%</p>}
    <h3>Launch Control XL lights</h3>
    <p className="map-hint">For MK1/MK2. Choose the controller’s MIDI output and the LED channel used by its current template. XL3 uses a different feedback protocol.</p>
    <FieldRow label="Output"><SelectField aria-label="MIDI feedback output" value={midi.settings.outputId} disabled={!midi.connected}
      options={[{ value: '', label: 'Choose Launch Control XL…' }, ...outputs.map(p => ({ value: p.id, label: p.name })),
        ...(midi.settings.outputId && !outputs.some(p => p.id === midi.settings.outputId) ? [{ value: midi.settings.outputId, label: 'Selected output disconnected' }] : [])]}
      onChange={e => configureMidi({ outputId: e.target.value })}/></FieldRow>
    <FieldRow label="LED channel"><SelectField aria-label="MIDI feedback channel" value={String(midi.settings.channel)} options={Array.from({ length: 16 }, (_, i) => ({ value: String(i), label: String(i + 1) }))}
      onChange={e => configureMidi({ channel: Number(e.target.value) })}/></FieldRow>
    {midi.lastChannel !== null && midi.lastChannel !== midi.settings.channel && <Button onClick={() => configureMidi({ channel: midi.lastChannel! })}>Use last input channel ({midi.lastChannel + 1})</Button>}
    <Button disabled={!midi.connected || (!midi.feedback && !outputs.some(p => p.id === midi.settings.outputId))} aria-pressed={midi.feedback}
      onClick={() => midi.feedback ? stopMidiFeedback() : startMidiFeedback()}>{midi.feedback ? 'Stop controller lights' : 'Enable controller lights'}</Button>
    <p role="status">{midi.feedbackStatus}</p>
    <p className="map-hint">Green: assigned in this show. Amber: assigned to the selected visual. Brighter: higher input value. Only mapped controls are lit; faders have no LEDs. Stop clears the lights set by this window.</p>
    {!outputs.length && midi.connected && <p className="map-hint">No Launch Control XL MIDI output found. Connect it by USB and choose its normal MIDI port. MIDI input can still be used without lights.</p>}
  </section>;
}
/** Always reachable in both editors and Performance, even after closing Motion. */
export function MidiControlsButton() {
  const [open, setOpen] = useState(false), midi = useMidi();
  return <><Button title={midi.status} onClick={() => setOpen(true)}><AetherIcon name="slider"/>MIDI{midi.connected ? ' on' : ''}</Button>
    {open && <Dialog open title="MIDI controllers" onClose={() => setOpen(false)}><Inspector><MidiControls/></Inspector></Dialog>}</>;
}
