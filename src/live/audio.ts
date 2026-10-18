import { useSyncExternalStore } from 'react';
import type { AudioBand } from '../features/types';
import { audioLevels, DEFAULT_AUDIO_SETTINGS, normalizeAudioSettings, SILENT_LEVELS, type AudioSettings } from './audio-analysis';
import { detectAudioBeat, SILENT_BEAT } from './audio-beat';

const KEY = 'aether-map.audio-settings';
let selectedDevice = '';
export function selectAudioDevice(deviceId: string) { selectedDevice = deviceId; }
export function selectedAudioDevice() { return selectedDevice; }
function readSettings(): AudioSettings {
  try { return normalizeAudioSettings(JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}); }
  catch { return DEFAULT_AUDIO_SETTINGS; }
}
interface AudioState {
  beat: number;
  levels: Record<AudioBand, number>;
  listening: boolean;
  status: string;
  settings: AudioSettings;
}
let state: AudioState = { beat: 0, levels: SILENT_LEVELS, listening: false, status: 'Audio is off', settings: readSettings() };
const listeners = new Set<() => void>();
const publish = (next: AudioState) => { state = next; for (const fn of listeners) fn(); };
export const subscribeAudio = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const audioState = () => state;
export function useAudio() { return useSyncExternalStore(subscribeAudio, audioState); }
export function configureAudio(patch: Partial<AudioSettings>): void {
  const settings = normalizeAudioSettings({ ...state.settings, ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Device-local preference. */ }
  publish({ ...state, settings });
}
let context: AudioContext | null = null;
let stream: MediaStream | null = null;
let frame = 0, generation = 0, starting = false;

/** Only an explicit user action may request the microphone. Stopping invalidates pending permission requests. */
export async function startAudio(deviceId = selectedDevice): Promise<void> {
  if (state.listening || starting) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    publish({ ...state, status: 'Audio input needs HTTPS or localhost and a browser with microphone support.' });
    return;
  }
  const request = ++generation; starting = true;
  publish({ ...state, status: 'Requesting microphone…' });
  let acquired: MediaStream | undefined;
  try {
    acquired = await navigator.mediaDevices.getUserMedia({ audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    } });
    if (request !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    const current = new AudioContext(); context = current;
    await current.resume();
    if (request !== generation) return;
    const analyser = current.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
    current.createMediaStreamSource(stream).connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    let held = { ...SILENT_LEVELS }, lastMs = performance.now(), beat = { ...SILENT_BEAT };
    const read = (nowMs: number) => {
      if (request !== generation) return;
      analyser.getByteFrequencyData(bins);
      const dt = (nowMs - lastMs) / 1000;
      const raw = audioLevels(bins, current.sampleRate, SILENT_LEVELS, { ...state.settings, smoothing: 0 }, dt);
      beat = detectAudioBeat(beat, Math.max(raw.low, raw.level), dt);
      held = audioLevels(bins, current.sampleRate, held, state.settings, dt); lastMs = nowMs;
      publish({ ...state, beat: beat.pulse, levels: held, listening: true, status: 'Listening' });
      frame = requestAnimationFrame(read);
    };
    publish({ ...state, levels: held, listening: true, status: 'Listening' });
    frame = requestAnimationFrame(read);
  } catch (problem) {
    acquired?.getTracks().forEach(track => track.stop());
    if (request === generation) {
      stopAudio(); publish({ ...state, status: (problem as Error).message || 'No audio input.' });
    }
  } finally { if (request === generation) starting = false; }
}
export function stopAudio(): void {
  generation++; starting = false;
  cancelAnimationFrame(frame); frame = 0;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  void context?.close().catch(() => {}); context = null;
  publish({ ...state, beat: 0, levels: SILENT_LEVELS, listening: false, status: 'Audio is off' });
}

/** Clean output windows consume the editor's levels without requesting another microphone. */
export function setOutputAudio(levels: Record<AudioBand, number>, listening: boolean, beat = 0): void {
  publish({ ...state, beat: listening && Number.isFinite(beat) ? Math.max(0, Math.min(1, beat)) : 0,
    levels: listening ? { ...levels } : SILENT_LEVELS, listening, status: listening ? 'Following editor audio' : 'Audio is off' });
}
