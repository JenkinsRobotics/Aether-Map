import type { AudioBand } from '../features/types';

export interface AudioSettings { sensitivity: number; smoothing: number }
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { sensitivity: 1, smoothing: .6 };
export function normalizeAudioSettings(value: Partial<AudioSettings>): AudioSettings {
  const clamp = (v: unknown, fallback: number, low: number, high: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(low, Math.min(high, v)) : fallback;
  return { sensitivity: clamp(value.sensitivity, 1, .1, 10), smoothing: clamp(value.smoothing, .6, 0, 1) };
}
export const SILENT_LEVELS: Record<AudioBand, number> = { low: 0, mid: 0, high: 0, level: 0 };
/** Bands use Hz, so switching sample rate or FFT size cannot retune a show. */
export function audioLevels(bins: Uint8Array, sampleRate: number, previous: Record<AudioBand, number>, settings: AudioSettings, elapsedS: number): Record<AudioBand, number> {
  const levels = { ...SILENT_LEVELS };
  const stepHz = sampleRate / (2 * Math.max(1, bins.length));
  const ranges = { low: [20, 250], mid: [250, 4000], high: [4000, 20000], level: [20, 20000] };
  const decay = settings.smoothing === 0 ? 0 : Math.exp(-Math.max(0, elapsedS) / (settings.smoothing * .6));
  for (const band of Object.keys(ranges) as AudioBand[]) {
    const [low, high] = ranges[band];
    const start = Math.min(bins.length, Math.ceil(low / stepHz)), end = Math.min(bins.length, Math.ceil(high / stepHz));
    let sum = 0;
    for (let i = start; i < end; i++) sum += bins[i] / 255;
    const target = Math.min(1, sum / Math.max(1, end - start) * settings.sensitivity);
    levels[band] = Math.max(target, previous[band] * decay);
  }
  return levels;
}
