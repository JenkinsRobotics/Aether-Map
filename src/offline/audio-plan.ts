import type { MapShow } from '../document';
import { visualSource } from '../media-pool';
import { currentTimelineID, timelineTracks, timelineVisuals } from '../timelines';
import { timelineTrackGain } from '../timeline-audio';
import { visualClockSegments } from '../visual-clock';
import { readTrackEQ, type TrackEQ } from '../live/timeline-audio-engine';
import { validateExportRange, type ExportRange } from './export-plan';

export interface OfflineAudioSegment {
  voiceID: string; trackID: string; mediaID: string; eq: TrackEQ;
  /** Times relative to the beginning of the exported file. */
  startS: number; endS: number; sourceStartS: number; volume: number;
}
export const MAX_AUDIO_SEGMENTS = 16384;

/** Project the saved schedule into finite forward-playing audio intervals.
 * A nested timeline holding its last picture has no advancing audio clock.
 * Muted/solo/scene mixing and source time use the live evaluator's helpers.
 * This is a projection only: no flattened clips or second document are saved. */
export function offlineAudioPlan(show: MapShow, range: ExportRange): OfflineAudioSegment[] {
  validateExportRange(range);
  const result: OfflineAudioSegment[] = [];
  let work = 0;
  const consume = () => { if (++work > MAX_AUDIO_SEGMENTS) throw new Error('Soundtrack exceeds the offline segment budget.'); };
  // timeline time = file time + offset. Only advancing pieces are visited.
  const visit = (timelineID: string, fileStart: number, fileEnd: number, offset: number, path: string[], ancestors: string[]) => {
    if (ancestors.includes(timelineID)) throw new Error('Cannot export a cyclic timeline.');
    if (ancestors.length >= 64) throw new Error('Nested timeline exceeds the offline depth budget.');
    const tracks = timelineTracks(show, timelineID);
    const solo = tracks.some(t => t.kind === 'audio' && t.enabled && t.solo);
    for (const visual of timelineVisuals(show, timelineID)) {
      consume();
      const track = tracks.find(t => t.id === visual.trackID);
      if (track?.enabled === false || visual.enabled === false || track?.kind === 'audio' && solo && !track.solo) continue;
      const startS = Math.max(fileStart + offset, visual.startS);
      const endS = Math.min(fileEnd + offset, visual.startS + visual.durationS);
      if (!(endS > startS)) continue;
      const clockVisual = visual.timelineRefID ? visual : { ...visual, continuous: false };
      if (!visual.timelineRefID && track?.kind !== 'audio') continue;
      if (visual.timelineRefID && !show.timelines?.some(t => t.id === visual.timelineRefID)) throw new Error('Cannot export a missing child timeline.');
      const pieces = visualClockSegments(show, clockVisual, startS, endS, MAX_AUDIO_SEGMENTS - work || 1);
      for (const piece of pieces) {
        consume();
        if (!piece.rate) continue;
        const begin = piece.startS - offset, end = piece.endS - offset;
        if (visual.timelineRefID) {
          visit(visual.timelineRefID, begin, end, piece.sourceStartS - begin, [...path, visual.id, visual.timelineRefID], [...ancestors, timelineID]);
        } else if (track) {
          if (visual.assetID && !visual.source && !show.pool?.some(asset => asset.id === visual.assetID)) throw new Error(`Missing soundtrack source: ${visual.assetID}`);
          const mediaID = visualSource(show, visual).mediaId;
          const media = show.media.find(m => m.id === mediaID);
          if (mediaID && !media) throw new Error(`Missing soundtrack media: ${mediaID}`);
          if (!media || media.kind === 'image') continue;
          const volume = timelineTrackGain(show, track);
          if (volume <= 0) continue;
          result.push({ voiceID: [...path, visual.id].join('/'), trackID: track.id, mediaID: media.id,
            startS: begin, endS: end, sourceStartS: Math.max(0, piece.sourceStartS), volume, eq: readTrackEQ(track.eq) });
        }
      }
    }
  };
  visit(currentTimelineID(show), 0, range.endS - range.startS, range.startS, [], []);
  return result.sort((a, b) => a.startS - b.startS || a.voiceID.localeCompare(b.voiceID));
}
