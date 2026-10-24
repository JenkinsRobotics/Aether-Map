import type { Clip, MediaRef } from "./document";

/**
 * Clip arithmetic for the sequence timeline, pure so it can be tested without
 * a pointer. Times are seconds in the scene.
 */

/** Images have no length; hold them for this long when placed. */
export const IMAGE_HOLD_S = 30;
export const MIN_CLIP_S = 0.5;

export function clipEnd(clip: Clip): number {
  return clip.startS + clip.durationS;
}

/** The clip covering `timeS`, if any. Earlier clips win an overlap. */
export function clipAt(clips: readonly Clip[], timeS: number): Clip | null {
  return clips.find((clip) => clip.enabled !== false && timeS >= clip.startS && timeS < clipEnd(clip)) ?? null;
}

/**
 * Where in the asset to be at `timeS`. A looping clip wraps around the
 * asset's length; a non-looping one holds on its last frame.
 */
export function mediaTime(clip: Clip, media: MediaRef | undefined, timeS: number): number {
  const local = clip.inS + Math.max(timeS - clip.startS, 0);
  const length = media?.duration;
  if (!length || length <= 0) return local;
  return clip.loop ? local % length : Math.min(local, length);
}

/** A new clip for an asset, placed at `atS` on a layer. */
export function placeClip(
  id: string,
  media: MediaRef,
  atS: number,
  sceneDurationS: number,
): Clip {
  const natural = media.kind !== "image" && media.duration ? media.duration : IMAGE_HOLD_S;
  const startS = Math.max(0, Math.min(atS, sceneDurationS - MIN_CLIP_S));
  return {
    id,
    mediaId: media.id,
    startS: round(startS),
    durationS: round(Math.max(MIN_CLIP_S, Math.min(natural, sceneDurationS - startS))),
    inS: 0,
    loop: true,
  };
}

/** Move a clip, keeping it inside the scene. */
export function moveClip(clip: Clip, toStartS: number, sceneDurationS: number): Clip {
  const startS = Math.max(0, Math.min(toStartS, sceneDurationS - clip.durationS));
  return { ...clip, startS: round(startS) };
}

/** Drag a clip's right edge. */
export function trimEnd(clip: Clip, toEndS: number, sceneDurationS: number): Clip {
  const endS = Math.max(clip.startS + MIN_CLIP_S, Math.min(toEndS, sceneDurationS));
  return { ...clip, durationS: round(endS - clip.startS) };
}

/** Drag a clip's left edge; the asset's in-point moves with it so the picture does not jump. */
export function trimStart(clip: Clip, toStartS: number): Clip {
  const end = clipEnd(clip);
  const startS = Math.max(0, Math.min(toStartS, end - MIN_CLIP_S));
  const shift = startS - clip.startS;
  return {
    ...clip,
    startS: round(startS),
    durationS: round(end - startS),
    inS: round(Math.max(0, clip.inS + shift)),
  };
}

/** Snap to whole tenths, and to the edges of neighbouring clips within `withinS`. */
export function snapTime(
  timeS: number,
  neighbours: readonly Clip[],
  withinS: number,
  options: { grid?: boolean; edges?: boolean; anchors?: readonly number[] } = {},
): number {
  let best = options.grid === false ? timeS : Math.round(timeS * 10) / 10;
  let bestDistance = withinS;
  const edges = options.edges === false ? [] : neighbours.flatMap(clip => [clip.startS, clipEnd(clip)]);
  for (const edge of [...edges, ...(options.anchors ?? [])]) {
      const distance = Math.abs(edge - timeS);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = edge;
      }
  }
  return Math.max(0, best);
}


function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
