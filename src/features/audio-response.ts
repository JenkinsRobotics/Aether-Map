import { DEFAULT_MODULATION, type ShaderSource } from './types';
import { newShader } from './shader-catalog';

export type AudioResponse = 'beat' | 'bass' | 'treble' | 'mix' | 'tempo';
/** Quick setup writes ordinary parameter assignments; the full editor stays authoritative. */
export function applyAudioResponse(shader: ShaderSource, response: AudioResponse, bpm = 120): ShaderSource {
  const parameters = { ...newShader(shader.preset).parameters, ...shader.parameters };
  const modulation = { ...shader.modulation };
  const scale = typeof parameters.scale === 'number' ? parameters.scale : undefined;
  const rotation = typeof parameters.rotation === 'number' ? parameters.rotation : undefined;
  if (scale !== undefined && response !== 'treble') modulation.scale = {
    ...DEFAULT_MODULATION, source: response === 'tempo' ? 'time' : 'audio',
    band: response === 'mix' ? 'level' : 'low',
    ...(response === 'beat' ? { audioSignal: 'beat' as const } : {}),
    ...(response === 'tempo' ? { clock: 'scene' as const } : {}),
    periodS: 60 / Math.max(30, Math.min(240, bpm)), waveform: 'triangle', phase: .25,
    range: { min: Math.max(.01, scale * .85), max: Math.max(.1, scale * 1.35) },
  };
  if ((response === 'treble' || response === 'mix') && rotation !== undefined) modulation.rotation = {
    ...DEFAULT_MODULATION, source: 'audio', band: 'high', range: { min: rotation, max: rotation + 30 },
  };
  return { ...shader, parameters, modulation };
}
