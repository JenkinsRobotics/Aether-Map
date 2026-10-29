import { DEFAULT_TEXT, newSurface, type MapShow, type Surface } from "../document";
import { DEFAULT_CAMERA, DEFAULT_TRACKER, type FeatureKind } from "./types";
import { newShader } from "./shader-catalog";
export function newFeature(kind: FeatureKind, output: MapShow["output"], index: number): Surface {
  const surface = newSurface(output, index);
  surface.kind = kind;
  surface.name = `${kind[0].toUpperCase() + kind.slice(1)} ${index + 1}`;
  if (kind === "mask") surface.source.fill = "#000000";
  if (kind === "text") surface.source.text = { ...DEFAULT_TEXT };
  if (kind === "shader") surface.source.shader = newShader();
  if (kind === "webcam") surface.source.webcam = { ...DEFAULT_CAMERA };
  if (kind === "tracker") surface.source.tracker = { ...DEFAULT_TRACKER };
  if (kind === "cast") surface.source.cast = true;
  return surface;
}
