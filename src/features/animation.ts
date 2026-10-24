import type { Point, Quad, Surface } from "../document";
import { mapMaskCurves } from '../mask/curves';
import { DEFAULT_TRANSFORM, type FeatureKeyframe, type FeatureTransform } from "./types";
import { SURFACE_PARAMETERS, surfaceParameterBase } from './surface-parameters';
import { modulatedValue } from './shader-motion';
import type { AnimatedProperty, Lfo } from './types';
import type { VisualMotionInputs } from '../visual-motion';

export interface SurfaceMotionContext extends VisualMotionInputs {
  lfos?: readonly Lfo[];
  sceneTimeS?: number;
  /** Calibration uses the saved keys at zero, independent of live devices. */
  modulation?: false;
}

export function surfaceParameterAt(surface: Surface, property: AnimatedProperty, timeS: number, context: SurfaceMotionContext = {}): number {
  const base = surfaceParameterBase(surface, property);
  const keyed = keyframeValue(surface.animation?.[property] ?? [], timeS, base);
  const m = context.modulation === false ? undefined : surface.modulation?.[property];
  const value = m ? modulatedValue(keyed, m, m.source === 'lfo' || m.clock === 'scene' ? context.sceneTimeS ?? timeS : timeS,
    context.levels, context.controls, context.lfos) : keyed;
  // Keep existing saved transform curves unchanged; new motion is always bounded.
  if (!m && property !== 'radiusPx' && property !== 'bendAngleDeg' && property !== 'opacity') return value;
  const spec = SURFACE_PARAMETERS.find(p => p.key === property)!;
  return Number.isFinite(value) ? Math.max(spec.min, Math.min(spec.max, value)) : base;
}

/** Stable sorted evaluation: a key's interpolation controls the segment after it. */
export function keyframeValue(keys: readonly FeatureKeyframe[], timeS: number, fallback: number): number {
  const sorted = [...keys].sort((a, b) => a.timeS - b.timeS);
  if (!sorted.length) return fallback;
  if (timeS < sorted[0].timeS) return sorted[0].value;
  let left = sorted[0];
  for (const right of sorted.slice(1)) {
    if (right.timeS > timeS) {
      if (left.interpolation === "hold") return left.value;
      let t = (timeS - left.timeS) / (right.timeS - left.timeS);
      if (left.interpolation === "smooth") t = t * t * (3 - 2 * t);
      return left.value + (right.value - left.value) * t;
    }
    left = right;
  }
  return left.value;
}

function transformPoints(points: Point[], transform: FeatureTransform, pivot: Point): Point[] {
  const r = transform.rotationDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return points.map(([x, y]) => {
    const dx = (x - pivot[0]) * transform.scaleX, dy = (y - pivot[1]) * transform.scaleY;
    return [pivot[0] + dx * c - dy * s + transform.xPx, pivot[1] + dx * s + dy * c + transform.yPx];
  });
}

export function featureTransformAt(surface: Surface, timeS: number, context: SurfaceMotionContext = { modulation: false }): FeatureTransform {
  const transform = { ...DEFAULT_TRANSFORM, ...surface.transform };
  for (const property of Object.keys(transform) as (keyof FeatureTransform)[])
    transform[property] = surfaceParameterAt(surface, property, timeS, context);
  return transform;
}

/** Convert a visible handle movement back into the feature's original geometry.
 * Moving one quad corner also moves its centroid by a quarter of that delta. */
export function geometryHandleDelta(surface: Surface, timeS: number, delta: Point, corner: boolean, context?: SurfaceMotionContext): Point {
  const t = featureTransformAt(surface, timeS, context), r = t.rotationDeg * Math.PI / 180;
  const weight = corner ? .25 : 0, factor = 1 - weight;
  const a = factor * Math.cos(r) * t.scaleX + weight, b = -factor * Math.sin(r) * t.scaleY;
  const c = factor * Math.sin(r) * t.scaleX, d = factor * Math.cos(r) * t.scaleY + weight;
  const det = a * d - b * c;
  if (Math.abs(det) < .000001) return [0, 0];
  return [(d * delta[0] - b * delta[1]) / det, (-c * delta[0] + a * delta[1]) / det];
}

export function animateSurface(surface: Surface, timeS: number, context: SurfaceMotionContext = { modulation: false }): Surface {
  if (!surface.transform && !surface.animation && !surface.modulation) return surface;
  const transform = featureTransformAt(surface, timeS, context);
  const opacity = surfaceParameterAt(surface, 'opacity', timeS, context);
  const radius = surface.animation?.radiusPx?.length || surface.modulation?.radiusPx;
  const bend = surface.animation?.bendAngleDeg?.length || surface.modulation?.bendAngleDeg;
  const pivot: Point = [surface.corners.reduce((a, p) => a + p[0], 0) / 4, surface.corners.reduce((a, p) => a + p[1], 0) / 4];
  return { ...surface, opacity, corners: transformPoints(surface.corners, transform, pivot) as Quad,
    ...(radius ? { radiusPx: surfaceParameterAt(surface, 'radiusPx', timeS, context) } : {}),
    ...(bend ? { bend: { axis: surface.bend?.axis ?? 'horizontal', angleDeg: surfaceParameterAt(surface, 'bendAngleDeg', timeS, context) } } : {}),
    masks: surface.masks.map((shape) => transformPoints(shape, transform, pivot)),
    ...(surface.maskCurves ? { maskCurves: mapMaskCurves(surface.maskCurves, p => transformPoints([p], transform, pivot)[0]) } : {}) };
}

export function putKeyframe(keys: FeatureKeyframe[], key: FeatureKeyframe): FeatureKeyframe[] {
  return [...keys.filter((other) => other.id !== key.id && Math.abs(other.timeS - key.timeS) > 0.0001), key].sort((a, b) => a.timeS - b.timeS);
}

export const ANIMATED_PROPERTIES = SURFACE_PARAMETERS.map(({ key, label }) => ({ value: key, label }));
