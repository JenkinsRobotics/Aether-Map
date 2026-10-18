export interface AudioOutput { volume: number; muted: boolean; dimmed: boolean }
export function readAudioOutput(raw: unknown): AudioOutput {
  const value = raw && typeof raw === 'object' ? raw as Partial<AudioOutput> : {};
  return { volume: typeof value.volume === 'number' && Number.isFinite(value.volume) ? Math.max(0, Math.min(1, value.volume)) : 1,
    muted: value.muted === true, dimmed: value.dimmed === true };
}
/** DIM lowers the soundtrack by 20 dB without changing the stored fader. */
export function masterAudioGain(raw: unknown): number {
  const output = readAudioOutput(raw);
  return output.muted ? 0 : output.volume * (output.dimmed ? .1 : 1);
}
