/** A transient detector, not a tempo estimator: attacks trigger one decaying pulse. */
export interface AudioBeat { average: number; previous: number; sinceBeatS: number; pulse: number }
export const SILENT_BEAT: AudioBeat = { average: 0, previous: 0, sinceBeatS: 1, pulse: 0 };
export function detectAudioBeat(state: AudioBeat, energy: number, elapsedS: number): AudioBeat {
  const dt = Math.max(0, Math.min(1, elapsedS));
  const level = Number.isFinite(energy) ? Math.max(0, Math.min(1, energy)) : 0;
  const sinceBeatS = state.sinceBeatS + dt;
  const attack = level > .08 && level > state.average * 1.45 + .025
    && level - state.previous > .025 && sinceBeatS >= .18;
  return { average: state.average + (level - state.average) * (1 - Math.exp(-dt / .4)),
    previous: level, sinceBeatS: attack ? 0 : sinceBeatS,
    pulse: attack ? 1 : state.pulse * Math.exp(-dt / .16) };
}
