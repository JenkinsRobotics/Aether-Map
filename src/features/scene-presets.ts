import { newScene, newSurface, type MapShow, type Scene } from "../document";
import { newShader } from "./shader-catalog";
import type { ShaderModulation, ShaderSource } from "./types";

/**
 * Finished scenes you can project the minute a show opens.
 *
 * An empty black rectangle is a bad first five minutes: the tool asks you to
 * map a wall before it has shown you anything worth mapping. These fill a scene
 * with generative content — no media files, so nothing to download, nothing to
 * go missing from a saved show, and any resolution a projector asks for.
 *
 * Each is one full-scene surface. Mapping it to a real shape is the next thing
 * you do; seeing it on the wall is the first.
 */
export interface ScenePreset {
  id: string;
  name: string;
  /** The occasion it belongs to, for grouping the picker. */
  occasion: "Halloween" | "Christmas" | "Ambient" | "Party";
  /** What it is for, in the picker. */
  caption: string;
  build: (output: MapShow["output"]) => Scene;
}

const beats = (control: Partial<ShaderModulation> & { amount: number }): ShaderModulation =>
  ({ source: "audio", band: "low", periodS: 4, waveform: "sine", phase: 0, ...control });

/** One surface filling the scene, carrying a configured shader. */
function shaderScene(name: string, output: MapShow["output"], shader: ShaderSource, surfaceName: string): Scene {
  const scene = newScene(name, { widthPx: output.width, heightPx: output.height });
  const surface = newSurface(output, 0);
  surface.name = surfaceName;
  surface.kind = "shader";
  surface.source = { ...surface.source, shader, rect: [0, 0, output.width, output.height] };
  // Full-bleed: a starting scene should cover the projector, not sit in the
  // middle of it waiting to be stretched.
  surface.corners = [[0, 0], [output.width, 0], [output.width, output.height], [0, output.height]];
  scene.surfaces = [surface];
  return scene;
}

const tuned = (preset: string, colors: string[], parameters: Record<string, number | string | boolean> = {},
  modulation?: Record<string, ShaderModulation>): ShaderSource => {
  const base = newShader(preset);
  return { ...base, colors: colors.length ? colors : base.colors,
    parameters: { ...base.parameters, ...parameters }, ...(modulation ? { modulation } : {}) };
};

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: "haunted-fog",
    name: "Haunted fog",
    occasion: "Halloween",
    caption: "Slow green murk that breathes with the bass. Good on a porch or a garage door.",
    build: (output) => shaderScene("Haunted fog", output,
      tuned("smoke-ring", ["#04140a", "#2f8f4f", "#8ef0a8"], { speed: 0.35 },
        { scale: beats({ amount: 0.35 }) }), "Fog"),
  },
  {
    id: "pumpkin-flicker",
    name: "Pumpkin flicker",
    occasion: "Halloween",
    caption: "Firelight orange, flickering. Fills a dark corner with no mapping at all.",
    build: (output) => shaderScene("Pumpkin flicker", output,
      tuned("grain-gradient", ["#1a0a00", "#ff7418", "#ffc05c"], { speed: 0.9 },
        { grainMixer: beats({ amount: 0.4, band: "mid" }) }), "Firelight"),
  },
  {
    id: "blood-drip",
    name: "Blood drip",
    occasion: "Halloween",
    caption: "Dark red running slowly downward. Best on a flat wall or a window.",
    build: (output) => shaderScene("Blood drip", output,
      tuned("liquid-metal", ["#120002", "#8b0008", "#ff2b3c"], { speed: 0.25 }), "Drip"),
  },
  {
    id: "winter-drift",
    name: "Winter drift",
    occasion: "Christmas",
    caption: "Cold blues drifting across. Turns a wall into weather.",
    build: (output) => shaderScene("Winter drift", output,
      tuned("water", ["#02101f", "#2f6fb0", "#bfe6ff"], { speed: 0.4 }), "Drift"),
  },
  {
    id: "festive-lights",
    name: "Festive lights",
    occasion: "Christmas",
    caption: "Points of warm colour, pulsing to the music.",
    build: (output) => shaderScene("Festive lights", output,
      tuned("dot-orbit", ["#0b0b12", "#ff4d4d", "#4dff88", "#ffd24d"], { speed: 0.6 },
        { scale: beats({ amount: 0.5 }) }), "Lights"),
  },
  {
    id: "spectral-swirl",
    name: "Spectral swirl",
    occasion: "Halloween",
    caption: "Slow violet rotation. Reads well on an irregular shape like a bush or a tree.",
    build: (output) => shaderScene("Spectral swirl", output,
      tuned("swirl", ["#07030f", "#5b2f9f", "#c79bff"], { speed: 0.3 },
        { rotation: { source: "time", amount: 180, periodS: 40, waveform: "ramp", phase: 0 } }), "Swirl"),
  },
  {
    id: "witching-kaleidoscope",
    name: "Witching hour",
    occasion: "Halloween",
    caption: "Green and violet symmetry that opens on the bass. Reads on anything irregular.",
    build: (output) => shaderScene("Witching hour", output,
      tuned("kaleidoscope", ["#050010", "#4dff9b", "#b46bff"], { segments: 8, twist: 1.6, bands: 16, speed: 0.5 },
        { segments: beats({ amount: 4, band: "low" }) }), "Symmetry"),
  },
  {
    id: "cobweb-tunnel",
    name: "Down the well",
    occasion: "Halloween",
    caption: "A receding tunnel. Turns a flat garage door into a hole in the world.",
    build: (output) => shaderScene("Down the well", output,
      tuned("tunnel", ["#02040a", "#2b4a7a", "#9fd8ff"], { sides: 10, rings: 2.5, speed: 0.7, falloff: 1.1 }), "Tunnel"),
  },
  {
    id: "frost-kaleidoscope",
    name: "Frost star",
    occasion: "Christmas",
    caption: "A six-pointed snowflake, turning slowly. Good on a door or a window.",
    build: (output) => shaderScene("Frost star", output,
      tuned("kaleidoscope", ["#00060f", "#bfe9ff", "#ffffff"], { segments: 6, twist: 0.2, bands: 22, speed: 0.22 },
        { rotation: { source: "time", amount: 360, periodS: 90, waveform: "ramp", phase: 0 } }), "Snowflake"),
  },
  {
    id: "candy-stripe",
    name: "Candy stripe",
    occasion: "Christmas",
    caption: "Red and white bands rolling downward, like a stick of rock.",
    build: (output) => shaderScene("Candy stripe", output,
      tuned("tunnel", ["#ffffff", "#d81f2a", "#ffd9dc"], { sides: 16, rings: 5, speed: 0.5, falloff: 0.2 }), "Stripes"),
  },
  {
    id: "hearth-glow",
    name: "Hearth glow",
    occasion: "Ambient",
    caption: "Warm, slow and almost still. For a window you want lit, not performing.",
    build: (output) => shaderScene("Hearth glow", output,
      tuned("mesh-gradient", ["#1a0700", "#8a3b12", "#ffb35c"], { speed: 0.12 }), "Glow"),
  },
  {
    id: "deep-water",
    name: "Deep water",
    occasion: "Ambient",
    caption: "Caustics moving across a wall. Sits under anything else you project.",
    build: (output) => shaderScene("Deep water", output,
      tuned("water", ["#000a12", "#0b4a6b", "#6fd8ff"], { speed: 0.3 }), "Caustics"),
  },
  {
    id: "strobe-floor",
    name: "Dance floor",
    occasion: "Party",
    caption: "Hard colour panels snapping on the beat. Loud, and meant to be.",
    build: (output) => shaderScene("Dance floor", output,
      tuned("color-panels", ["#05000a", "#ff2e88", "#2effd5", "#ffe74c"], { speed: 1.4 },
        { scale: beats({ amount: 0.6, band: "low", waveform: "square" }) }), "Panels"),
  },
  {
    id: "mirror-ball",
    name: "Mirror ball",
    occasion: "Party",
    caption: "Spinning symmetry that widens with the music. Fill a whole room with it.",
    build: (output) => shaderScene("Mirror ball", output,
      tuned("kaleidoscope", ["#00030a", "#ffffff", "#7cc8ff"], { segments: 14, twist: 0.6, bands: 30, speed: 1.2 },
        { twist: beats({ amount: 2, band: "mid" }) }), "Facets"),
  },
];

/** The picker's sections, in the order an operator is likely to want them. */
export const OCCASIONS: ScenePreset["occasion"][] = ["Halloween", "Christmas", "Party", "Ambient"];
