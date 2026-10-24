import { keyframeValue } from './animation';
import { DEFAULT_LFOS, type Lfo, DEFAULT_MODULATION, DEFAULT_SHADER_TIME, type ShaderModulation, type ShaderSource, type ShaderTime } from "./types";

/** Positive modulo: show time before a surface's offset is still a valid phase. */
const wrap = (value: number, span: number) => ((value % span) + span) % span;

/**
 * The seconds this shader should see at `timeS`. Everything about a shader's
 * motion is here, because the effect itself is a pure function of the time it
 * is handed — which is also why the editor and the projector agree without
 * sharing a frame.
 */
export function shaderTimeS(time: ShaderTime | undefined, timeS: number): number {
  const t = { ...DEFAULT_SHADER_TIME, ...time };
  if (t.frozen) return t.offsetS;
  const seconds = t.direction === "reverse" ? -(timeS + t.offsetS) : timeS + t.offsetS;
  if (t.loopS <= 0) return seconds;
  if (t.direction !== "pingpong") return wrap(seconds, t.loopS);
  // Out and back over twice the loop, so the turn is continuous rather than a cut.
  const position = wrap(seconds, t.loopS * 2);
  return position > t.loopS ? t.loopS * 2 - position : position;
}

/**
 * One modulation's contribution, in the parameter's own units, always between
 * −amount and +amount.
 *
 * An audio-driven one is not a cycle at all: it is the level, scaled. It stays
 * a pure function by taking the level as an argument rather than reading the
 * microphone, so a show's motion is still testable without a sound card.
 *
 * For a time-driven one: sine and triangle leave zero and rise, so swapping
 * between them does not jump the value; square and ramp start at an extreme
 * because that is what they are, and `phase` shifts either.
 */
export function modulationAt(
  modulation: ShaderModulation,
  timeS: number,
  levels?: Record<string, number>,
  controls?: Record<number, number>,
  lfos: readonly Lfo[] = DEFAULT_LFOS,
): number {
  const m = { ...DEFAULT_MODULATION, ...modulation };
  if (m.invert) return -modulationAt({ ...m, invert: false }, timeS, levels, controls, lfos);
  if (m.source === "lfo") {
    const lfo = lfos[m.lfoIndex ?? 0] ?? DEFAULT_LFOS[0];
    return modulationAt({ ...m, ...lfo, source: 'time' }, timeS, levels, controls);
  }
  if (m.source === "audio") return m.amount * clamp01(levels?.[m.audioSignal === 'beat' ? 'beat' : m.band ?? "level"] ?? 0);
  // A fader nobody has touched reads zero, not absent: a show opens looking the
  // same whether or not the desk is plugged in yet.
  if (m.source === 'body') return m.amount * clamp01(levels?.[`body:${m.bodySignal ?? 'x'}`] ?? 0);
  if (m.source === "midi") return m.amount * clamp01(controls?.[m.control ?? 1] ?? 0);
  if (m.periodS <= 0) return 0;
  const phase = wrap(timeS / m.periodS + m.phase, 1);
  if (m.waveform === "square") return phase < 0.5 ? m.amount : -m.amount;
  if (m.waveform === "ramp") return m.amount * (phase * 2 - 1);
  if (m.waveform === "triangle")
    return m.amount * (phase < 0.25 ? phase * 4 : phase < 0.75 ? 2 - phase * 4 : phase * 4 - 4);
  return m.amount * Math.sin(phase * Math.PI * 2);
}

/** Range assignments are absolute, while legacy assignments add to the base value. */
export function modulatedValue(base: number, modulation: ShaderModulation, timeS: number,
  levels?: Record<string, number>, controls?: Record<number, number>, lfos: readonly Lfo[] = DEFAULT_LFOS): number {
  if (!modulation.range) return base + modulationAt(modulation, timeS, levels, controls, lfos);
  const value = modulationAt({ ...modulation, amount: 1, invert: false }, timeS, levels, controls, lfos);
  const live = modulation.source === 'audio' || modulation.source === 'midi' || modulation.source === 'body';
  const position = clamp01(live ? value : (value + 1) / 2);
  const fraction = modulation.invert ? 1 - position : position;
  const min = Math.min(modulation.range.min, modulation.range.max), max = Math.max(modulation.range.min, modulation.range.max);
  return min + (max - min) * fraction;
}

/**
 * The shader as it stands at `timeS`: its numeric parameters with their cycles
 * applied. Color and held-choice motion is evaluated by sourceMotionAt before
 * this numeric stage. An unknown parameter name is ignored rather than
 * invented, so an effect that drops a control does not gain a stray one.
 */
export function shaderAt(
  shader: ShaderSource,
  timeS: number,
  levels?: Record<string, number>,
  controls?: Record<number, number>,
  lfos: readonly Lfo[] = DEFAULT_LFOS,
  showTimeS = timeS,
): ShaderSource {
  const entries = Object.entries(shader.modulation ?? {});
  if (!entries.length && !Object.keys(shader.animation ?? {}).length) return shader;
  const parameters = { ...shader.parameters };
  for (const [key, keys] of Object.entries(shader.animation ?? {})) {
    if (typeof parameters[key] === 'number') parameters[key] = keyframeValue(keys, timeS, parameters[key]);
  }
  for (const [key, modulation] of entries) {
    const base = parameters[key];
    if (typeof base !== "number") continue;
    parameters[key] = modulatedValue(base, modulation, modulation.source === "lfo" || modulation.clock === 'scene' ? showTimeS : timeS, levels, controls, lfos);
  }
  return { ...shader, parameters };
}

/** Silence and a dead microphone must look the same, and neither may go negative. */
const clamp01 = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Does this shader need the microphone running to look right? */
export function usesAudio(shader: ShaderSource): boolean {
  return Object.values(shader.modulation ?? {}).some((m) => m.source === "audio");
}

/** And does it need a desk? */
export function usesMidi(shader: ShaderSource): boolean {
  return Object.values(shader.modulation ?? {}).some((m) => m.source === "midi");
}
