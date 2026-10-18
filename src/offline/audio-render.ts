import type { MapShow, MediaRef } from '../document';
import { configureTrackEQ, createTrackEQ } from '../live/timeline-audio-engine';
import { offlineAudioPlan } from './audio-plan';
import type { ExportRange } from './export-plan';

export const MAX_OFFLINE_AUDIO_BYTES = 256 * 1024 * 1024;
export interface OfflineAudioOptions {
  signal?: AbortSignal;
  sampleRate?: 44100 | 48000;
  /** Whole preparation deadline, including file reads, decoding and rendering. */
  timeoutMs?: number;
  /** Runtime adapter reads product media; this module starts no network or input device. */
  load: (media: MediaRef, signal?: AbortSignal) => Promise<ArrayBuffer>;
  /** Injectable for runtime qualification; production uses the browser Web Audio engine. */
  createContext?: (options: OfflineAudioContextOptions) => OfflineAudioContext;
}

function check(signal?: AbortSignal) { signal?.throwIfAborted(); }
/** Browser decoding/rendering itself has no abort API. Stop the job immediately,
 * detach its graph, and discard any eventual native result after cancellation. */
async function abortable<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Export cancelled.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

/** Render the real soundtrack graph without a playback window or speaker output.
 * Buffers decode once per asset and repeated clips share them. Silence at EOF and
 * held nested clocks is intentional; missing/undecodable media fails the export.
 * Audio larger than the memory budget is refused, never silently truncated. */
export async function renderOfflineAudio(show: MapShow, range: ExportRange, options: OfflineAudioOptions): Promise<AudioBuffer | null> {
  check(options.signal);
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error('Invalid soundtrack preparation deadline.');
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Soundtrack preparation timed out. Try a shorter export.', 'TimeoutError')), timeoutMs);
  try {
    return await renderSoundtrack(show, range, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

async function renderSoundtrack(show: MapShow, range: ExportRange, options: OfflineAudioOptions): Promise<AudioBuffer | null> {
  check(options.signal);
  const plan = offlineAudioPlan(show, range);
  if (!plan.length) return null;
  const mediaByID = new Map(show.media.map(media => [media.id, { ...media }]));
  const sampleRate = options.sampleRate ?? 48000;
  if (sampleRate !== 44100 && sampleRate !== 48000) throw new Error('Unsupported soundtrack sample rate.');
  const sampleCount = Math.ceil((range.endS - range.startS) * sampleRate);
  const outputBytes = sampleCount * 2 * Float32Array.BYTES_PER_ELEMENT;
  if (outputBytes >= MAX_OFFLINE_AUDIO_BYTES) throw new Error('Soundtrack exceeds the offline audio memory budget. Export a shorter interval.');
  const context = options.createContext?.({ numberOfChannels: 2, length: sampleCount, sampleRate }) ?? new OfflineAudioContext(2, sampleCount, sampleRate);
  const buffers = new Map<string, AudioBuffer>();
  const nodes: AudioNode[] = [];
  let usedBytes = outputBytes;
  try {
    for (const id of new Set(plan.map(segment => segment.mediaID))) {
      check(options.signal);
      const media = mediaByID.get(id);
      if (!media) throw new Error(`Missing soundtrack media: ${id}`);
      // Include the decoder's input copy in the known-allocation budget.
      if (media.bytes > (MAX_OFFLINE_AUDIO_BYTES - usedBytes) / 2) throw new Error(`Soundtrack media exceeds the offline audio memory budget: ${media.name}`);
      const encoded = await abortable(options.load(media, options.signal), options.signal);
      check(options.signal);
      if (encoded.byteLength > (MAX_OFFLINE_AUDIO_BYTES - usedBytes) / 2) throw new Error(`Soundtrack media exceeds the offline audio memory budget: ${media.name}`);
      const buffer = await abortable(context.decodeAudioData(encoded.slice(0)), options.signal);
      check(options.signal);
      if (!buffer.length || buffer.numberOfChannels < 1 || buffer.numberOfChannels > 32) throw new Error(`Invalid decoded soundtrack: ${media.name}`);
      usedBytes += buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
      if (usedBytes + encoded.byteLength > MAX_OFFLINE_AUDIO_BYTES) throw new Error(`Decoded soundtrack exceeds the offline audio memory budget: ${media.name}`);
      buffers.set(id, buffer);
    }
    const channels = new Map<string, ReturnType<typeof createTrackEQ>>();
    for (const segment of plan) {
      check(options.signal);
      const buffer = buffers.get(segment.mediaID)!;
      const duration = Math.min(segment.endS - segment.startS, buffer.duration - segment.sourceStartS);
      if (!(duration > 0)) continue;
      let eq = channels.get(segment.trackID);
      if (!eq) {
        eq = createTrackEQ(context);
        nodes.push(eq.input, eq.low, eq.mid, eq.high);
        configureTrackEQ(eq, segment.eq, 0, false);
        eq.high.connect(context.destination);
        channels.set(segment.trackID, eq);
      }
      const source = context.createBufferSource(), gain = context.createGain();
      nodes.push(source, gain);
      source.buffer = buffer;
      source.loop = false;
      gain.gain.setValueAtTime(segment.volume, 0);
      source.connect(gain).connect(eq.input);
      source.start(segment.startS, segment.sourceStartS, duration);
    }
    check(options.signal);
    const audio = await abortable(context.startRendering(), options.signal);
    check(options.signal);
    return audio;
  } finally {
    for (const node of nodes) node.disconnect();
    buffers.clear();
  }
}
