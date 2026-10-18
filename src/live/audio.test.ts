// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { audioState, configureAudio, startAudio, stopAudio } from './audio';

afterEach(() => { stopAudio(); vi.unstubAllGlobals(); });
test('stopping while microphone permission is pending closes the late stream without starting audio', async () => {
  let resolve!: (stream: MediaStream) => void;
  const getUserMedia = vi.fn(() => new Promise<MediaStream>(done => { resolve = done; }));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const stop = vi.fn(), pending = startAudio();
  await startAudio(); expect(getUserMedia).toHaveBeenCalledTimes(1);
  stopAudio(); resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream); await pending;
  expect(stop).toHaveBeenCalledOnce(); expect(audioState().listening).toBe(false);
});
test('audio configuration changes are bounded and do not request microphone access', () => {
  const getUserMedia = vi.fn(); vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  configureAudio({ sensitivity: 100, smoothing: -1 });
  expect(audioState().settings).toEqual({ sensitivity: 10, smoothing: 0 });
  expect(JSON.parse(localStorage.getItem('aether-map.audio-settings')!)).toEqual({ sensitivity: 10, smoothing: 0 });
  expect(getUserMedia).not.toHaveBeenCalled();
});
