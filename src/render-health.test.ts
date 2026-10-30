// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { startRenderHealth, lowPowerPlayer, type RenderHealth } from './render-health';

afterEach(() => { vi.useRealTimers(); });

it('reports frames drawn per second, WebGL support and the latest page error', () => {
  vi.useFakeTimers();
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frame = fn; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const reports: RenderHealth[] = [];
  const stop = startRenderHealth(report => reports.push(report), 10000, () => false);
  for (let i = 0; i < 240; i++) frame!(i * 41.7);
  dispatchEvent(new ErrorEvent('error', { message: 'WebGL context lost' }));
  vi.advanceTimersByTime(10000);
  expect(reports).toEqual([{ fps: 24, webgl: false, error: 'WebGL context lost' }]);
  vi.advanceTimersByTime(10000);
  expect(reports[1]).toEqual({ fps: 0, webgl: false, error: 'WebGL context lost' });
  stop();
});

it('knows which players cannot run generators', () => {
  expect(lowPowerPlayer({ model: 'Raspberry Pi 2 Model B Rev 1.1' })).toBe(true);
  expect(lowPowerPlayer({ model: 'Raspberry Pi Zero 2 W Rev 1.0' })).toBe(true);
  expect(lowPowerPlayer({ model: 'Raspberry Pi 5 Model B Rev 1.0' })).toBe(false);
  expect(lowPowerPlayer({ model: 'Raspberry Pi 4 Model B', render: { fps: 30, webgl: false, error: '', age_s: 5 } })).toBe(true);
  expect(lowPowerPlayer(undefined)).toBe(false);
});
