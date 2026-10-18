/**
 * Where each scene's artboard sits on the editor canvas.
 *
 * Scenes are laid out side by side, the way artboards are in a drawing tool, so
 * a show's shape is visible at once rather than one scene at a time. The layout
 * is *computed from scene order*, not stored: an artboard's position on the
 * canvas means nothing to a projector — only the scene bound to an output ever
 * reaches a wall — so there is no position to save, migrate, or tidy up, and
 * reordering in the Scenes panel is what moves an artboard.
 *
 * Everything here is canvas space: scene pixels, with the first artboard's
 * top-left at the origin. Inside one artboard the coordinates are that scene's
 * own, exactly as they were when the canvas drew a single raster, so surfaces,
 * masks, cues and the output crop needed no change.
 */

import { sceneSize } from "./scene-size";
import { DEFAULT_OUTPUT, type MapShow, type Point, type Scene } from "./document";

/** Gutter between artboards, in scene pixels. */
export const ARTBOARD_GAP = 96;

export interface Artboard {
  scene: Scene;
  /** Canvas-space top-left of this artboard. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The artboards to draw, in scene order, left to right and top-aligned.
 *
 * A hidden scene is left out entirely and closes the gap behind it — a hole in
 * the row would claim the scene is still there. A suppressed scene stays: it is
 * out of the *show*, not out of the editor, and you still have to be able to
 * work on it.
 */
export function artboardLayout(show: MapShow): Artboard[] {
  const boards: Artboard[] = [];
  let x = 0;
  for (const scene of show.scenes) {
    if (scene.hidden) continue;
    const { width, height } = sceneSize(show, scene);
    boards.push({ scene, x, y: 0, width, height });
    x += width + ARTBOARD_GAP;
  }
  return boards;
}

/**
 * The box every artboard fits in, for fitting the view.
 *
 * With nothing laid out — every scene hidden — this is one output raster rather
 * than a zero-sized box, so "Fit" still produces a usable scale instead of
 * dividing by nothing.
 */
export function artboardBounds(layout: readonly Artboard[]): { width: number; height: number } {
  if (!layout.length) return { ...DEFAULT_OUTPUT };
  return {
    width: Math.max(...layout.map((board) => board.x + board.width)),
    height: Math.max(...layout.map((board) => board.y + board.height)),
  };
}

/**
 * The artboard under a canvas-space point, or nothing in the gutter.
 *
 * Half-open on each axis, so artboards that touched would not both claim the
 * shared edge.
 */
export function artboardAt(layout: readonly Artboard[], [x, y]: Point): Artboard | undefined {
  return layout.find((board) =>
    x >= board.x && x < board.x + board.width && y >= board.y && y < board.y + board.height);
}

/**
 * Where a scene's own pixel space starts on the canvas. Subtract it from a
 * canvas point to get a scene point — the one piece of arithmetic that multiple
 * artboards added to the pointer path.
 *
 * A scene with no artboard (hidden) answers the origin rather than undefined:
 * callers are doing coordinate maths, and a missing offset there would spread
 * NaN through a drag.
 */
export function artboardOrigin(layout: readonly Artboard[], sceneID: string): Point {
  const board = layout.find((entry) => entry.scene.id === sceneID);
  return board ? [board.x, board.y] : [0, 0];
}
