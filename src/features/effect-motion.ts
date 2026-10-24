import type { VisualEffect } from '../visual-model';
import { effectAmount } from '../visual-effects';
import { keyframeValue } from './animation';
import { modulatedValue } from './shader-motion';
import { DEFAULT_LFOS, type Lfo } from './types';

/** Authored values stay unchanged. Curves precede live/clock modulation. */
export function effectValueAt(effect: VisualEffect, timeS: number, showTimeS = timeS,
  levels?: Record<string, number>, controls?: Record<number, number>, lfos: readonly Lfo[] = DEFAULT_LFOS): number {
  const base = keyframeValue(effect.animation ?? [], timeS, effect.amount), modulation = effect.modulation;
  const value = modulation ? modulatedValue(base, modulation,
    modulation.source === 'lfo' || modulation.clock === 'scene' ? showTimeS : timeS, levels, controls, lfos) : base;
  return effectAmount(effect.kind, value);
}
