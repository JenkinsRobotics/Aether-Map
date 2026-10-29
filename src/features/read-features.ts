import { isBodySignal } from '../body/signals';
import { readParameterAnimation, readParameterKeys } from './parameter-animation';
import { SURFACE_PARAMETERS } from './surface-parameters';
import type { Surface } from "../document";
import { DEFAULT_LFOS, type Lfo, DEFAULT_MODULATION, DEFAULT_TRACKER, DEFAULT_TRANSFORM, type CameraSource,
  type DrawnSource, type FeatureAnimation, type FeatureKind, type OutputCrop, type ShaderModulation, type ShaderSource, type ShaderTime, type TrackerSource } from "./types";
const record = (v: unknown): Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {};
const number = (v: unknown, fallback: number) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
const text = (v: unknown, fallback: string) => typeof v === "string" ? v : fallback;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function readCamera(value: unknown): CameraSource {
  const r = record(value);
  return { deviceId: text(r.deviceId, ""), aspect: r.aspect === "4:3" || r.aspect === "1:1" ? r.aspect : "16:9", mirror: r.mirror !== false, flipY: r.flipY === true };
}
export function readGeneratedSources(source: Record<string, unknown>): Partial<Surface["source"]> {
  const result: Partial<Surface["source"]> = {};
  if (source.webcam) result.webcam = readCamera(source.webcam);
  if (source.cast === true) result.cast = true;
  if (source.web) { const url = text(record(source.web).url, ""); result.web = { url: /^https:\/\/\S{1,2040}$/.test(url) ? url : "" }; }
  if (source.drawing) result.drawing = readDrawing(source.drawing);
  if (source.testPattern === "grid" || source.testPattern === "bars") result.testPattern = source.testPattern;
  if (source.shader) {
    const r = record(source.shader);
    result.shader = { preset: text(r.preset, "mesh-gradient"),
      colors: Array.isArray(r.colors) ? r.colors.filter((c): c is string => typeof c === "string").slice(0, 10) : [],
      parameters: Object.fromEntries(Object.entries(record(r.parameters)).filter(([k, v]) =>
        !["__proto__", "constructor", "style", "children", "ref", "image", "frame"].includes(k) &&
        (typeof v === "boolean" || typeof v === "string" || (typeof v === "number" && Number.isFinite(v))))) as ShaderSource["parameters"],
      ...(r.time ? { time: readShaderTime(r.time) } : {}),
      ...(r.modulation ? { modulation: readModulation(r.modulation) } : {}),
      ...(r.animation ? { animation: readParameterAnimation(r.animation) } : {}) };
    if (r.looks) {
      const looks: NonNullable<ShaderSource['looks']> = {};
      for (const slot of ['A', 'B', 'C'] as const) {
        const raw = record(record(r.looks)[slot]);
        if (typeof raw.preset !== 'string') continue;
        const look = readGeneratedSources({ shader: { ...raw, looks: undefined } }).shader;
        if (look) looks[slot] = look;
      }
      result.shader.looks = looks;
    }
  }
  if (source.tracker) {
    const r = record(source.tracker);
    const tracker: TrackerSource = { ...DEFAULT_TRACKER, ...readCamera(r),
      style: ["skin", "silhouette", "wire", "metal"].includes(String(r.style)) ? r.style as TrackerSource["style"] : "skin",
      color: text(r.color, DEFAULT_TRACKER.color), hand: r.hand === "left" || r.hand === "right" ? r.hand : "both",
      handCount: r.handCount === 1 ? 1 : 2, scale: clamp(number(r.scale, 1), 0.1, 5),
      // Absent means hands, which is what every show saved before faces existed meant.
      ...(r.subject === "face" ? { subject: "face" as const } : {}) };
    const rec = record(r.recording);
    if (Array.isArray(rec.frames)) tracker.recording = {
      durationS: Math.max(0.001, number(rec.durationS, 1)), loop: rec.loop !== false,
      frames: rec.frames.slice(0, 36000).map((frame) => {
        const f = record(frame);
        return { timeS: Math.max(0, number(f.timeS, 0)), hands: Array.isArray(f.hands) ? f.hands.slice(0, 2).flatMap((hand) => {
          const h = record(hand);
          if (!Array.isArray(h.points) || h.points.length !== 21) return [];
          return [{ side: h.side === "Left" ? "Left" as const : "Right" as const,
            points: h.points.map((p) => Array.isArray(p) ? [number(p[0], 0), number(p[1], 0), number(p[2], 0)] as [number, number, number] : [0, 0, 0] as [number, number, number]) }];
        }) : [] };
      }).sort((a, b) => a.timeS - b.timeS),
    };
    result.tracker = tracker;
  }
  return result;
}
export function readFeatureFields(raw: Record<string, unknown>): Partial<Surface> {
  const fields: Partial<Surface> = {};
  if (["surface", "mask", "text", "shader", "webcam", "tracker", "stream", "web"].includes(String(raw.kind))) fields.kind = raw.kind as FeatureKind;
  if (typeof raw.locked === "boolean") fields.locked = raw.locked;
  if (raw.shape === "ellipse" || raw.shape === "rectangle") fields.shape = raw.shape;
  if (raw.radiusPx !== undefined) fields.radiusPx = Math.max(0, number(raw.radiusPx, 0));
  if (raw.transform) {
    const r = record(raw.transform);
    fields.transform = { ...DEFAULT_TRANSFORM };
    for (const key of Object.keys(DEFAULT_TRANSFORM) as (keyof typeof DEFAULT_TRANSFORM)[])
      fields.transform[key] = number(r[key], DEFAULT_TRANSFORM[key]);
  }
  if (raw.animation) {
    const animation: FeatureAnimation = {};
    for (const property of ["opacity", "xPx", "yPx", "scaleX", "scaleY", "rotationDeg"] as const) {
      const keys = record(raw.animation)[property];
      if (Array.isArray(keys)) animation[property] = keys.slice(0, 10000).map((key, index) => {
        const k = record(key);
        return { id: text(k.id, `${property}-${index}`), timeS: Math.max(0, number(k.timeS, 0)), value: number(k.value, property === "opacity" ? 1 : DEFAULT_TRANSFORM[property]),
          interpolation: k.interpolation === "hold" ? "hold" : k.interpolation === "smooth" ? "smooth" : "linear" };
      });
    }
    fields.animation = animation;
    for (const spec of SURFACE_PARAMETERS.filter(p => p.key === 'radiusPx' || p.key === 'bendAngleDeg')) {
      const keys = readParameterKeys(record(raw.animation)[spec.key], spec.min, spec.max);
      if (keys.length) animation[spec.key] = keys;
    }
  }
  const modulation: NonNullable<Surface['modulation']> = {};
  for (const spec of SURFACE_PARAMETERS) {
    const entry = record(raw.modulation)[spec.key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const m = readModulation({ value: entry }).value;
    if (m) modulation[spec.key] = { ...m, ...(m.range ? { range: {
      min: clamp(m.range.min, spec.min, spec.max), max: clamp(m.range.max, spec.min, spec.max),
    } } : {}) };
  }
  if (Object.keys(modulation).length) fields.modulation = modulation;
  return fields;
}
export function readOutputCrop(raw: unknown): OutputCrop | undefined {
  if (!raw) return undefined;
  const c = record(raw);
  return { xPx: number(c.xPx, 0), yPx: number(c.yPx, 0), widthPx: Math.max(1, number(c.widthPx, 1920)), heightPx: Math.max(1, number(c.heightPx, 1080)), fit: c.fit === "contain" || c.fit === "stretch" ? c.fit : "cover" };
}

function readShaderTime(value: unknown): ShaderTime {
  const r = record(value);
  return {
    offsetS: number(r.offsetS, 0),
    loopS: Math.max(0, number(r.loopS, 0)),
    direction: r.direction === "reverse" || r.direction === "pingpong" ? r.direction : "forward",
    frozen: r.frozen === true,
  };
}

/** Only real cycles survive a read: a zero period is off, not a divide by zero. */
export function readModulation(value: unknown): Record<string, ShaderModulation> {
  return Object.fromEntries(Object.entries(record(value)).flatMap(([key, entry]) => {
    if (["__proto__", "constructor"].includes(key)) return [];
    const r = record(entry);
    const periodS = number(r.periodS, DEFAULT_MODULATION.periodS);
    if (periodS <= 0 && r.source !== "audio" && r.source !== "midi" && r.source !== "lfo" && r.source !== "body") return [];
    return [[key, {
      ...(r.source === "audio" || r.source === "midi" || r.source === "lfo" || r.source === "body" ? { source: r.source } : {}),
      ...(typeof r.control === "number" && Number.isInteger(r.control) && r.control >= 0 && r.control <= 127 ? { control: r.control } : {}),
      ...(r.band === "low" || r.band === "mid" || r.band === "high" || r.band === "level" ? { band: r.band } : {}),
      ...(r.audioSignal === 'beat' ? { audioSignal: 'beat' as const } : {}),
      ...(isBodySignal(r.bodySignal) ? { bodySignal: r.bodySignal } : {}),
      ...(r.clock === 'scene' ? { clock: 'scene' as const } : {}),
      ...(r.source === 'lfo' ? { lfoIndex: clamp(Math.round(number(r.lfoIndex, 0)), 0, 3) } : {}),
      ...(r.invert === true ? { invert: true } : {}),
      ...(typeof record(r.range).min === 'number' && Number.isFinite(record(r.range).min) && typeof record(r.range).max === 'number' && Number.isFinite(record(r.range).max)
        ? { range: { min: Math.min(Number(record(r.range).min), Number(record(r.range).max)), max: Math.max(Number(record(r.range).min), Number(record(r.range).max)) } } : {}),
      amount: number(r.amount, DEFAULT_MODULATION.amount),
      periodS,
      waveform: r.waveform === "triangle" || r.waveform === "square" || r.waveform === "ramp" ? r.waveform : "sine",
      phase: number(r.phase, 0),
    } satisfies ShaderModulation]];
  }));
}

/** Painted strokes. A stroke needs two points to be a line; anything shorter is
 *  dropped rather than reaching the renderer as a degenerate path. */
function readDrawing(value: unknown): DrawnSource {
  const raw = record(value);
  const replay = record(raw.replay);
  const strokes = Array.isArray(raw.strokes) ? raw.strokes : [];
  return {
    ...(raw.replay ? { replay: { durationS: clamp(number(replay.durationS, 5), .1, 3600), loop: replay.loop !== false } } : {}),
    strokes: strokes.flatMap((entry) => {
      const stroke = record(entry);
      const points = Array.isArray(stroke.points)
        ? stroke.points.flatMap((point) => Array.isArray(point) && point.length >= 2
          && Number.isFinite(point[0]) && Number.isFinite(point[1])
            ? [[Number(point[0]), Number(point[1])] as [number, number]] : [])
        : [];
      if (points.length < 2) return [];
      return [{ points, color: text(stroke.color, "#ffffff"), widthPx: Math.max(0.5, number(stroke.widthPx, 6)) }];
    }),
  };
}

export function readLfos(value: unknown): Lfo[] {
  const entries = Array.isArray(value) ? value : [];
  return DEFAULT_LFOS.map((fallback, i) => {
    const r = record(entries[i]);
    return { periodS: clamp(number(r.periodS, fallback.periodS), .02, 3600), phase: number(r.phase, 0),
      waveform: r.waveform === 'triangle' || r.waveform === 'square' || r.waveform === 'ramp' ? r.waveform : 'sine' };
  });
}
