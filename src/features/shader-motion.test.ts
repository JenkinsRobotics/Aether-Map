import { expect, test } from "vitest";
import { modulationAt, shaderAt, shaderTimeS, usesAudio, usesMidi } from "./shader-motion";
import type { ShaderSource } from "./types";

const time = (over = {}) => ({ offsetS: 0, loopS: 0, direction: "forward" as const, frozen: false, ...over });

test("offset puts two surfaces on one effect out of phase", () => {
  expect(shaderTimeS(time(), 3)).toBe(3);
  expect(shaderTimeS(time({ offsetS: 10 }), 3)).toBe(13);
  // A negative offset before the show starts is still a valid phase, not a clamp.
  expect(shaderTimeS(time({ offsetS: -10 }), 3)).toBe(-7);
  expect(shaderTimeS(undefined, 3)).toBe(3);
});

test("freezing holds the effect while the show keeps running", () => {
  expect(shaderTimeS(time({ frozen: true, offsetS: 2 }), 99)).toBe(2);
  // Freeze wins over a loop rather than the two fighting.
  expect(shaderTimeS(time({ frozen: true, offsetS: 2, loopS: 5 }), 99)).toBe(2);
});

test("a loop repeats, and ping-pong turns without a cut", () => {
  expect(shaderTimeS(time({ loopS: 5 }), 12)).toBe(2);
  expect(shaderTimeS(time({ loopS: 5 }), 5)).toBe(0);
  // Out to the end of the loop, then back: 7s into a 5s ping-pong is 3s.
  expect(shaderTimeS(time({ loopS: 5, direction: "pingpong" }), 7)).toBe(3);
  expect(shaderTimeS(time({ loopS: 5, direction: "pingpong" }), 5)).toBe(5);
  expect(shaderTimeS(time({ loopS: 5, direction: "pingpong" }), 10)).toBe(0);
  // Reverse runs the cycle backwards and stays inside it.
  const back = shaderTimeS(time({ loopS: 5, direction: "reverse" }), 2);
  expect(back).toBeGreaterThanOrEqual(0);
  expect(back).toBe(3);
});

test("each waveform runs between plus and minus the amount", () => {
  const m = (over = {}) => ({ amount: 2, periodS: 4, waveform: "sine" as const, phase: 0, ...over });
  expect(modulationAt(m(), 0)).toBeCloseTo(0);
  expect(modulationAt(m(), 1)).toBeCloseTo(2);
  expect(modulationAt(m(), 3)).toBeCloseTo(-2);
  expect(modulationAt(m({ waveform: "square" }), 0)).toBe(2);
  expect(modulationAt(m({ waveform: "square" }), 3)).toBe(-2);
  expect(modulationAt(m({ waveform: "ramp" }), 0)).toBe(-2);
  expect(modulationAt(m({ waveform: "ramp" }), 2)).toBe(0);
  // Triangle leaves zero and rises, like sine, so swapping between them does
  // not jump the parameter.
  expect(modulationAt(m({ waveform: "triangle" }), 0)).toBe(0);
  expect(modulationAt(m({ waveform: "triangle" }), 1)).toBe(2);
  expect(modulationAt(m({ waveform: "triangle" }), 2)).toBe(0);
  expect(modulationAt(m({ waveform: "triangle" }), 3)).toBe(-2);
  // Phase leads the cycle; a period of zero is off, not a divide by zero.
  expect(modulationAt(m({ phase: 0.25 }), 0)).toBeCloseTo(2);
  expect(modulationAt(m({ periodS: 0 }), 5)).toBe(0);
});

test("modulation moves numeric parameters and leaves everything else alone", () => {
  const shader: ShaderSource = {
    preset: "mesh-gradient", colors: ["#fff"],
    parameters: { scale: 1, shape: "wave", soft: true },
    modulation: {
      scale: { amount: 0.5, periodS: 4, waveform: "sine", phase: 0.25 },
      shape: { amount: 9, periodS: 4, waveform: "sine", phase: 0 },
      missing: { amount: 9, periodS: 4, waveform: "sine", phase: 0 },
    },
  };
  const at = shaderAt(shader, 0);
  expect(at.parameters.scale).toBeCloseTo(1.5);
  // A waveform on an enum or a boolean has no meaning, and an unknown key must
  // not invent a control the effect does not have.
  expect(at.parameters.shape).toBe("wave");
  expect(at.parameters.soft).toBe(true);
  expect(at.parameters.missing).toBeUndefined();
  // An unmodulated shader comes back as the very same object, so a static show
  // costs nothing per frame.
  const still: ShaderSource = { ...shader, modulation: undefined };
  expect(shaderAt(still, 3)).toBe(still);
});

test("a shader's motion survives a save and reopen", async () => {
  const { parseShow, serializeShow } = await import("../show-file");
  const { emptyShow } = await import("../document");
  const { newFeature } = await import("./new-feature");
  const show = emptyShow();
  const surface = newFeature("shader", show.output, 0);
  surface.source.shader = {
    ...surface.source.shader!,
    time: { offsetS: 2.5, loopS: 8, direction: "pingpong", frozen: false },
    modulation: {
      scale: { amount: 0.4, periodS: 6, waveform: "triangle", phase: 0.5 },
      // A zero period is off, not a divide by zero: it must not come back.
      rotation: { amount: 9, periodS: 0, waveform: "sine", phase: 0 },
    },
  };
  show.scenes[0].surfaces = [surface];
  const shader = parseShow(serializeShow(show)).scenes[0].surfaces[0].source.shader!;
  expect(shader.time).toEqual({ offsetS: 2.5, loopS: 8, direction: "pingpong", frozen: false });
  expect(shader.modulation?.scale).toEqual({ amount: 0.4, periodS: 6, waveform: "triangle", phase: 0.5 });
  expect(shader.modulation?.rotation).toBeUndefined();
  // An unknown direction or waveform falls back rather than reaching the GPU.
  const odd = parseShow(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(serializeShow(show))) }).replace('"pingpong"', '"sideways"'));
  expect(odd.scenes[0].surfaces[0].source.shader?.time?.direction).toBe("forward");
});

test("an audio-driven parameter follows the level, not a cycle", () => {
  const audio = { source: "audio" as const, band: "low" as const, amount: 2, periodS: 4, waveform: "sine" as const, phase: 0 };
  // Show time is irrelevant: the same level gives the same value at any instant.
  expect(modulationAt(audio, 0, { low: 0.5 })).toBe(1);
  expect(modulationAt(audio, 97.3, { low: 0.5 })).toBe(1);
  expect(modulationAt(audio, 0, { low: 1 })).toBe(2);
  // Silence, a missing band and a dead microphone all look the same: nothing.
  expect(modulationAt(audio, 0, { low: 0 })).toBe(0);
  expect(modulationAt(audio, 0, {})).toBe(0);
  expect(modulationAt(audio, 0, undefined)).toBe(0);
  // A level outside 0..1 cannot push the parameter past the amount asked for.
  expect(modulationAt(audio, 0, { low: 4 })).toBe(2);
  expect(modulationAt(audio, 0, { low: -3 })).toBe(0);
  // No band named means the whole signal.
  expect(modulationAt({ ...audio, band: undefined }, 0, { level: 0.25 })).toBe(0.5);
  // A zero period would disable a time cycle; audio has no period to disable.
  expect(modulationAt({ ...audio, periodS: 0 }, 0, { low: 1 })).toBe(2);
});

test("an audio modulation survives a save, and keeps its band", async () => {
  const { parseShow, serializeShow } = await import("../show-file");
  const { emptyShow } = await import("../document");
  const { newFeature } = await import("./new-feature");
  const show = emptyShow();
  const surface = newFeature("shader", show.output, 0);
  surface.source.shader = {
    ...surface.source.shader!,
    modulation: {
      // Audio carries no period; it must not be dropped for lacking one.
      scale: { source: "audio", band: "low", amount: 0.6, periodS: 0, waveform: "sine", phase: 0 },
      rotation: { source: "time", amount: 10, periodS: 3, waveform: "ramp", phase: 0 },
    },
  };
  show.scenes[0].surfaces = [surface];
  const shader = parseShow(serializeShow(show)).scenes[0].surfaces[0].source.shader!;
  expect(shader.modulation?.scale).toMatchObject({ source: "audio", band: "low", amount: 0.6 });
  expect(shader.modulation?.rotation).toMatchObject({ periodS: 3, waveform: "ramp" });
  expect(shader.modulation?.rotation.source).toBeUndefined();
  // usesAudio tells the editor whether this show needs a microphone at all.
  expect(usesAudio(shader)).toBe(true);
  expect(usesAudio({ ...shader, modulation: { rotation: shader.modulation!.rotation } })).toBe(false);
});

test("a MIDI-driven parameter follows its controller", () => {
  const midi = { source: "midi" as const, control: 7, amount: 2, periodS: 4, waveform: "sine" as const, phase: 0 };
  expect(modulationAt(midi, 0, undefined, { 7: 0.5 })).toBe(1);
  expect(modulationAt(midi, 99, undefined, { 7: 1 })).toBe(2);
  // A fader nobody has touched, a desk that is not plugged in, and a controller
  // the show never names all read the same: nothing.
  expect(modulationAt(midi, 0, undefined, {})).toBe(0);
  expect(modulationAt(midi, 0, undefined, undefined)).toBe(0);
  expect(modulationAt(midi, 0, undefined, { 9: 1 })).toBe(0);
  // Out of range cannot over-drive the parameter.
  expect(modulationAt(midi, 0, undefined, { 7: 9 })).toBe(2);
  // Audio and MIDI do not read each other's inputs.
  expect(modulationAt({ ...midi, source: "audio", band: "low" }, 0, { low: 1 }, { 7: 0 })).toBe(2);
  expect(usesMidi({ preset: "x", colors: [], parameters: {}, modulation: { a: midi } })).toBe(true);
  expect(usesAudio({ preset: "x", colors: [], parameters: {}, modulation: { a: midi } })).toBe(false);
});

test("a MIDI modulation round-trips, and a bad controller number is dropped", async () => {
  const { parseShow, serializeShow } = await import("../show-file");
  const { emptyShow } = await import("../document");
  const { newFeature } = await import("./new-feature");
  const show = emptyShow();
  const surface = newFeature("shader", show.output, 0);
  surface.source.shader = { ...surface.source.shader!, modulation: {
    scale: { source: "midi", control: 74, amount: 0.5, periodS: 0, waveform: "sine", phase: 0 },
  } };
  show.scenes[0].surfaces = [surface];
  expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].source.shader!.modulation?.scale)
    .toMatchObject({ source: "midi", control: 74 });
  // 128 is not a control change number; it falls back rather than reaching a desk.
  const odd = JSON.parse(new TextDecoder().decode(serializeShow(show)));
  odd.scenes[0].surfaces[0].source.shader.modulation.scale.control = 128;
  expect(parseShow(JSON.stringify(odd)).scenes[0].surfaces[0].source.shader!.modulation?.scale.control).toBeUndefined();
});

test('absolute ranges bound audio/MIDI and invert the sweep without changing its limits', () => {
  const m = { source: 'audio' as const, amount: 100, periodS: 4, phase: 0, waveform: 'sine' as const, range: { min: 2, max: 6 } };
  const shader: ShaderSource = { preset: 'test', colors: [], parameters: { scale: 99 }, modulation: { scale: m } };
  expect(shaderAt(shader, 0, { level: 0 }).parameters.scale).toBe(2);
  expect(shaderAt(shader, 0, { level: .25 }).parameters.scale).toBe(3);
  expect(shaderAt(shader, 0, { level: 100 }).parameters.scale).toBe(6);
  shader.modulation!.scale = { ...m, invert: true };
  expect(shaderAt(shader, 0, { level: .25 }).parameters.scale).toBe(5);
  shader.modulation!.scale = { ...m, source: 'midi', control: 74 };
  expect(shaderAt(shader, 9, {}, { 74: .5 }).parameters.scale).toBe(4);
});

test('shared LFOs use one scene clock across shader offsets and ranges', () => {
  const shader: ShaderSource = { preset: 'test', colors: [], parameters: { scale: 0, rotation: 0 }, modulation: {
    scale: { source: 'lfo', lfoIndex: 1, amount: 1, periodS: 999, phase: .5, waveform: 'square', range: { min: 2, max: 6 } },
    rotation: { source: 'lfo', lfoIndex: 1, amount: 1, periodS: 999, phase: .5, waveform: 'square', range: { min: 0, max: 360 }, invert: true },
  } };
  const lfos = [{ periodS: 8, phase: 0, waveform: 'triangle' as const }, { periodS: 4, phase: 0, waveform: 'sine' as const }];
  expect(shaderAt(shader, 99, {}, {}, lfos, 1).parameters).toEqual({ scale: 6, rotation: 0 });
  expect(shaderAt(shader, 555, {}, {}, lfos, 3).parameters).toEqual({ scale: 2, rotation: 360 });
});

test('shared LFO bank and bounded assignments survive a show roundtrip', async () => {
  const { emptyShow, newSurface } = await import('../document');
  const { parseShow, serializeShow } = await import('../show-file');
  const show = emptyShow(), surface = newSurface(show.output, 0);
  show.lfos = [{ periodS: 2, phase: .25, waveform: 'triangle' }];
  surface.source.shader = { preset: 'test', colors: [], parameters: { scale: 1 }, modulation: {
    scale: { source: 'lfo', lfoIndex: 3, amount: 2, periodS: 0, phase: 0, waveform: 'sine', range: { min: 5, max: 2 }, invert: true },
  } };
  show.scenes[0].surfaces = [surface];
  const saved = parseShow(serializeShow(show));
  expect(saved.lfos).toHaveLength(4);
  expect(saved.lfos![0]).toEqual(show.lfos[0]);
  expect(saved.scenes[0].surfaces[0].source.shader?.modulation?.scale).toMatchObject({ source: 'lfo', lfoIndex: 3, range: { min: 2, max: 5 }, invert: true });
});
