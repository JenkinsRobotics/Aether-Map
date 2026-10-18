import { describe, expect, it } from 'vitest';
import { createExportPlan, exportFrame, EXPORT_FRAME_RATES } from './export-plan';

describe('offline frame timebase', () => {
  it.each(Object.keys(EXPORT_FRAME_RATES) as (keyof typeof EXPORT_FRAME_RATES)[])('keeps %s fps exact across an hour without duplicate or missing timestamps', fps => {
    const plan = createExportPlan({ startS: 123, endS: 3723 }, '4k', fps);
    let endUs = 0;
    for (let i = 0; i < plan.frameCount; i++) {
      const frame = exportFrame(plan, i);
      if (frame.timestampUs !== endUs || frame.durationUs <= 0) throw new Error(`Broken frame interval at ${i}`);
      endUs = frame.timestampUs + frame.durationUs;
    }
    expect(endUs).toBe(3_600_000_000);
    expect(plan).toMatchObject({ width: 3840, height: 2160 });
    expect(exportFrame(plan, 1000).timeS).toBe(123 + 1000 * plan.frameRateDenominator / plan.frameRateNumerator);
    expect(Object.isFrozen(plan)).toBe(true);
  });
  it('retains a short last frame but omits a rounded zero-length frame', () => {
    const rounded = createExportPlan({ startS: 0, endS: .016667 }, '720p', '60');
    expect(rounded.frameCount).toBe(1);
    expect(exportFrame(rounded, 0).durationUs).toBe(16667);
    const partial = createExportPlan({ startS: 0, endS: .016668 }, '1080p', '60');
    expect(partial.frameCount).toBe(2);
    expect(exportFrame(partial, 1).durationUs).toBe(1);
  });
  it('refuses invalid intervals, formats and indices before rendering', () => {
    for (const [startS, endS] of [[-1, 2], [1, 1], [2, 1], [0, Infinity], [NaN, 1], [0, 3601], [604799, 604801], [0, 1e-8]]) {
      expect(() => createExportPlan({ startS, endS }, '1080p', '30')).toThrow();
    }
    expect(() => createExportPlan({ startS: 0, endS: 1 }, 'toString' as '4k', '30')).toThrow();
    const plan = createExportPlan({ startS: 0, endS: 1 }, '720p', '30');
    for (const index of [-1, .5, 30, NaN]) expect(() => exportFrame(plan, index)).toThrow();
  });
});
