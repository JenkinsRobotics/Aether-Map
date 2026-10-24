import { masterAudioGain } from './audio-output';
import { scheduledVisuals } from './timelines';
import { sceneLayers, type MapShow } from './document';
import { mediaTime } from './clips';
import { visualSource } from './media-pool';
import type { VisualTrack } from './media-pool';

/** Shared by live playback and offline soundtrack scheduling. */
export function timelineTrackGain(show: MapShow, track: VisualTrack, gain = 1): number {
  return masterAudioGain(show.audioOutput) * gain * Math.min(1, Math.max(0, track.volume ?? 1)) * Math.max(0, ...sceneLayers(show).filter(l => track.targets.some(t => t.sceneID === l.scene.id)).map(l => l.opacity));
}

/** One voice per clip, independent of the count of surface targets. */
export function timelineAudio(show: MapShow, timeS: number) {
  return scheduledVisuals(show, timeS).flatMap(({ visual: clip, track, timeS, gain }) => {
    if (!track || track.kind !== 'audio' || clip.enabled === false || timeS < clip.startS || timeS >= clip.startS + clip.durationS) return [];
    const media = show.media.find(m => m.id === visualSource(show, clip).mediaId);
    if (!media || media.kind === 'image') return [];
    const volume = timelineTrackGain(show, track, gain);
    return [{ id: clip.id, trackID: track.id, eq: track.eq, mediaID: media.id, timeS: mediaTime(clip, media, timeS), volume, loop: false }];
  });
}
