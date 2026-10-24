import type { OutputCrop } from "./features/types";

export interface SceneExtent { width: number; height: number }

/**
 * Where a dragged output region latches: each axis offers the leading edge, the
 * centre and the trailing edge, so the nine combinations are the scene's four
 * corners, four edge midpoints and centre — the anchors a sketch tool offers.
 * Nothing is clamped: a projector may legitimately overscan the scene, so
 * snapping only helps, it never confines.
 */
export function snapCropPosition(crop: OutputCrop, scene: SceneExtent, tolerancePx: number): OutputCrop {
  return {
    ...crop,
    xPx: snap(crop.xPx, [0, (scene.width - crop.widthPx) / 2, scene.width - crop.widthPx], tolerancePx),
    yPx: snap(crop.yPx, [0, (scene.height - crop.heightPx) / 2, scene.height - crop.heightPx], tolerancePx),
  };
}

/** Resizing latches the trailing edge to the scene's edge and to its centre. */
export function snapCropSize(crop: OutputCrop, scene: SceneExtent, tolerancePx: number): OutputCrop {
  const right = snap(crop.xPx + crop.widthPx, [scene.width / 2, scene.width], tolerancePx);
  const bottom = snap(crop.yPx + crop.heightPx, [scene.height / 2, scene.height], tolerancePx);
  return { ...crop, widthPx: Math.max(1, right - crop.xPx), heightPx: Math.max(1, bottom - crop.yPx) };
}

function snap(value: number, anchors: readonly number[], tolerance: number): number {
  let best = value, distance = tolerance;
  for (const anchor of anchors) {
    const delta = Math.abs(anchor - value);
    if (delta <= distance) { best = anchor; distance = delta; }
  }
  return Math.round(best);
}
