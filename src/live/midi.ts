import { useSyncExternalStore } from 'react';
import { launchControlXLMessage, launchControlXLPort } from './launch-control-xl';

export interface MidiDevice { id: string; name: string }
export interface MidiSettings { inputId: string; outputId: string; channel: number }
export interface MidiState {
  eventSerial: number; controls: Record<number, number>; connected: boolean; starting: boolean;
  status: string; lastControl: number | null; lastChannel: number | null;
  inputs: MidiDevice[]; outputs: MidiDevice[]; settings: MidiSettings;
  feedback: boolean; feedbackStatus: string; assigned: number[]; focused: number[];
}
const DEFAULTS: MidiSettings = { inputId: '', outputId: '', channel: 0 };
const IDLE: MidiState = { eventSerial: 0, controls: {}, connected: false, starting: false,
  status: 'MIDI is off', lastControl: null, lastChannel: null, inputs: [], outputs: [], settings: DEFAULTS,
  feedback: false, feedbackStatus: 'Controller lights are off', assigned: [], focused: [] };
let state = IDLE;
const listeners = new Set<() => void>();
const publish = (next: MidiState) => { state = next; for (const fn of listeners) fn(); };
export const subscribeMidi = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const midiState = () => state;
export function useMidi() { return useSyncExternalStore(subscribeMidi, midiState); }

interface Port { id?: string; name?: string; state?: string; close?: () => Promise<unknown> }
interface Input extends Port { onmidimessage: ((event: { data: Uint8Array }) => void) | null }
interface Output extends Port { send: (data: number[]) => void }
interface Access { inputs: { values(): Iterable<Input> }; outputs?: { values(): Iterable<Output> }; onstatechange: (() => void) | null }
let access: Access | null = null, generation = 0, lastInputId: string | null = null;
const attached = new Set<Input>(), inputIDs = new WeakMap<Port, string>();
const values = new Map<string, Map<number, { value: number; serial: number }>>();
let ownedOutput: Output | null = null, feedbackTimer: ReturnType<typeof setTimeout> | undefined;
const sent = new Map<number, number>();
function idOf(port: Port) { let id = port.id ?? inputIDs.get(port); if (!id) { id = crypto.randomUUID(); inputIDs.set(port, id); } return id; }
const present = (port: Port) => port.state !== 'disconnected';
function close(port: Port) { try { void port.close?.().catch(() => {}); } catch { /* Already disconnected. */ } }
function controls() {
  const latest = new Map<number, { value: number; serial: number }>();
  for (const [id, entries] of values) if (!state.settings.inputId || state.settings.inputId === id)
    for (const [cc, entry] of entries) if (entry.serial > (latest.get(cc)?.serial ?? -1)) latest.set(cc, entry);
  return Object.fromEntries([...latest].map(([cc, entry]) => [cc, entry.value]));
}
function clearLights() {
  clearTimeout(feedbackTimer); feedbackTimer = undefined;
  if (ownedOutput) {
    for (const control of sent.keys()) { try { ownedOutput.send(launchControlXLMessage(control, state.settings.channel, 0, false, true)); } catch { break; } }
    close(ownedOutput);
  }
  ownedOutput = null; sent.clear();
}
export function stopMidiFeedback() {
  clearLights(); publish({ ...state, feedback: false, feedbackStatus: 'Controller lights are off' });
}
function flushLights() {
  feedbackTimer = undefined;
  if (!state.feedback || !access || !ownedOutput) return;
  try {
    const desired = new Set(state.assigned), focused = new Set(state.focused);
    for (const control of new Set([...sent.keys(), ...desired])) {
      const message = launchControlXLMessage(control, state.settings.channel, state.controls[control], focused.has(control), !desired.has(control));
      if (sent.get(control) === message[2]) continue;
      ownedOutput.send(message);
      if (desired.has(control)) sent.set(control, message[2]); else sent.delete(control);
    }
  } catch (problem) {
    clearLights(); publish({ ...state, feedback: false, feedbackStatus: `Controller lights stopped: ${(problem as Error).message || 'device unavailable'}` });
  }
}
function scheduleLights() { if (state.feedback && feedbackTimer === undefined) feedbackTimer = setTimeout(flushLights, 25); }
export function startMidiFeedback() {
  if (!access || !state.connected) { publish({ ...state, feedbackStatus: 'Start MIDI before enabling controller lights.' }); return; }
  const output = [...(access.outputs?.values() ?? [])].find(p => idOf(p) === state.settings.outputId && present(p));
  if (!output || !launchControlXLPort(output.name ?? '')) { publish({ ...state, feedbackStatus: 'Choose the Launch Control XL MIDI output, not its HUI/DAW port.' }); return; }
  clearLights(); ownedOutput = output;
  publish({ ...state, feedback: true, feedbackStatus: 'Launch Control XL lights enabled' }); flushLights();
}
export function configureMidi(patch: Partial<MidiSettings>) {
  if ((patch.inputId !== undefined && typeof patch.inputId !== 'string') || (patch.outputId !== undefined && typeof patch.outputId !== 'string') ||
      (patch.channel !== undefined && (!Number.isInteger(patch.channel) || patch.channel < 0 || patch.channel > 15))) throw Error('Invalid MIDI routing.');
  const next = { ...state.settings, ...patch };
  if (JSON.stringify(next) === JSON.stringify(state.settings)) return;
  clearLights();
  const inputChanged = next.inputId !== state.settings.inputId;
  if (inputChanged) { values.clear(); lastInputId = null; }
  publish({ ...state, settings: next, feedback: false, feedbackStatus: 'Routing changed. Enable controller lights when ready.',
    ...(inputChanged ? { controls: {}, lastControl: null, lastChannel: null } : {}) });
}
/** Derived show data only: agent/manual edits share the same assignment feedback. */
export function setMidiAssignments(assigned: readonly number[], focused: readonly number[] = []) {
  const valid = (items: readonly number[]) => [...new Set(items.filter(v => Number.isInteger(v) && v >= 0 && v <= 127))].sort((a, b) => a - b);
  const a = valid(assigned), f = valid(focused).filter(v => a.includes(v));
  if (JSON.stringify([a, f]) === JSON.stringify([state.assigned, state.focused])) return;
  publish({ ...state, assigned: a, focused: f }); scheduleLights();
}
function scan() {
  if (!access) return;
  const inputs = [...access.inputs.values()].filter(present), outputs = [...(access.outputs?.values() ?? [])].filter(present);
  const ids = new Set(inputs.map(idOf));
  for (const input of attached) if (!inputs.includes(input)) { input.onmidimessage = null; attached.delete(input); values.delete(idOf(input)); close(input); }
  for (const id of values.keys()) if (!ids.has(id)) values.delete(id);
  for (const input of inputs) {
    const id = idOf(input); attached.add(input);
    input.onmidimessage = event => {
      if (!access || !attached.has(input) || !present(input) || (state.settings.inputId && state.settings.inputId !== id)) return;
      const [status, control, value] = event.data;
      // Keep the saved CC-only contract. Notes (including LED echoes) never learn.
      if (event.data.length < 3 || (status & 0xf0) !== 0xb0 || control > 127 || value > 127) return;
      lastInputId = id;
      const serial = state.eventSerial + 1, entries = values.get(id) ?? new Map();
      entries.set(control, { value: value / 127, serial }); values.set(id, entries);
      publish({ ...state, controls: controls(), lastControl: control, lastChannel: status & 15, eventSerial: serial }); scheduleLights();
    };
  }
  const available = !state.settings.inputId ? inputs : inputs.filter(p => idOf(p) === state.settings.inputId);
  const lostLastInput = lastInputId !== null && !ids.has(lastInputId);
  if (lostLastInput) lastInputId = null;
  const lostOutput = ownedOutput && !outputs.includes(ownedOutput);
  if (lostOutput) clearLights();
  publish({ ...state, connected: true, starting: false, controls: controls(),
    inputs: inputs.map(p => ({ id: idOf(p), name: p.name ?? 'MIDI input' })), outputs: outputs.map(p => ({ id: idOf(p), name: p.name ?? 'MIDI output' })),
    status: available.length ? `Listening to ${available.map(p => p.name ?? 'input').join(', ')}` : 'No selected MIDI inputs connected',
    ...(!available.length || lostLastInput ? { lastControl: null, lastChannel: null } : {}),
    ...(lostOutput ? { feedback: false, feedbackStatus: 'Controller disconnected. Reconnect and enable lights again.' } : {}) });
  scheduleLights();
}
export async function startMidi(): Promise<void> {
  if (access || state.starting) return;
  const request = (navigator as { requestMIDIAccess?: () => Promise<Access> }).requestMIDIAccess;
  if (!request) { publish({ ...state, status: 'This browser has no Web MIDI. Use Chrome or Edge.' }); return; }
  const token = ++generation; publish({ ...state, starting: true, status: 'Waiting for MIDI permission…' });
  try {
    const granted = await request.call(navigator);
    if (token !== generation) return;
    access = granted; access.onstatechange = scan; scan();
    window.addEventListener('pagehide', stopMidi);
  } catch (problem) { if (token === generation) { stopMidi(); publish({ ...state, status: (problem as Error).message || 'MIDI access was refused.' }); } }
}
export function stopMidi(): void {
  ++generation;
  if (access) access.onstatechange = null; access = null;
  clearLights();
  for (const input of attached) { input.onmidimessage = null; close(input); }
  attached.clear(); values.clear(); lastInputId = null;
  if (typeof window !== 'undefined') window.removeEventListener('pagehide', stopMidi);
  publish({ ...IDLE, settings: state.settings, eventSerial: state.eventSerial, assigned: state.assigned, focused: state.focused });
}
/** Clean output windows follow levels only; never acquire ports or echo LEDs. */
export function setOutputMidi(controls: Record<number, number>, connected: boolean): void {
  if (access || state.starting) return;
  publish({ ...state, controls: connected ? Object.fromEntries(Object.entries(controls).filter(([cc, v]) => Number.isInteger(Number(cc)) && Number(cc) >= 0 && Number(cc) <= 127 && Number.isFinite(v)).map(([cc, v]) => [cc, Math.max(0, Math.min(1, v))])) : {},
    connected, status: connected ? 'Following editor MIDI' : 'MIDI is off' });
}
