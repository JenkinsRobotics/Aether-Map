import type { MapShow } from "./document";
import type { OutputCrop } from "./features/types";

/**
 * The region to project. With none saved that is the whole scene, shown whole:
 * "cover" would scale the scene to fill the display and silently cut whatever
 * did not fit, which is never what an unconfigured output should do — a 1920×1080
 * scene in a 960×508 window loses 32px off the top and bottom before you have
 * touched anything. Cropping is a choice you make, not a default you discover.
 */
/**
 * The region one output covers, in scene pixels.
 *
 * The show carries the raster, the output carries its own crop, and joining
 * them was being spelled out by hand at four call sites. That is a domain
 * expression, not a convenience: the next change to where a region lives would
 * have had to find all four, and would have missed one.
 */
export function outputRegion(
  show: { output: MapShow["output"] },
  output: { crop?: OutputCrop } | undefined,
  size?: { width: number; height: number },
): OutputCrop {
  return sceneCrop({ ...show.output, crop: output?.crop }, size ?? { width: show.output.width, height: show.output.height });
}

export function sceneCrop(output: MapShow["output"], size = output as { width: number; height: number }): OutputCrop {
  return output.crop ?? { xPx: 0, yPx: 0, widthPx: size.width, heightPx: size.height, fit: "contain" };
}
/** Scale then translate the source region into a clipped device-sized viewport. */
export function cropTransform(crop: OutputCrop, device: { width: number; height: number }): string {
  let sx = device.width / Math.max(1, crop.widthPx), sy = device.height / Math.max(1, crop.heightPx);
  if (crop.fit !== "stretch") sx = sy = crop.fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
  const x = (device.width - crop.widthPx * sx) / 2 - crop.xPx * sx;
  const y = (device.height - crop.heightPx * sy) / 2 - crop.yPx * sy;
  return `translate(${x}px, ${y}px) scale(${sx}, ${sy})`;
}
