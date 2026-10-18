import { BODY_SIGNALS } from '../body/signals';
import { DEFAULT_MODULATION, type FeatureKeyframe, type ShaderModulation } from '../features/types';
import { MAX_PARAMETER_KEYS, MAX_PARAMETER_TIME_S } from '../features/parameter-animation';
import { number, object } from './catalog';

/** Commands reject malformed motion; file recovery is deliberately more forgiving. */
export function parameterKeys(value: unknown, min = -1e6, max = 1e6, discrete = false): FeatureKeyframe[] | undefined {
  if (value === null) return undefined;
  if (!Array.isArray(value) || value.length > MAX_PARAMETER_KEYS) throw Error(`Use at most ${MAX_PARAMETER_KEYS} parameter keyframes.`);
  const keys = value.map((raw, i) => {
    const k = object(raw, ['id', 'timeS', 'value', 'interpolation']);
    if (k.id !== undefined && (typeof k.id !== 'string' || !k.id.length || k.id.length > 200)) throw Error('Invalid keyframe ID.');
    const interpolation = k.interpolation ?? (discrete?'hold':'linear');
    if(discrete&&(interpolation!=='hold'||!Number.isInteger(k.value)))throw Error('Choice keyframes require integer values and hold interpolation.');
    if (!['linear', 'smooth', 'hold'].includes(String(interpolation))) throw Error('Use linear, smooth or hold interpolation.');
    return { id: k.id as string ?? `parameter-key-${i}`, timeS: number(k.timeS, 'keyframe time', 0, MAX_PARAMETER_TIME_S),
      value: number(k.value, 'keyframe value', min, max), interpolation: interpolation as FeatureKeyframe['interpolation'] };
  }).sort((a,b) => a.timeS - b.timeS);
  if (new Set(keys.map(k=>k.id)).size !== keys.length || keys.some((k,i)=>i > 0 && Math.abs(k.timeS-keys[i-1].timeS) <= .0001)) throw Error('Use unique keyframe IDs and times.');
  return keys.length ? keys : undefined;
}

export function parameterModulation(value: unknown, min = -1e6, max = 1e6): ShaderModulation | undefined {
  if (value === null) return undefined;
  const raw = object(value, ['source','bodySignal','lfoIndex','range','invert','band','audioSignal','clock','control','amount','periodS','waveform','phase']);
  const result: ShaderModulation = { ...DEFAULT_MODULATION };
  for (const [key, choices] of Object.entries({ source:['time','audio','midi','lfo','body'], bodySignal:BODY_SIGNALS.map(s=>s.value), band:['low','mid','high','level'], audioSignal:['beat'], clock:['scene'], waveform:['sine','triangle','square','ramp'] })) {
    if (raw[key] !== undefined) {
      if (!(choices as readonly string[]).includes(String(raw[key]))) throw Error(`Invalid modulation ${key}.`);
      Object.assign(result, { [key]:raw[key] });
    }
  }
  for (const [key, lo, hi] of [['amount',-1e6,1e6],['periodS',.02,3600],['phase',-1e6,1e6],['control',0,127],['lfoIndex',0,3]] as const) {
    if (raw[key] !== undefined) {
      const n = number(raw[key], `modulation ${key}`, lo, hi);
      if ((key === 'control' || key === 'lfoIndex') && !Number.isInteger(n)) throw Error(`Modulation ${key} must be an integer.`);
      result[key] = n;
    }
  }
  if (raw.invert !== undefined) {
    if (typeof raw.invert !== 'boolean') throw Error('Modulation invert must be boolean.');
    result.invert = raw.invert;
  }
  if (raw.range !== undefined) {
    const range = object(raw.range, ['min','max']);
    result.range = { min:number(range.min,'range minimum',min,max), max:number(range.max,'range maximum',min,max) };
    if (result.range.min > result.range.max) throw Error('Range minimum must not exceed maximum; use invert to reverse.');
  }
  return result;
}
