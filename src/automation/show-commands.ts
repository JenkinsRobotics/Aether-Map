/** Show-timeline automation: the same edits the Show workspace makes. No IO. */
import { nextId, type MapShow } from '../document';
import { MAIN_TIMELINE } from '../timelines';
import { activeShow, defaultShowTimeline, newSceneClip, normalizeShowTimeline, withActiveShow, type CueAction, type CueTrigger, type ShowTimeline } from '../show-timeline';

const timelineOf = (show: MapShow): ShowTimeline => activeShow(show) ?? defaultShowTimeline(show);
const withTimeline = (show: MapShow, timeline: ShowTimeline): MapShow => withActiveShow(normalizeShowTimeline(show), program => ({ ...program, ...timeline }));

export function describeShowTimeline(show: MapShow) {
  const timeline = timelineOf(show);
  return { active_show_id: activeShow(show)?.id, player_show_id: (show.playerShowID ?? show.shows?.[0]?.id), shows: (show.shows ?? []).map(p => ({ id: p.id, name: p.name })),
    duration_s: timeline.durationS,
    tracks: timeline.tracks.map(t => ({ canvas_id: t.canvasID, clips: t.clips.map(c => ({ id: c.id, scene_id: c.sceneID, start_s: c.startS, duration_s: c.durationS, in_s: c.inS, loop: !!c.loop })) })),
    cues: timeline.cues.map(c => ({ id: c.id, name: c.name, trigger: c.trigger, action: c.action, at_s: c.atS, to_s: c.toS, control: c.control, times: c.times, condition: c.when })) };
}

export function addShowClip(show: MapShow, args: Record<string, unknown>): MapShow {
  const timeline = timelineOf(show), canvasID = String(args.canvas_id), sceneID = String(args.scene_id);
  if (!timeline.tracks.some(t => t.canvasID === canvasID)) throw Error('Canvas not found. Inspect the show first.');
  if (sceneID !== MAIN_TIMELINE && !show.timelines?.some(t => t.id === sceneID)) throw Error('Scene not found. Use a timeline id from inspect, or main.');
  const clip = { ...newSceneClip(sceneID, Number(args.start_s), Number(args.duration_s)), loop: args.loop !== 'no' };
  return withTimeline(show, { ...timeline, tracks: timeline.tracks.map(t => t.canvasID === canvasID ? { ...t, clips: [...t.clips, clip] } : t),
    durationS: Math.max(timeline.durationS, clip.startS + clip.durationS) });
}

export function addShowCue(show: MapShow, args: Record<string, unknown>): MapShow {
  const timeline = timelineOf(show), trigger = args.trigger as CueTrigger, action = args.cue_action as CueAction;
  if (trigger === 'timeline' && typeof args.at_s !== 'number') throw Error('A timeline cue needs at_s.');
  if (trigger === 'midi' && typeof args.control !== 'number') throw Error('A MIDI cue needs control (CC number).');
  if (action === 'jump' && typeof args.to_s !== 'number') throw Error('A jump cue needs to_s.');
  const cue = { id: nextId('cue'), name: String(args.name).trim(), trigger, action,
    ...(typeof args.at_s === 'number' ? { atS: args.at_s } : {}), ...(typeof args.to_s === 'number' ? { toS: args.to_s } : {}), ...(typeof args.control === 'number' ? { control: args.control } : {}),
    ...(typeof args.times === 'number' ? { times: args.times } : {}),
    ...(typeof args.condition_control === 'number' ? { when: { control: args.condition_control, above: typeof args.condition_above === 'number' ? args.condition_above : 0 } } : {}) };
  return withTimeline(show, { ...timeline, cues: [...timeline.cues, cue] });
}
