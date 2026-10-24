import type { ComponentType } from "react";
import {
  MeshGradient, meshGradientPresets,
  StaticMeshGradient, staticMeshGradientPresets,
  StaticRadialGradient, staticRadialGradientPresets,
  GrainGradient, grainGradientPresets,
  Heatmap, heatmapPresets,
  SimplexNoise, simplexNoisePresets,
  PerlinNoise, perlinNoisePresets,
  NeuroNoise, neuroNoisePresets,
  Voronoi, voronoiPresets,
  Metaballs, metaballsPresets,
  Water, waterPresets,
  LiquidMetal, liquidMetalPresets,
  Waves, wavesPresets,
  Swirl, swirlPresets,
  Spiral, spiralPresets,
  SmokeRing, smokeRingPresets,
  Warp, warpPresets,
  DotOrbit, dotOrbitPresets,
  DotGrid, dotGridPresets,
  ColorPanels, colorPanelsPresets,
  Dithering, ditheringPresets,
  HalftoneDots, halftoneDotsPresets,
  GodRays, godRaysPresets,
  PulsingBorder, pulsingBorderPresets,
  PaperTexture, paperTexturePresets,
  FlutedGlass, flutedGlassPresets,
  ImageDithering, imageDitheringPresets
} from "@paper-design/shaders-react";

import { DEFAULT_SHADER_TIME, DEFAULT_VISUAL_DURATION_S, type ShaderSource } from "./types";
import { Kaleidoscope, kaleidoscopePresets, Tunnel, tunnelPresets } from "./aether-shaders";
import { STAGE_SHADERS } from './stage-shaders';
import { GALLERY_SHADERS } from './gallery-shaders';

/**
 * Sections for the picker. Twenty-seven effects is past the point where a flat
 * list is read rather than scanned, and the grouping is by what the effect does
 * on a surface, which is how you choose one.
 */
export const SHADER_SECTIONS = {
  "mesh-gradient": "Gradients", "simplex-noise": "Noise & organic",
  "water": "Motion & fluid", "dot-orbit": "Patterns & dots", "god-rays": "Effects & textures", "kaleidoscope": "Aether originals",
} as const;

function entry(id: string, label: string, component: unknown, presets: readonly { name: string; params: object }[]) {
  return { id, label, component: component as ComponentType<Record<string, unknown>>, presets,
    // These effects transform an assigned picture rather than generating one, so
    // the picker marks them: choosing one without media is a half-made surface.
    image: ["heatmap", "water", "liquid-metal", "halftone-dots", "paper-texture", "fluted-glass", "image-dithering"].includes(id) };
}
/** Pinned upstream effects plus original generators. Image effects are counted separately. */
export const SHADERS = [
  entry("mesh-gradient", "Mesh Gradient", MeshGradient, [...meshGradientPresets,
    // The Prism pavilion reference looks, one click from the gallery.
    { name: "Ink mesh gradient", params: { ...meshGradientPresets[0].params, colors: ["#10142a", "#7c3aed", "#3b82f6", "#9be7ff"], distortion: 0.95, swirl: 0.3, speed: 0.6 } }]),
  entry("static-mesh-gradient", "Static Mesh Gradient", StaticMeshGradient, staticMeshGradientPresets),
  entry("radial-gradient", "Radial Gradient", StaticRadialGradient, staticRadialGradientPresets),
  entry("grain-gradient", "Grain Gradient", GrainGradient, grainGradientPresets),
  entry("heatmap", "Heatmap", Heatmap, heatmapPresets),
  entry("simplex-noise", "Simplex Noise", SimplexNoise, simplexNoisePresets),
  entry("perlin-noise", "Perlin Noise", PerlinNoise, perlinNoisePresets),
  entry("neuro-noise", "Neuro Noise", NeuroNoise, neuroNoisePresets),
  entry("voronoi", "Voronoi", Voronoi, voronoiPresets),
  entry("metaballs", "Metaballs", Metaballs, metaballsPresets),
  entry("water", "Water", Water, waterPresets),
  entry("liquid-metal", "Liquid Metal", LiquidMetal, liquidMetalPresets),
  entry("waves", "Waves", Waves, wavesPresets),
  entry("swirl", "Swirl", Swirl, swirlPresets),
  entry("spiral", "Spiral", Spiral, spiralPresets),
  entry("smoke-ring", "Smoke Ring", SmokeRing, smokeRingPresets),
  entry("warp", "Warp", Warp, [...warpPresets,
    { name: "Shader flow", params: { ...warpPresets[0].params, colors: ["#2a0a33", "#ff5ec7", "#8b5cf6", "#ffd1e8"], speed: 0.5, swirl: 0.9, distortion: 0.35 } }]),
  entry("dot-orbit", "Dot Orbit", DotOrbit, dotOrbitPresets),
  entry("dot-grid", "Dot Grid", DotGrid, dotGridPresets),
  entry("color-panels", "Color Panels", ColorPanels, colorPanelsPresets),
  entry("dithering", "Dithering", Dithering, ditheringPresets),
  entry("halftone-dots", "Halftone Dots", HalftoneDots, halftoneDotsPresets),
  entry("god-rays", "God Rays", GodRays, godRaysPresets),
  entry("pulsing-border", "Pulsing Border", PulsingBorder, pulsingBorderPresets),
  entry("paper-texture", "Paper Texture", PaperTexture, paperTexturePresets),
  entry("fluted-glass", "Fluted Glass", FlutedGlass, flutedGlassPresets),
  entry("image-dithering", "Image Dithering", ImageDithering, imageDitheringPresets),
  // Ours, not the upstream library's: projection work wants symmetry and depth,
  // and neither had an equivalent there.
  entry("kaleidoscope", "Kaleidoscope", Kaleidoscope, kaleidoscopePresets),
  entry("tunnel", "Tunnel", Tunnel, tunnelPresets),
  ...GALLERY_SHADERS,
  ...STAGE_SHADERS,
];
export function newShader(preset = "mesh-gradient", variant = 0): ShaderSource {
  const entry = SHADERS.find((s) => s.id === preset) ?? SHADERS[0];
  const raw = entry.presets[variant]?.params ?? entry.presets[0].params;
  const { colors, frame: _frame, ...params } = raw as Record<string, unknown>;
  const staticPreset = typeof params.speed !== 'number' || params.speed === 0;
  return { preset: entry.id, colors: Array.isArray(colors) ? [...colors] : [],
    parameters: { ...Object.fromEntries(Object.entries(params).filter(([, v]) => ["number", "string", "boolean"].includes(typeof v))), speed: staticPreset ? 1 : params.speed } as ShaderSource["parameters"],
    time: { ...DEFAULT_SHADER_TIME, loopS: DEFAULT_VISUAL_DURATION_S },
    // Static effects have no internal time animation. Animate an existing spatial
    // parameter instead; Freeze remains an explicit way to retain a still image.
    ...(staticPreset && typeof params.rotation === 'number' ? { modulation: { rotation: { source: 'time', amount: 15, periodS: DEFAULT_VISUAL_DURATION_S, waveform: 'sine', phase: 0 } } } : {}),
  };
}
export { shaderOptions } from "./shader-options";

/**
 * Names for the controls whose own name does not read. The camelCase fallback
 * already handles most of them ("noiseFrequency" → "Noise frequency"); this is
 * for the abbreviations and the bare words that mean nothing on their own.
 */
const PARAMETER_LABELS: Record<string, string> = {
  speed: "Animation speed", scale: "Overall scale", rotation: "Rotation angle",
  radius: "Gradient radius", focalDistance: "Focal point distance", focalAngle: "Focal angle",
  falloff: "Edge falloff", mixing: "Color mixing", distortionFreq: "Distortion frequency",
  grainMixer: "Grain mix", grainOverlay: "Grain overlay", grainSize: "Grain size",
  colorBack: "Background colour", colorFront: "Foreground colour", colorMid: "Midtone colour",
  colorHighlight: "Highlight colour", colorShadow: "Shadow colour", colorStroke: "Stroke colour",
  colorTint: "Tint colour", colorFill: "Fill colour", colorGlow: "Glow colour", colorGap: "Gap colour",
  originX: "Origin across", originY: "Origin down", offsetX: "Offset across", offsetY: "Offset down",
  imageX: "Image across", imageY: "Image down", waveX: "Wave across", waveY: "Wave down",
  gapX: "Gap across", gapY: "Gap down", worldWidth: "World width", worldHeight: "World height",
  fit: "Fit", type: "Type", shape: "Shape", count: "Count", seed: "Random seed",
  proportion: "Proportion", spotty: "Spottiness", stepsPerColor: "Steps per colour",
  octaveCount: "Octaves", noiseIterations: "Noise iterations", swirlIterations: "Swirl iterations",
};

export function parameterLabel(key: string): string {
  return PARAMETER_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

/**
 * An icon for a control, chosen by what family of thing it adjusts. The presets
 * between them expose around 170 distinct parameters, so these are rules over a
 * name rather than a table of every one — a table that size goes stale the
 * first time the upstream catalog moves.
 */
const PARAMETER_ICONS: [RegExp, string][] = [
  [/^colors?$|color[A-Z]|^gradient$|palette/i, "palette"],
  [/angle|rotation|twist|swirl|spiral/i, "revolute"],
  [/radius|roundness|size|thickness|width|height|length|spread|spacing|gap|margin/i, "fit"],
  [/speed|frequency|freq|period|pulse|waves?$|drops/i, "history"],
  [/offset|shift|origin|center|position|^imageX|^imageY/i, "mate"],
  [/count|iterations|octaves|steps|layering|repetition|bands?/i, "items"],
  [/opacity|fade|glow|bloom|brightness|highlights|shadows|intensity|contrast/i, "lighting"],
  [/noise|grain|distortion|roughness|crumple|fiber|smoke|caustic|blur/i, "sketch-nodes"],
  [/scale|stretch|perspective|proportion|aspect|fit/i, "view"],
  [/shape|type|grid|pattern|contour|edges|folds/i, "sketch"],
  [/mixing|density|softness|bias|seed|inverted/i, "slider"],
];

export function parameterIcon(key: string): string {
  return PARAMETER_ICONS.find(([pattern]) => pattern.test(key))?.[1] ?? "slider";
}
