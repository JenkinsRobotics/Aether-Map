import type { Scene } from './document';
/** Visible time range grows with authored content and the playhead, never ends playback. */
export function timelineRange(scene: Scene, timeS: number): number {
  const end = Math.max(scene.durationS, 1, timeS + .001, ...scene.surfaces.flatMap(surface => [
    ...surface.clips.map(clip => clip.startS + clip.durationS), ...surface.cues.map(cue => cue.timeS),
    ...Object.values(surface.animation ?? {}).flatMap(keys => keys?.map(key => key.timeS) ?? []),
  ]));
  return end <= scene.durationS ? scene.durationS : Math.ceil(end / 60) * 60;
}
