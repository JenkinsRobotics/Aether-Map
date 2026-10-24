import { DitheringShapes, DitheringTypes, DotGridShapes, WarpPatterns, GrainGradientShapes,
  GlassDistortionShapes, GlassGridShapes, LiquidMetalShapes, HalftoneDotsTypes, HalftoneDotsGrids, PulsingBorderAspectRatios } from "@paper-design/shaders";

/** Pure option metadata shared by UI and the source automation model. */
export function shaderOptions(preset: string, field: string): string[] | undefined {
  if (field === "fit") return ["contain", "cover", "none"];
  if (preset === "pulsing-border" && field === "aspectRatio") return Object.keys(PulsingBorderAspectRatios);
  const maps: Record<string, Record<string, object>> = {
    dithering: { shape: DitheringShapes, type: DitheringTypes },
    "image-dithering": { type: DitheringTypes }, "dot-grid": { shape: DotGridShapes },
    warp: { shape: WarpPatterns }, "grain-gradient": { shape: GrainGradientShapes },
    "fluted-glass": { shape: GlassGridShapes, distortionShape: GlassDistortionShapes },
    "liquid-metal": { shape: LiquidMetalShapes }, "halftone-dots": { type: HalftoneDotsTypes, grid: HalftoneDotsGrids },
  };
  return maps[preset]?.[field] ? Object.keys(maps[preset][field]) : undefined;
}
