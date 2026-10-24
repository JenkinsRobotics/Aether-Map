export interface SurfaceBend { axis: 'horizontal' | 'vertical'; angleDeg: number }
export function readBend(value: unknown): SurfaceBend | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as Record<string, unknown>;
  if ((v.axis !== 'horizontal' && v.axis !== 'vertical') || typeof v.angleDeg !== 'number' || !Number.isFinite(v.angleDeg)) return;
  return { axis: v.axis, angleDeg: Math.max(-170, Math.min(170, v.angleDeg)) };
}
/** Inverse cylindrical sampling: edges and center remain fixed. Negative angles
 * apply the inverse warp, useful when correcting rather than illustrating a curve. */
export function bentSourceFraction(fraction: number, angleDeg: number): number {
  if (Math.abs(angleDeg) < .001 || fraction <= 0 || fraction >= 1) return fraction;
  const half = Math.min(170, Math.abs(angleDeg)) * Math.PI / 360, x = 2 * fraction - 1;
  return ((angleDeg > 0 ? Math.asin(x * Math.sin(half)) / half : Math.sin(x * half) / Math.sin(half)) + 1) / 2;
}
