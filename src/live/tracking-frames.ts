import type { HandSample, TrackerSource } from "../features/types";
/** Recordings use scene time; live input stays live even while the playhead is paused. */
export function trackingHands(source: TrackerSource, timeS: number, live: HandSample[]): HandSample[] {
  let hands = live;
  const rec = source.recording;
  if (rec?.frames.length) {
    const at = rec.loop ? Math.max(0, timeS) % rec.durationS : Math.min(timeS, rec.durationS);
    let low = 0, high = rec.frames.length;
    while (low < high) { const mid = (low + high) >>> 1; if (rec.frames[mid].timeS <= at) low = mid + 1; else high = mid; }
    hands = low ? rec.frames[low - 1].hands : [];
  }
  return hands.filter((hand) => source.hand === "both" || hand.side.toLowerCase() === source.hand).slice(0, source.handCount);
}
