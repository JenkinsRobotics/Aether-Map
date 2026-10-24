/** Renderer-independent pose measurements. No frames or device IDs enter a show. */
export const BODY_SIGNALS = [
  { value: 'x', label: 'Body left / right', help: 'Center of the shoulders and hips across the camera frame.' },
  { value: 'y', label: 'Body height', help: 'Center of the torso from bottom to top of the camera frame.' },
  { value: 'size', label: 'Body size', help: 'Visible head-to-ankle height; move toward or away from the camera.' },
  { value: 'leftHand', label: 'Left hand height', help: 'Your left wrist from bottom to top of the camera frame.' },
  { value: 'rightHand', label: 'Right hand height', help: 'Your right wrist from bottom to top of the camera frame.' },
  { value: 'spread', label: 'Hand spread', help: 'Horizontal distance between your wrists across the frame.' },
  { value: 'lean', label: 'Body lean', help: 'Shoulder center relative to hip center: left is 0, upright is 0.5, right is 1.' },
  { value: 'presence', label: 'Body visible', help: '1 when the torso is confidently visible; 0 when tracking is lost.' },
] as const;
export type BodySignal = typeof BODY_SIGNALS[number]['value'];
export type BodySignals = Partial<Record<BodySignal, number>>;
export interface BodyLandmark { x: number; y: number; z: number; visibility: number; presence?: number }
export interface BodySettings { deviceId: string; mirror: boolean; smoothingS: number; confidence: number }
export const DEFAULT_BODY_SETTINGS: BodySettings = { deviceId: '', mirror: true, smoothingS: .12, confidence: .5 };
export const isBodySignal = (value: unknown): value is BodySignal => BODY_SIGNALS.some(s => s.value === value);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function readBodySettings(value: unknown): BodySettings {
  const r = value && typeof value === 'object' ? value as Partial<BodySettings> : {};
  return { deviceId: typeof r.deviceId === 'string' ? r.deviceId.slice(0,1024) : '', mirror: r.mirror !== false,
    smoothingS: typeof r.smoothingS === 'number' && Number.isFinite(r.smoothingS) ? Math.max(0,Math.min(2,r.smoothingS)) : .12,
    confidence: typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? Math.max(.1,Math.min(.95,r.confidence)) : .5 };
}
export function bodySignals(points: readonly BodyLandmark[], settings: BodySettings): BodySignals {
  const valid = (i: number) => { const p = points[i]; return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
    && Number.isFinite(p.visibility) && p.visibility >= settings.confidence && (p.presence === undefined || p.presence >= settings.confidence); };
  if (![11,12,23,24].every(valid)) return {};
  const x = (i: number) => settings.mirror ? 1 - points[i].x : points[i].x;
  const shoulderX = (x(11)+x(12))/2, hipX = (x(23)+x(24))/2;
  const shoulderY = (points[11].y+points[12].y)/2, hipY = (points[23].y+points[24].y)/2;
  const result: BodySignals = { x: clamp((shoulderX+hipX)/2), y:clamp(1-(shoulderY+hipY)/2),
    lean: clamp(.5+(shoulderX-hipX)/Math.max(.1,Math.abs(hipY-shoulderY))* .5), presence:1 };
  if (valid(15)) result.leftHand = clamp(1-points[15].y);
  if (valid(16)) result.rightHand = clamp(1-points[16].y);
  if (valid(15) && valid(16)) result.spread = clamp(Math.abs(points[15].x-points[16].x));
  if ([0,27,28].every(valid)) result.size = clamp(Math.max(points[27].y,points[28].y)-points[0].y);
  return result;
}
/** Smooth only visible signals. Missing landmarks disappear immediately, never latch. */
export function smoothBodySignals(previous: BodySignals, next: BodySignals, elapsedS: number, smoothingS: number): BodySignals {
  const mix = smoothingS <= 0 ? 1 : 1-Math.exp(-Math.max(0,elapsedS)/smoothingS);
  return Object.fromEntries(Object.entries(next).map(([key,value]) => [key,key === 'presence' || previous[key as BodySignal] === undefined ? value
    : previous[key as BodySignal]!+(value-previous[key as BodySignal]!)*mix]));
}
/** Host/output messages are bounded and never trusted as arbitrary object keys. */
export function readBodySignals(raw: unknown): BodySignals {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string,unknown>;
  return Object.fromEntries(BODY_SIGNALS.flatMap(({value:key}) => typeof source[key] === 'number' && Number.isFinite(source[key]) ? [[key,clamp(source[key] as number)]] : []));
}
export function bodyLevels(signals: BodySignals): Record<string,number> {
  return Object.fromEntries(Object.entries(signals).map(([key,value]) => [`body:${key}`,value]));
}
