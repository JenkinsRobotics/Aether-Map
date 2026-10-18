/** Integer-indexed timestamps avoid wall clocks and accumulated frame drift. */
export const EXPORT_SIZES = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
} as const;
export const EXPORT_FRAME_RATES = {
  '24': [24, 1], '25': [25, 1], '30': [30, 1], '50': [50, 1], '60': [60, 1],
  '23.976': [24000, 1001], '29.97': [30000, 1001], '59.94': [60000, 1001],
} as const;
export interface ExportRange { startS: number; endS: number }
export interface ExportPlan extends ExportRange {
  width: number; height: number; frameRateNumerator: number; frameRateDenominator: number;
  frameCount: number; durationUs: number;
}
export const MAX_EXPORT_DURATION_S = 3600;

export function validateExportRange(range: ExportRange): void {
  if (!Number.isFinite(range.startS) || !Number.isFinite(range.endS) || range.startS < 0 ||
      range.endS <= range.startS || range.endS > 604800 || range.endS - range.startS > MAX_EXPORT_DURATION_S) {
    throw new Error('Export must cover a positive interval of at most one hour within the timeline.');
  }
  if (Math.round((range.endS - range.startS) * 1e6) < 1) throw new Error('Export interval is shorter than one microsecond.');
}

export function createExportPlan(range: ExportRange, size: keyof typeof EXPORT_SIZES, frameRate: keyof typeof EXPORT_FRAME_RATES): Readonly<ExportPlan> {
  validateExportRange(range);
  if (!Object.hasOwn(EXPORT_SIZES, size) || !Object.hasOwn(EXPORT_FRAME_RATES, frameRate)) throw new Error('Unsupported export resolution or frame rate.');
  const [numerator, denominator] = EXPORT_FRAME_RATES[frameRate];
  const durationUs = Math.round((range.endS - range.startS) * 1e6);
  // Duration is quantized once to the encoder's microsecond timebase.
  let frameCount = Math.ceil(durationUs * numerator / (1e6 * denominator));
  while (Math.round((frameCount - 1) * 1e6 * denominator / numerator) >= durationUs) frameCount--;
  return Object.freeze({ startS: range.startS, endS: range.startS + durationUs / 1e6, ...EXPORT_SIZES[size], frameRateNumerator: numerator,
    frameRateDenominator: denominator, frameCount, durationUs });
}

export function exportFrame(plan: ExportPlan, index: number) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= plan.frameCount) throw new Error('Export frame index is out of range.');
  const timestampUs = Math.round(index * 1e6 * plan.frameRateDenominator / plan.frameRateNumerator);
  const endUs = Math.min(plan.durationUs, Math.round((index + 1) * 1e6 * plan.frameRateDenominator / plan.frameRateNumerator));
  return { index, timeS: plan.startS + index * plan.frameRateDenominator / plan.frameRateNumerator,
    timestampUs, durationUs: endUs - timestampUs };
}
