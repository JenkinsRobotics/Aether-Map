// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { devices } from './api';
import { gatherCandidates, mirrorDevice } from './live-cast';
import { castStatistics } from './live-cast-stats';
import { setCastStream } from './live/casts';
vi.mock('./live/casts', () => ({ setCastStream: vi.fn() }));

vi.mock('./api', () => ({ devices: { castStart: vi.fn(), castPoll: vi.fn(), castStop: vi.fn() } }));
class Track extends EventTarget {
  readyState = 'live';
  stop = vi.fn(() => { this.readyState = 'ended'; });
}
class Peer extends EventTarget {
  static instances: Peer[] = [];
  iceGatheringState = 'complete'; connectionState = 'connected';
  localDescription = { sdp: 'v=0\r\noffer' }; remoteDescription: unknown = null;
  addTrack = vi.fn(); createDataChannel = vi.fn(); createOffer = vi.fn(async () => this.localDescription);
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async (value: unknown) => { this.remoteDescription = value; });
  getStats = vi.fn(async () => new Map());
  close = vi.fn(() => { this.connectionState = 'closed'; });
  constructor() { super(); Peer.instances.push(this); }
}
let video: Track, audio: Track, capture: MediaStream, choose: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0); vi.clearAllMocks(); Peer.instances = [];
  video = new Track(); audio = new Track();
  capture = { getTracks: () => [video, audio], getVideoTracks: () => [video], getAudioTracks: () => [audio] } as unknown as MediaStream;
  choose = vi.fn(async () => capture);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia: choose } });
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.mocked(devices.castStart).mockResolvedValue({ session_id: 'lease', answer: null, state: 'waiting' });
  vi.mocked(devices.castPoll).mockResolvedValue({ session_id: 'lease', answer: { type: 'answer', sdp: 'v=0\r\nanswer' }, state: 'connected' });
  vi.mocked(devices.castStop).mockResolvedValue({ stopped: true });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('live capture lifecycle', () => {
  it('does not acquire devices when already cancelled', async () => {
    const control = new AbortController(); control.abort();
    await mirrorDevice('pi', control.signal, vi.fn()); expect(choose).not.toHaveBeenCalled();
  });
  it('finishes Stop during the picker and disposes any late capture', async () => {
    let picked!: (stream: MediaStream) => void;
    choose.mockImplementation(() => new Promise(resolve => { picked = resolve; }));
    const control = new AbortController(), status = vi.fn();
    const run = mirrorDevice('pi', control.signal, status);
    control.abort(); await run; expect(Peer.instances).toHaveLength(0);
    picked(capture); await flush();
    expect(video.stop).toHaveBeenCalledOnce(); expect(audio.stop).toHaveBeenCalledOnce();
    expect(devices.castStart).not.toHaveBeenCalled();
  });
  it('cleans captured tracks if peer construction fails', async () => {
    vi.stubGlobal('RTCPeerConnection', class { constructor() { throw new Error('unsupported'); } });
    await expect(mirrorDevice('pi', new AbortController().signal, vi.fn())).rejects.toThrow('unsupported');
    expect(video.stop).toHaveBeenCalledOnce(); expect(audio.stop).toHaveBeenCalledOnce();
  });
  it('revokes a lease that arrived after Stop and never polls it', async () => {
    let finish!: (value: Awaited<ReturnType<typeof devices.castStart>>) => void;
    vi.mocked(devices.castStart).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const control = new AbortController(), run = mirrorDevice('pi', control.signal, vi.fn());
    await flush(); control.abort();
    expect(video.stop).toHaveBeenCalledOnce(); expect(Peer.instances[0].close).toHaveBeenCalledOnce();
    finish({ session_id: 'late', answer: null, state: 'waiting' }); await run;
    expect(devices.castStop).toHaveBeenCalledWith('pi', 'late'); expect(devices.castPoll).not.toHaveBeenCalled();
  });
  it('mirrors only after receiver readiness and immediately stops when browser sharing ends', async () => {
    const status = vi.fn(), diagnostic = vi.fn();
    const run = mirrorDevice('pi', new AbortController().signal, status, diagnostic);
    await flush(); expect(status).toHaveBeenLastCalledWith('Mirroring');
    expect(diagnostic).toHaveBeenCalledWith({ audio: true });
    video.dispatchEvent(new Event('ended')); await run;
    expect(devices.castStop).toHaveBeenCalledWith('pi', 'lease');
    expect(video.stop).toHaveBeenCalledOnce(); expect(audio.stop).toHaveBeenCalledOnce();
    const calls = vi.mocked(devices.castPoll).mock.calls.length; await vi.advanceTimersByTimeAsync(10000);
    expect(devices.castPoll).toHaveBeenCalledTimes(calls);
  });
  it('marks a cast for a show surface and previews it here, but leaves a mirror unmarked', async () => {
    const cast = mirrorDevice('pi', new AbortController().signal, vi.fn(), undefined, true);
    await flush(); const peer = Peer.instances[0];
    expect(peer.createDataChannel).toHaveBeenCalledWith('aether-cast');
    expect(peer.createDataChannel.mock.invocationCallOrder[0]).toBeLessThan(peer.createOffer.mock.invocationCallOrder[0]);
    expect(setCastStream).toHaveBeenLastCalledWith(capture);
    video.dispatchEvent(new Event('ended')); await cast;
    expect(setCastStream).toHaveBeenLastCalledWith(null);
    vi.mocked(setCastStream).mockClear(); video.readyState = 'live'; audio.readyState = 'live';
    const mirror = mirrorDevice('pi', new AbortController().signal, vi.fn());
    await flush(); expect(Peer.instances[1].createDataChannel).not.toHaveBeenCalled();
    video.dispatchEvent(new Event('ended')); await mirror;
    expect(setCastStream).not.toHaveBeenCalled();
  });
  it('allows transient disconnection but stops one that lasts eight seconds', async () => {
    const control = new AbortController(), status = vi.fn();
    const run = mirrorDevice('pi', control.signal, status); const result = run.catch(error => error);
    await flush(); const peer = Peer.instances[0]; peer.connectionState = 'disconnected';
    await vi.advanceTimersByTimeAsync(3000); expect(status).toHaveBeenLastCalledWith('Reconnecting');
    peer.connectionState = 'connected'; await vi.advanceTimersByTimeAsync(1000); expect(status).toHaveBeenLastCalledWith('Mirroring');
    peer.connectionState = 'disconnected'; await vi.advanceTimersByTimeAsync(9000);
    expect((await result).message).toMatch('media connection was lost'); expect(video.stop).toHaveBeenCalledOnce();
  });
  it('requires actual receiver playback even when ICE already connected', async () => {
    vi.mocked(devices.castPoll).mockResolvedValue({ session_id: 'lease', answer: null, state: 'connecting' });
    const run = mirrorDevice('pi', new AbortController().signal, vi.fn()).catch(error => error);
    await vi.advanceTimersByTimeAsync(26000);
    expect((await run).message).toMatch('did not start playback'); expect(video.stop).toHaveBeenCalledOnce();
  });
  it('recovers a short signalling outage and closes after sustained loss', async () => {
    const status = vi.fn(), run = mirrorDevice('pi', new AbortController().signal, status).catch(error => error);
    await flush(); vi.mocked(devices.castPoll).mockRejectedValue(new Error('offline'));
    await vi.advanceTimersByTimeAsync(2000); expect(status).toHaveBeenLastCalledWith('Reconnecting');
    vi.mocked(devices.castPoll).mockResolvedValue({ session_id: 'lease', answer: null, state: 'connected' });
    await vi.advanceTimersByTimeAsync(1000); expect(status).toHaveBeenLastCalledWith('Mirroring');
    vi.mocked(devices.castPoll).mockRejectedValue(new Error('offline'));
    await vi.advanceTimersByTimeAsync(9000); expect((await run).message).toMatch('stopped responding');
    expect(devices.castStop).toHaveBeenCalledOnce();
  });
  it('releases capture at the watchdog deadline even when polling is still in flight', async () => {
    const run = mirrorDevice('pi', new AbortController().signal, vi.fn()).catch(error => error);
    await flush();
    vi.mocked(devices.castPoll).mockImplementation((_device, _lease, signal) => new Promise((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
    }));
    await vi.advanceTimersByTimeAsync(8000);
    expect(video.stop).toHaveBeenCalledOnce(); expect((await run).message).toMatch('stopped responding');
    expect(devices.castStop).toHaveBeenCalledOnce();
  });
  it('does not retry revoked access', async () => {
    vi.mocked(devices.castPoll).mockRejectedValue({ status: 403, message: 'Revoked' });
    await expect(mirrorDevice('pi', new AbortController().signal, vi.fn())).rejects.toMatchObject({ status: 403 });
    expect(devices.castPoll).toHaveBeenCalledOnce();
  });
  it('rejects invalid receiver SDP without retrying indefinitely', async () => {
    vi.mocked(devices.castPoll).mockResolvedValue({ session_id: 'lease', answer: { type: 'answer', sdp: 'bad' }, state: 'connecting' });
    const control = new AbortController();
    // Install negotiation failure before the first poll finishes.
    const run = mirrorDevice('pi', control.signal, vi.fn()).catch(error => error);
    await Promise.resolve(); await Promise.resolve();
    Peer.instances.at(-1)!.setRemoteDescription.mockRejectedValue(new Error('bad SDP'));
    await flush(); expect((await run).message).toMatch('unsupported video connection');
  });
  it('cancels candidate gathering without retaining listeners or a five-second timer', async () => {
    const peer = new Peer(); peer.iceGatheringState = 'gathering';
    const control = new AbortController(), remove = vi.spyOn(peer, 'removeEventListener');
    const waiting = gatherCandidates(peer as unknown as RTCPeerConnection, control.signal);
    control.abort(); await waiting;
    expect(remove).toHaveBeenCalledWith('icegatheringstatechange', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('measured connection statistics', () => {
  const report = (rows: object[]) => new Map(rows.map((row, i) => [String(i), { id: String(i), ...row }])) as unknown as RTCStatsReport;
  it('uses video counter deltas and only the selected successful network pair', () => {
    const first = castStatistics(report([{ type: 'outbound-rtp', kind: 'video', bytesSent: 1000, timestamp: 1000 }]), new Map(), false);
    expect(first.diagnostics.videoMbps).toBeUndefined();
    const second = castStatistics(report([
      { type: 'outbound-rtp', kind: 'video', bytesSent: 501000, timestamp: 2000, frameWidth: 1920, frameHeight: 1080, framesPerSecond: 29.7, qualityLimitationReason: 'bandwidth' },
      { type: 'outbound-rtp', kind: 'audio', bytesSent: 5000000, timestamp: 2000 },
      { type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.021 },
      { type: 'transport', selectedCandidatePairId: '2' },
      { type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 10 },
    ]), first.counters, false);
    expect(second.diagnostics).toEqual({ audio: false, videoMbps: 4, width: 1920, height: 1080, fps: 29.7, roundTripMs: 21, limitation: 'bandwidth' });
  });
  it('does not turn missing, reset or non-finite counters into measured rates', () => {
    const result = castStatistics(report([{ type: 'outbound-rtp', kind: 'video', bytesSent: 0, timestamp: 100, framesPerSecond: NaN }, { type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 1 }]), new Map([['0', { bytes: 100, timestamp: 90 }]]), true);
    expect(result.diagnostics).toEqual({ audio: true });
  });
});

it('splits a large live show into counted pieces that rejoin exactly', async () => {
  const { livePieces } = await import('./live-cast');
  expect(livePieces('small')).toEqual(['small']);
  const big = 'x'.repeat(130001);
  const pieces = livePieces(big);
  expect(pieces[0]).toBe('#3');
  expect(pieces.slice(1).join('')).toBe(big);
  expect(Math.max(...pieces.map(p => p.length))).toBeLessThanOrEqual(60000);
});
