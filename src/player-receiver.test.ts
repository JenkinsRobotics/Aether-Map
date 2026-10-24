// @vitest-environment jsdom
/** Executes the shipped kiosk scripts with deterministic media/HTTP adapters.
 * These are lifecycle checks, not real WebRTC, decoder, GPU or browser acceptance. */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const receiverSource = readFileSync('player/aether_receiver.py', 'utf8').split('SCRIPT = r"""')[1].split('"""')[0];
const startSource = readFileSync('player/aether_player.py', 'utf8').split('PLAYER_START_PAGE = """')[1].split('</script>')[0].split('<script>')[1];
class Track extends EventTarget {
  readyState = 'live';
  constructor(public kind: string, public id: string) { super(); }
  stop = vi.fn(() => { this.readyState = 'ended'; });
}
class Stream {
  tracks: Track[] = [];
  getTracks = () => this.tracks;
  getVideoTracks = () => this.tracks.filter(track => track.kind === 'video');
  addTrack = (track: Track) => this.tracks.push(track);
}
class Peer extends EventTarget {
  static instances: Peer[] = [];
  connectionState = 'new'; iceGatheringState = 'complete'; localDescription = { sdp: 'v=0\r\nanswer' };
  ontrack: ((event: { track: Track }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  setRemoteDescription = vi.fn(async () => {}); createAnswer = vi.fn(async () => this.localDescription);
  setLocalDescription = vi.fn(async () => {});
  close = vi.fn(() => { this.connectionState = 'closed'; this.onconnectionstatechange?.(); });
  constructor() { super(); Peer.instances.push(this); }
  state(next: string) { this.connectionState = next; this.onconnectionstatechange?.(); }
}
let session: { id: string; offer: { type: string; sdp: string } } | null;
let fetcher: ReturnType<typeof vi.fn>, network: boolean, ready: boolean, generation: string;
let claimed: boolean, pairCode: string;
let play: ReturnType<typeof vi.spyOn>;
const flush = () => vi.advanceTimersByTimeAsync(0);
function execute(source: string) {
  const names = ['window', 'document', 'navigator', 'RTCPeerConnection', 'MediaStream', 'playerPermissions', 'fetch', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date', 'AbortController', 'AbortSignal', 'CustomEvent'];
  const run = new Function(...names, source);
  run(window, document, navigator, Peer, Stream, { play_audio: true, keep_display_awake: false }, fetcher, setInterval, clearInterval, setTimeout, clearTimeout, Date, AbortController, AbortSignal, CustomEvent);
}
function video() { return document.querySelector('video')!; }
function start(withStatus = false) {
  if (withStatus) execute(startSource);
  execute(receiverSource);
  Object.defineProperty(video(), 'videoWidth', { configurable: true, value: 1280 });
}
function incomingVideo() {
  const track = new Track('video', 'video');
  Peer.instances.at(-1)!.ontrack?.({ track });
  return track;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0); Peer.instances = []; network = true; ready = true; generation = 'one'; claimed = true; pairCode = '001234';
  document.body.innerHTML = '<h1></h1><strong id="code"></strong><p id="status"></p><p id="detail"></p><img id="pairing-qr"/><p id="pairing-guidance"></p>';
  delete document.body.dataset.liveCast;
  session = { id: 'lease1', offer: { type: 'offer', sdp: 'v=0\r\noffer' } };
  fetcher = vi.fn(async (path: string, options?: RequestInit) => {
    if (!network) throw new Error('offline');
    return { ok: true, json: async () => path === '/player-status'
      ? { ready, generation, claimed, code: pairCode, pairingUrl: claimed ? '' : `https://studio.local/map/index.html?pair=${pairCode}`, setup: { step: 'done', permissions: { play_audio: true, keep_display_awake: false } } }
      : options?.method === 'POST' ? {} : { session } };
  });
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLVideoElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('playing')); return Promise.resolve();
  });
});
afterEach(() => {
  window.dispatchEvent(new Event('pagehide')); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  document.body.innerHTML = '';
});
it('suspends the saved show, retains a newer release, and resumes it after Stop', async () => {
  start(true); await flush(); const frame = document.querySelector('iframe')!;
  expect(frame.getAttribute('src')).toContain('release=one');
  Peer.instances[0].state('connected'); incomingVideo(); await flush();
  expect(document.body.dataset.liveCast).toBe('playing'); expect(frame.src).toBe('about:blank');
  generation = 'two'; await vi.advanceTimersByTimeAsync(4000);
  expect(frame.src).toBe('about:blank'); expect(frame.dataset.resume).toContain('release=two');
  session = null; await vi.advanceTimersByTimeAsync(1000);
  expect(frame.getAttribute('src')).toContain('release=two'); expect(frame.dataset.resume).toBeUndefined();
  expect(video().style.display).toBe('none'); expect(Peer.instances[0].close).toHaveBeenCalledOnce();
});
it('keeps a newly assigned show suspended and removes a stopped assignment', async () => {
  ready = false; start(true); await flush(); incomingVideo(); await flush();
  expect(document.querySelector('iframe')).toBeNull();
  ready = true; await vi.advanceTimersByTimeAsync(2000);
  expect(document.querySelector('iframe')!.src).toBe('about:blank');
  ready = false; await vi.advanceTimersByTimeAsync(2000); expect(document.querySelector('iframe')).toBeNull();
});
it('keeps streamless audio and video tracks together and waits for visible video', async () => {
  start(); await flush(); const peer = Peer.instances[0];
  peer.ontrack?.({ track: new Track('audio', 'audio') }); await flush();
  expect(document.body.dataset.liveCast).toBeUndefined(); incomingVideo(); await flush();
  expect((video().srcObject as unknown as Stream).getTracks()).toHaveLength(2);
  expect(document.body.dataset.liveCast).toBe('playing');
  expect(fetcher.mock.calls.some(([, opts]) => opts?.body && JSON.parse(String(opts.body)).state === 'connected')).toBe(true);
});
it('offers an explicit action when autoplay is blocked', async () => {
  play.mockRejectedValueOnce(new DOMException('gesture needed', 'NotAllowedError'));
  start(); await flush(); incomingVideo(); await flush();
  expect(document.body.dataset.liveCast).toBeUndefined();
  const button = document.querySelector('button')!; expect(button.parentElement!.style.display).toBe('block');
  expect(button.parentElement!.textContent).toContain('paused live playback');
  button.click(); await flush(); expect(document.body.dataset.liveCast).toBe('playing');
  expect(button.parentElement!.style.display).toBe('none');
});
it('allows a short disconnect, fails a sustained one, and does not replay a failed offer', async () => {
  start(); await flush(); incomingVideo(); const peer = Peer.instances[0]; peer.state('connected');
  peer.state('disconnected'); await vi.advanceTimersByTimeAsync(3000); expect(peer.close).not.toHaveBeenCalled();
  peer.state('connected'); await vi.advanceTimersByTimeAsync(6000); expect(peer.close).not.toHaveBeenCalled();
  peer.state('disconnected'); await vi.advanceTimersByTimeAsync(8000); expect(peer.close).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(5000); expect(Peer.instances).toHaveLength(1);
  session = { ...session!, id: 'lease2' }; await vi.advanceTimersByTimeAsync(1000);
  const next = Peer.instances[1]; expect(next).toBeTruthy(); next.state('disconnected');
  await vi.advanceTimersByTimeAsync(8000); expect(next.close).toHaveBeenCalledOnce();
});
it('restores the saved show after signalling loss and never reinstates stale live media', async () => {
  start(true); await flush(); const track = incomingVideo(); await flush();
  network = false; await vi.advanceTimersByTimeAsync(8000);
  expect(document.body.dataset.liveCast).toBeUndefined(); expect(track.stop).toHaveBeenCalledOnce();
  expect(document.querySelector('iframe')!.src).not.toBe('about:blank');
  network = true; await vi.advanceTimersByTimeAsync(5000); expect(Peer.instances).toHaveLength(1);
});
it('times out a connected session that never delivers playable video', async () => {
  start(); await flush(); Peer.instances[0].state('connected');
  await vi.advanceTimersByTimeAsync(25000); expect(Peer.instances[0].close).toHaveBeenCalledOnce();
});
it('stops on ended remote video and releases media and pollers on page exit', async () => {
  start(); await flush(); const track = incomingVideo(); await flush();
  track.dispatchEvent(new Event('ended')); expect(Peer.instances[0].close).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('pagehide')); const count = fetcher.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000); expect(fetcher).toHaveBeenCalledTimes(count);
});

it('shows a scannable local image only while unclaimed and rotates it with the code', async () => {
  ready = false; claimed = false; session = null; start(true); await flush();
  const image = document.getElementById('pairing-qr') as HTMLImageElement;
  expect(image.hidden).toBe(false); expect(image.getAttribute('src')).toBe('/pairing.svg?code=001234');
  expect(document.getElementById('pairing-guidance')!.textContent).toContain('https://studio.local');
  pairCode = '654321'; await vi.advanceTimersByTimeAsync(2000);
  expect(image.getAttribute('src')).toBe('/pairing.svg?code=654321');
  claimed = true; await vi.advanceTimersByTimeAsync(2000);
  expect(image.hidden).toBe(true); expect(image.hasAttribute('src')).toBe(false);
});
