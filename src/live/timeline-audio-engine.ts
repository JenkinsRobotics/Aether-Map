/** Track EQ is measured in dB; fixed bands keep the small mixer easy to use. */
export interface TrackEQ { enabled: boolean; lowDb: number; midDb: number; highDb: number }
export const FLAT_EQ: TrackEQ = { enabled: false, lowDb: 0, midDb: 0, highDb: 0 };
export function readTrackEQ(value: unknown): TrackEQ {
  const v = value && typeof value === 'object' ? value as Partial<TrackEQ> : {};
  const gain = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.min(12, Math.max(-12, n)) : 0;
  return { enabled: v.enabled === true, lowDb: gain(v.lowDb), midDb: gain(v.midDb), highDb: gain(v.highDb) };
}
export function peakDb(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return Math.max(-60, 20 * Math.log10(Math.max(peak, .001)));
}
/** The live mixer and OfflineAudioContext share these exact Web Audio bands. */
export function createTrackEQ(context: BaseAudioContext) {
  const input = context.createGain(), low = context.createBiquadFilter(), mid = context.createBiquadFilter(), high = context.createBiquadFilter();
  low.type = 'lowshelf'; low.frequency.value = 200;
  mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = .7;
  high.type = 'highshelf'; high.frequency.value = 4000;
  input.connect(low).connect(mid).connect(high);
  return { input, low, mid, high };
}
export function configureTrackEQ(nodes: ReturnType<typeof createTrackEQ>, input: TrackEQ | undefined, timeS: number, smooth = true) {
  const eq = readTrackEQ(input);
  for (const [node, gain] of [[nodes.low, eq.lowDb], [nodes.mid, eq.midDb], [nodes.high, eq.highDb]] as const) {
    if (smooth) node.gain.setTargetAtTime(eq.enabled ? gain : 0, timeS, .015);
    else node.gain.setValueAtTime(eq.enabled ? gain : 0, timeS);
  }
}
interface Channel { input: GainNode; low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode; meter: AnalyserNode; samples: Float32Array<ArrayBuffer>; voices: number }
/** One graph per editor/output document, one EQ chain per soundtrack track. */
export class TimelineAudioEngine {
  private context: AudioContext | null = null;
  private channels = new Map<string, Channel>();
  private sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private levels: Record<string, number> = {};
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.levels;
  private publish(levels: Record<string, number>) {
    // Paused/silent tracks need no meter-driven React renders.
    if (Object.keys(levels).length === Object.keys(this.levels).length && Object.entries(levels).every(([id, value]) => value === this.levels[id])) return;
    this.levels = levels; this.listeners.forEach(fn => fn());
  }
  connect(element: HTMLMediaElement, trackID: string): () => void {
    this.context ??= new AudioContext();
    const context = this.context;
    let channel = this.channels.get(trackID);
    if (!channel) {
      const { input, low, mid, high } = createTrackEQ(context), meter = context.createAnalyser();
      meter.fftSize = 1024;
      high.connect(meter).connect(context.destination);
      channel = { input, low, mid, high, meter, samples: new Float32Array(meter.fftSize), voices: 0 };
      this.channels.set(trackID, channel);
    }
    let source = this.sources.get(element);
    if (!source) { source = context.createMediaElementSource(element); this.sources.set(element, source); }
    source.connect(channel.input); channel.voices++;
    this.timer ??= setInterval(() => {
      const levels: Record<string, number> = {};
      for (const [id, c] of this.channels) {
        c.meter.getFloatTimeDomainData(c.samples);
        levels[id] = c.voices && context.state === 'running' ? Math.round(peakDb(c.samples) * 10) / 10 : -60;
      }
      this.publish(levels);
    }, 80);
    return () => {
      source.disconnect(); channel.voices = Math.max(0, channel.voices - 1);
      if (!channel.voices) this.publish({ ...this.levels, [trackID]: -60 });
      if (![...this.channels.values()].some(c => c.voices) && this.timer) { clearInterval(this.timer); this.timer = null; }
    };
  }
  configure(trackID: string, input?: TrackEQ) {
    const channel = this.channels.get(trackID); if (!channel || !this.context) return;
    configureTrackEQ(channel, input, this.context.currentTime);
  }
  async resume() { if (this.context?.state === 'suspended') await this.context.resume(); }
  dispose() {
    if (this.timer) clearInterval(this.timer); this.timer = null;
    for (const c of this.channels.values()) { c.input.disconnect(); c.low.disconnect(); c.mid.disconnect(); c.high.disconnect(); c.meter.disconnect(); }
    this.channels.clear();
    void this.context?.close(); this.context = null;
    this.publish({});
  }
}
