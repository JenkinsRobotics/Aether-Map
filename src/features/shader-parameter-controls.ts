import { STAGE_CONTROLS } from './stage-controls';
import { BODY_SIGNALS } from '../body/signals';
import type { ShaderModulation } from './types';

/** Suggested drag intervals for common controls, not hard limits on authored values. */
export function parameterSliderRange(key: string, preset?: string): { min: number; max: number } | undefined {
  const control=preset?STAGE_CONTROLS[preset]?.[key]:undefined;
  if(control)return {min:control.min,max:control.max};
  if (key === 'speed' || key === 'scale') return { min: 0, max: 5 };
  if (key === 'rotation') return { min: 0, max: 360 };
  if (/^(opacity|mixing|softness|roughness)$/.test(key)) return { min: 0, max: 1 };
  return undefined;
}

export function modulationLabel(value: ShaderModulation): string {
  if (value.source === 'audio' && value.audioSignal === 'beat') return 'Beat';
  if (value.source === 'body') return BODY_SIGNALS.find(s => s.value === (value.bodySignal ?? 'x'))!.label;
  if (value.source === 'lfo') return `LFO ${(value.lfoIndex ?? 0) + 1}`;
  if (value.source === 'midi') return `MIDI ${value.control ?? 1}`;
  if (value.source === 'audio') return ({ low: 'Bass', mid: 'Mids', high: 'Treble', level: 'Volume' })[value.band ?? 'level'];
  return 'Time';
}

export function parameterStep(key:string,preset?:string,fallback=.05):number {
 return (preset?STAGE_CONTROLS[preset]?.[key]?.step:undefined) ?? (/count|iterations|steps|positions|octaves/i.test(key)?1:fallback);
}
