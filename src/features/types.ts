/** Product-owned generated sources and animation. No browser handles enter a show. */
export type FeatureKind = "surface" | "mask" | "text" | "shader" | "webcam" | "tracker" | "cast";
/**
 * How a shader reads the show clock. An effect is a pure function of show time,
 * so shaping the time it sees is the whole of its motion control: two surfaces
 * on one effect run out of phase instead of pulsing together, a loop makes a
 * seamless cycle out of an endless one, and freezing holds a frame while the
 * show keeps running.
 */
export interface ShaderTime {
  /** Seconds added to show time before the effect sees it. */
  offsetS: number;
  /** Seconds after which the effect's time repeats; 0 never repeats. */
  loopS: number;
  direction: "forward" | "reverse" | "pingpong";
  /** Holds the effect at `offsetS`. The show is unaffected. */
  frozen: boolean;
}
export const DEFAULT_SHADER_TIME: ShaderTime = { offsetS: 0, loopS: 0, direction: "forward", frozen: false };
/** New authored visuals; legacy sources without timing keep their original clock. */
export const DEFAULT_VISUAL_DURATION_S = 15;

/** Live or clock-driven contribution to a numeric parameter. */
export interface ShaderModulation {
  /**
   * What drives the cycle. "time" is the show clock — repeatable, identical on
   * every output. "audio" is whatever the room is playing, which is the point
   * of it and also why it is not repeatable: two outputs listening to the same
   * room agree, a recording of the show does not. "midi" is a fader on a desk:
   * live like audio, but something a person is deliberately driving.
   */
  source?: "time" | "audio" | "midi" | "lfo" | "body";
  /** Normalized camera pose measurement; a saved assignment never starts the camera. */
  bodySignal?: import("../body/signals").BodySignal;
  /** Show-wide LFO, zero-based; its phase ignores individual clip offsets. */
  lfoIndex?: number;
  /** Absolute limits; absent keeps the original additive amount behavior. */
  range?: { min: number; max: number };
  invert?: boolean;
  /** Which part of the spectrum, when the source is audio. */
  band?: AudioBand;
  /** Optional transient pulse instead of a sustained audio-band level. */
  audioSignal?: "beat";
  /** Tempo pulses use the shared scene clock, independent of a visual's local loop. */
  clock?: "scene";
  /** Which control-change number, when the source is MIDI. */
  control?: number;
  /** Added to the parameter at the peak of the cycle, or at full level; may be negative. */
  amount: number;
  periodS: number;
  waveform: "sine" | "triangle" | "square" | "ramp";
  /** Fraction of the cycle to start into, so two parameters can lead each other. */
  phase: number;
}
export const DEFAULT_MODULATION: ShaderModulation = { source: "time", amount: 1, periodS: 4, waveform: "sine", phase: 0 };

export type ShaderLook = Omit<ShaderSource, 'looks'>;
export interface ShaderSource {
  looks?: Partial<Record<'A' | 'B' | 'C', ShaderLook>>;
  preset: string;
  colors: string[];
  /** Dimensionless shader controls, except explicitly named seconds/pixels/degrees. */
  parameters: Record<string, number | string | boolean>;
  time?: ShaderTime;
  /** Per-parameter cycles, keyed by parameter name. */
  modulation?: Record<string, ShaderModulation>;
  /** Parameter curves in the shaped source clock, evaluated before modulation. */
  animation?: Record<string, FeatureKeyframe[]>;
}
export interface CameraSource {
  deviceId: string;
  aspect: "16:9" | "4:3" | "1:1";
  mirror: boolean;
  flipY: boolean;
}
export interface HandSample {
  side: "Left" | "Right";
  /** Normalized camera coordinates, z relative to wrist. */
  points: [number, number, number][];
}
export interface TrackingFrame { timeS: number; hands: HandSample[] }
export interface FaceSample { points: [number, number, number][] }

export interface TrackerSource extends CameraSource {
  /** What the camera is watching. Hands by default, as it always was. */
  subject?: "hands" | "face";
  style: "skin" | "silhouette" | "wire" | "metal";
  color: string;
  hand: "both" | "left" | "right";
  handCount: 1 | 2;
  scale: number;
  recording?: { durationS: number; frames: TrackingFrame[]; loop: boolean };
}
export const DEFAULT_CAMERA: CameraSource = { deviceId: "", aspect: "16:9", mirror: true, flipY: false };
export const DEFAULT_TRACKER: TrackerSource = {
  ...DEFAULT_CAMERA, style: "skin", color: "#ffccaa", hand: "both", handCount: 2, scale: 1,
};
export type Rect = [number, number, number, number];
interface DrawnStroke { points: [number, number][]; color: string; widthPx: number }
/** Hand-painted content. Strokes live in the surface's own pixel space, so they
 *  warp with it exactly as an image would. */
export interface DrawnSource {
  strokes: DrawnStroke[];
  /** Optional constant-speed stroke reveal, driven by clip time; absent is static. */
  replay?: { durationS: number; loop: boolean };
}

export type AudioBand = "low" | "mid" | "high" | "level";
export type AnimatedProperty = "opacity" | "xPx" | "yPx" | "scaleX" | "scaleY" | "rotationDeg" | "radiusPx" | "bendAngleDeg";
export interface FeatureKeyframe {
  id: string;
  timeS: number;
  value: number;
  interpolation: "linear" | "smooth" | "hold";
}
export type FeatureAnimation = Partial<Record<AnimatedProperty, FeatureKeyframe[]>>;
export interface FeatureTransform { xPx: number; yPx: number; scaleX: number; scaleY: number; rotationDeg: number }
export const DEFAULT_TRANSFORM: FeatureTransform = { xPx: 0, yPx: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 };
/** Rectangle in scene coordinates, independent of physical output dimensions. */
export interface OutputCrop { xPx: number; yPx: number; widthPx: number; heightPx: number; fit: "contain" | "cover" | "stretch" }

export interface Lfo { periodS: number; phase: number; waveform: ShaderModulation['waveform'] }
export const DEFAULT_LFOS: readonly Lfo[] = [4, 8, 2, 16].map(periodS => ({ periodS, phase: 0, waveform: 'sine' }));
