// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withRequestTimeout } from './request-timeout';
import { devices } from './api';
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('does not start a request after its owner has already cancelled', async () => {
  const parent = new AbortController(), run = vi.fn(); parent.abort();
  await expect(withRequestTimeout(1000, run, parent.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(run).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it('releases timeout and parent listener when a request succeeds', async () => {
  const parent = new AbortController(), remove = vi.spyOn(parent.signal, 'removeEventListener');
  expect(await withRequestTimeout(1000, async () => 42, parent.signal)).toBe(42);
  expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});
it('the actual cast-poll API aborts an in-flight fetch without AbortSignal.any', async () => {
  let request!: AbortSignal;
  const fetcher = vi.fn((_path, init) => new Promise((_resolve, reject) => {
    request = init.signal; request.addEventListener('abort', () => reject(request.reason));
  }));
  vi.stubGlobal('fetch', fetcher);
  const parent = new AbortController();
  const result = devices.castPoll('pi', 'lease', parent.signal).catch(error => error);
  parent.abort(); expect((await result).name).toBe('AbortError');
  expect(request.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
it('pairing gets a bounded timeout while retaining the normal authenticated request path', async () => {
  const fetcher = vi.fn((_path, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))));
  vi.stubGlobal('fetch', fetcher);
  const result = devices.claim('001234').catch(error => error);
  await vi.advanceTimersByTimeAsync(10000); expect((await result).name).toBe('TimeoutError');
  expect(fetcher).toHaveBeenCalledWith('/api/map/devices/claim', expect.objectContaining({ method: 'POST', body: '{"code":"001234"}' }));
  expect(vi.getTimerCount()).toBe(0);
});
