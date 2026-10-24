import { timelineDuration } from './timelines';
import { activeScene, withSurfaces, type MapShow, type MediaRef, type Surface } from "./document";
import { clipAt, mediaTime } from "./clips";
import { animateSurface, type SurfaceMotionContext } from "./features/animation";
import { clipSource } from './surface-assets';

/**
 * A show is a pure function of time.
 *
 * The editor's canvas and the projector's output both call this, so what you
 * see while authoring is what the projector shows at the same instant. Nothing
 * about playback lives in a component.
 */

export function showTime(show: MapShow, elapsedS: number): number {
  elapsedS = Math.max(0, elapsedS);
  if (show.playback.mode === "continuous") return elapsedS;
  // Only an explicitly chosen sequence loop/hold uses the timeline endpoint.
  const duration = Math.max(timelineDuration(show), 0.001);
  if (show.playback.mode === "once") return Math.min(elapsedS, duration);
  return elapsedS % duration;
}

export function playbackEnded(show: MapShow, elapsedS: number): boolean {
  return show.playback.mode === "once" && elapsedS >= (timelineDuration(show));
}

/**
 * A surface as rendered at an instant. `mediaTimeS` is where inside its asset
 * the picture should be — a clip's in-point plus elapsed, wrapped if looping.
 */
export type ResolvedSurface = Surface & { mediaTimeS: number; mediaLoop?: boolean; visualPlacement?: import('./visual-placement').VisualPlacement; contentFrame?: Surface['source']['rect']; alphaProjection?: { corners: Surface['corners']; rect: Surface['source']['rect'] } };

/**
 * The surface as it stands at `timeS`: every cue at or before it applied, and
 * if the layer has a sequence, the clip under the playhead as its source — or
 * nothing at all where no clip covers it.
 */
export function evaluateSurface(
  surface: Surface,
  timeS: number,
  media: readonly MediaRef[] = [],
  context: SurfaceMotionContext = {},
): ResolvedSurface {
  let enabled = surface.enabled;
  let opacity = surface.opacity;
  let source = surface.source;
  let mediaTimeS = timeS;
  let hasContent = true;

  if (surface.clips.length > 0 || surface.sequence) {
    const clip = clipAt(surface.clips, timeS);
    if (!clip) hasContent = false;
    else {
      source = clipSource(surface, clip, media);
      const asset = media.find((m) => m.id === source.mediaId);
      mediaTimeS = mediaTime(clip, asset, timeS);
    }
  }

  const due = surface.cues
    .filter((cue) => cue.timeS <= timeS)
    .sort((a, b) => a.timeS - b.timeS);

  for (const cue of due) {
    if (cue.action === "show") enabled = true;
    else if (cue.action === "hide") enabled = false;
    else if (cue.action === "opacity") {
      opacity = clamp01(typeof cue.value === "number" ? cue.value : opacity);
    }
  }
  return { ...animateSurface({ ...surface, enabled: enabled && hasContent, opacity, source }, timeS, context), mediaTimeS };
}

/** Preview content at the playhead without moving the geometry being calibrated.
 * Empty timeline gaps keep their alignment pattern rather than losing edit handles. */
export function mappingSurfaceAt(surface: Surface, timeS: number, media: readonly MediaRef[], showVisual: boolean): ResolvedSurface {
  const geometry = animateSurface(surface, 0);
  if (!showVisual) return { ...geometry, mediaTimeS: 0 };
  const visual = evaluateSurface(surface, timeS, media);
  return { ...geometry,
    source: visual.enabled ? visual.source : { mediaId: null, rect: surface.source.rect },
    mediaTimeS: visual.mediaTimeS,
  };
}

/**
 * The whole show at `timeS`. Returns the same object when nothing is cued or
 * sequenced, so a static show costs nothing per frame.
 */
export function evaluateShow(show: MapShow, timeS: number, context: SurfaceMotionContext = {}): MapShow {
  const scene = activeScene(show);
  if (
    !scene ||
    !scene.surfaces.some((surface) => surface.cues.length > 0 || surface.clips.length > 0 || surface.sequence || surface.transform || surface.animation || surface.modulation)
  )
    return show;
  return withSurfaces(show, (surfaces) =>
    surfaces.map((surface) => evaluateSurface(surface, timeS, show.media, { lfos: show.lfos, ...context })),
  );
}

/**
 * Transport state as it crosses to the output window. The projector runs its
 * own clock from this anchor rather than being fed a frame at a time, so
 * playback stays smooth and the channel stays quiet.
 */
export interface Transport {
  playing: boolean;
  /** Show time at `anchorMs`. */
  timeS: number;
  /** `Date.now()` when `timeS` was current. */
  anchorMs: number;
}

export function transportTime(transport: Transport, nowMs = Date.now()): number {
  if (!transport.playing) return transport.timeS;
  return transport.timeS + Math.max(nowMs - transport.anchorMs, 0) / 1000;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
