import { describe, expect, it, vi } from 'vitest';
import { renderOfflineAudio, MAX_OFFLINE_AUDIO_BYTES } from './audio-render';
import { audioFixture } from './audio-fixtures';
import { createTrackEQ, configureTrackEQ } from '../live/timeline-audio-engine';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function buffer(duration = 2, channels = 2) {
  return { duration, sampleRate: 48000, length: duration * 48000, numberOfChannels: channels } as AudioBuffer;
}
function runtime() {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() });
  const node = () => {
    const result = { connect: vi.fn(), disconnect: vi.fn(), gain: param(), frequency: param(), Q: param(),
      type: '', buffer: null as AudioBuffer | null, loop: true, start: vi.fn() };
    result.connect.mockImplementation(target => target);
    return result;
  };
  const nodes: ReturnType<typeof node>[] = [], sources: ReturnType<typeof node>[] = [];
  const newNode = () => { const n = node(); nodes.push(n); return n; };
  const rendered = buffer(8);
  const context = { destination: node(), createGain: vi.fn(newNode), createBiquadFilter: vi.fn(newNode),
    createBufferSource: vi.fn(() => { const n = newNode(); sources.push(n); return n; }),
    decodeAudioData: vi.fn(async () => buffer()), startRendering: vi.fn(async () => rendered) };
  const createContext = vi.fn(() => context as unknown as OfflineAudioContext);
  const load = vi.fn(async () => new ArrayBuffer(16));
  return { context, createContext, load, nodes, sources, rendered };
}

describe('offline Web Audio runtime adapter', () => {
  it('decodes repeated media once and schedules exact trimmed loops through the shared EQ graph', async () => {
    const show = audioFixture(), r = runtime();
    show.tracks![1].eq = { enabled: true, lowDb: 3, midDb: -2, highDb: 1 };
    expect(await renderOfflineAudio(show, { startS: 1.5, endS: 6 }, r)).toBe(r.rendered);
    expect(r.createContext).toHaveBeenCalledWith({ numberOfChannels: 2, length: 216000, sampleRate: 48000 });
    expect(r.load).toHaveBeenCalledTimes(1);
    expect(r.context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(r.sources.map(s => s.start.mock.calls[0])).toEqual([[0, 1.25, .75], [.75, 0, 2], [2.75, 0, 1.75]]);
    expect(r.sources.every(s => !s.loop && s.buffer === r.sources[0].buffer)).toBe(true);
    const filters = r.context.createBiquadFilter.mock.results.map(result => result.value);
    expect(filters.map(n => [n.type, n.frequency.value])).toEqual([['lowshelf', 200], ['peaking', 1000], ['highshelf', 4000]]);
    expect(filters[1].Q.value).toBe(.7);
    expect(filters.map(n => n.gain.setValueAtTime.mock.calls)).toEqual([[[3, 0]], [[-2, 0]], [[1, 0]]]);
    expect(r.nodes.every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
  });
  it('uses immediate offline EQ and preserves smoothed live changes with the same bypass and clamps', () => {
    const r = runtime(), nodes = createTrackEQ(r.context as unknown as BaseAudioContext);
    configureTrackEQ(nodes, { enabled: true, lowDb: 99, midDb: -99, highDb: NaN }, 5);
    const filters = r.context.createBiquadFilter.mock.results.map(result => result.value);
    expect(filters.map(n => n.gain.setTargetAtTime.mock.calls)).toEqual([[[12, 5, .015]], [[-12, 5, .015]], [[0, 5, .015]]]);
    configureTrackEQ(nodes, undefined, 0, false);
    expect(filters.every(n => n.gain.setValueAtTime.mock.calls[0][0] === 0)).toBe(true);
  });
  it('truncates decoded EOF without stretching or inventing samples', async () => {
    const show = audioFixture(), r = runtime();
    r.context.decodeAudioData.mockResolvedValue(buffer(1.5));
    await renderOfflineAudio(show, { startS: 1.5, endS: 6 }, r);
    expect(r.sources.map(s => s.start.mock.calls[0])).toEqual([[0, 1.25, .25], [.75, 0, 1.5], [2.75, 0, 1.5]]);
  });
  it('does not allocate a context or read files for a silent or cancelled job', async () => {
    const show = audioFixture(), r = runtime();
    show.audioOutput = { muted: true, dimmed: false, volume: 1 };
    expect(await renderOfflineAudio(show, { startS: 0, endS: 8 }, r)).toBeNull();
    const controller = new AbortController(); controller.abort();
    await expect(renderOfflineAudio(show, { startS: 0, endS: 8 }, { ...r, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(r.createContext).not.toHaveBeenCalled(); expect(r.load).not.toHaveBeenCalled();
  });
  it('rejects oversized output, encoded input and decoded PCM before scheduling playback', async () => {
    const show = audioFixture(), r = runtime();
    await expect(renderOfflineAudio(show, { startS: 0, endS: 3600 }, r)).rejects.toThrow(/memory budget/);
    expect(r.createContext).not.toHaveBeenCalled();
    show.media[0].bytes = MAX_OFFLINE_AUDIO_BYTES;
    await expect(renderOfflineAudio(show, { startS: 0, endS: 8 }, r)).rejects.toThrow(/memory budget/);
    expect(r.load).not.toHaveBeenCalled();
    show.media[0].bytes = 16;
    r.context.decodeAudioData.mockResolvedValue(buffer(3600));
    await expect(renderOfflineAudio(show, { startS: 0, endS: 8 }, r)).rejects.toThrow(/Decoded soundtrack/);
    expect(r.context.startRendering).not.toHaveBeenCalled(); expect(r.sources).toHaveLength(0);
  });
  it('does not swallow unreadable media or decoder failures', async () => {
    const show = audioFixture(), r = runtime();
    r.load.mockRejectedValueOnce(new Error('Media missing'));
    await expect(renderOfflineAudio(show, { startS: 0, endS: 8 }, r)).rejects.toThrow('Media missing');
    r.context.decodeAudioData.mockRejectedValueOnce(new Error('Invalid codec'));
    await expect(renderOfflineAudio(show, { startS: 0, endS: 8 }, r)).rejects.toThrow('Invalid codec');
    expect(r.context.startRendering).not.toHaveBeenCalled();
  });
  it('keeps the export media snapshot stable while the editor changes during a read', async () => {
    const show = audioFixture(), r = runtime();
    show.media.push({ ...show.media[0], id: 'second', file: 'second.wav' });
    show.visuals!.push({ ...show.visuals![0], id: 'zz-second-use', source: { mediaId: 'second', rect: [0, 0, 1, 1] } });
    const files: string[] = [];
    await renderOfflineAudio(show, { startS: 0, endS: 8 }, { ...r, load: async media => {
      files.push(media.file);
      show.media[1].file = 'edited-after-start.wav';
      show.tracks![1].volume = .1;
      return new ArrayBuffer(16);
    } });
    expect(files).toEqual(['tone.wav', 'second.wav']);
    const voiceGains = r.context.createGain.mock.results.map(result => result.value).slice(1);
    expect(voiceGains.every(n => n.gain.setValueAtTime.mock.calls[0][0] === .8)).toBe(true);
  });
  it.each(['load', 'decode', 'render'] as const)('cancels promptly during %s and discards late native completion', async phase => {
    const show = audioFixture(), r = runtime(), controller = new AbortController();
    const reading = deferred<ArrayBuffer>(), native = deferred<AudioBuffer>();
    if (phase === 'load') r.load.mockReturnValue(reading.promise);
    if (phase === 'decode') r.context.decodeAudioData.mockReturnValue(native.promise);
    if (phase === 'render') r.context.startRendering.mockReturnValue(native.promise);
    const result = renderOfflineAudio(show, { startS: 0, endS: 8 }, { ...r, signal: controller.signal });
    await vi.waitFor(() => expect(phase === 'load' ? r.load : phase === 'decode' ? r.context.decodeAudioData : r.context.startRendering).toHaveBeenCalled());
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    reading.resolve(new ArrayBuffer(16)); native.resolve(r.rendered);
    await Promise.resolve();
    if (phase !== 'render') expect(r.context.startRendering).not.toHaveBeenCalled();
    expect(r.nodes.every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
  });
  it('releases every scheduled node if the native renderer fails', async () => {
    const show = audioFixture(), r = runtime();
    r.context.startRendering.mockRejectedValue(new Error('Native rendering failed'));
    await expect(renderOfflineAudio(show, { startS: 0, endS: 8 }, r)).rejects.toThrow('Native rendering failed');
    expect(r.nodes.length).toBeGreaterThan(0);
    expect(r.nodes.every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
  });
  it('bounds hung file reads and cleans the preparation deadline after completion', async () => {
    vi.useFakeTimers();
    try {
      const r = runtime(), pending = deferred<ArrayBuffer>();
      r.load.mockReturnValue(pending.promise);
      const result = renderOfflineAudio(audioFixture(), { startS: 0, endS: 8 }, { ...r, timeoutMs: 10 });
      const rejection = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(10);
      await rejection;
      expect(vi.getTimerCount()).toBe(0);
      expect(r.context.startRendering).not.toHaveBeenCalled();
      pending.reject(new Error('Late file failure'));
      await Promise.resolve();
      r.load.mockResolvedValue(new ArrayBuffer(16));
      await renderOfflineAudio(audioFixture(), { startS: 0, endS: 8 }, r);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
