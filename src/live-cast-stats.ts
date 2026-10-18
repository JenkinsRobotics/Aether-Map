/** W3C WebRTC stats. Missing measurements remain missing, never fabricated zeros. */
export interface CastDiagnostics {
  audio: boolean;
  width?: number;
  height?: number;
  fps?: number;
  videoMbps?: number;
  roundTripMs?: number;
  limitation?: 'cpu' | 'bandwidth' | 'other';
}
export type CastCounters = Map<string, { bytes: number; timestamp: number }>;
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function castStatistics(report: RTCStatsReport, previous: CastCounters, audio: boolean): {
  diagnostics: CastDiagnostics; counters: CastCounters;
} {
  const diagnostics: CastDiagnostics = { audio }, counters: CastCounters = new Map();
  let bitrate = 0, measured = false, largest = -1;
  report.forEach(stat => {
    if (stat.type === 'transport' && typeof stat.selectedCandidatePairId === 'string') {
      const pair = report.get(stat.selectedCandidatePairId);
      if (pair?.state === 'succeeded' && nonnegative(pair.currentRoundTripTime)) diagnostics.roundTripMs = pair.currentRoundTripTime * 1000;
    }
    if (stat.type !== 'outbound-rtp' || (stat.kind ?? stat.mediaType) !== 'video' || stat.isRemote) return;
    if (nonnegative(stat.bytesSent) && nonnegative(stat.timestamp)) {
      counters.set(stat.id, { bytes: stat.bytesSent, timestamp: stat.timestamp });
      const prior = previous.get(stat.id);
      if (prior && stat.timestamp > prior.timestamp && stat.bytesSent >= prior.bytes) {
        bitrate += (stat.bytesSent - prior.bytes) * 8 / (stat.timestamp - prior.timestamp) / 1000;
        measured = true;
      }
    }
    if (nonnegative(stat.frameWidth) && nonnegative(stat.frameHeight) && stat.frameWidth * stat.frameHeight > largest) {
      largest = stat.frameWidth * stat.frameHeight;
      diagnostics.width = stat.frameWidth; diagnostics.height = stat.frameHeight;
      diagnostics.fps = nonnegative(stat.framesPerSecond) ? stat.framesPerSecond : undefined;
    } else if (largest < 0 && nonnegative(stat.framesPerSecond)) diagnostics.fps = stat.framesPerSecond;
    const reason = stat.qualityLimitationReason;
    if (reason === 'bandwidth' || (reason === 'cpu' && diagnostics.limitation !== 'bandwidth') || (reason === 'other' && !diagnostics.limitation)) diagnostics.limitation = reason;
  });
  if (measured) diagnostics.videoMbps = bitrate;
  return { diagnostics, counters };
}
